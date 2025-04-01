# /home/zvallarino/AI_AWS_PC/Drugs-Side-Effect-Classification/cdk_backend/lambda/lambdaXbedrock/index.py

import os
import json
import boto3
import re
import logging

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# --- Determine AWS Region ---
lambda_region = os.environ.get('AWS_REGION', 'us-east-1')
logger.info(f"Using AWS Region: {lambda_region}")

# --- Bedrock Agent Runtime Client (for Knowledge Base) ---
agent_runtime_client = None
try:
    agent_runtime_client = boto3.client("bedrock-agent-runtime", region_name=lambda_region)
except Exception as e:
    logger.error(f"Error initializing bedrock-agent-runtime client: {e}")

# --- Bedrock Runtime Client (for LLM Converse API) ---
bedrock_runtime_client = None
try:
    bedrock_runtime_client = boto3.client(service_name="bedrock-runtime", region_name=lambda_region)
except Exception as e:
    logger.error(f"Error initializing bedrock-runtime client: {e}")

# --- Knowledge Base Retrieval Function ---
def knowledge_base_retrieval(prompt, kb_id):
    """
    Retrieves relevant information from the specified Knowledge Base.
    """
    if not agent_runtime_client:
        logger.error("Bedrock Agent Runtime client not initialized.")
        return {"retrievalResults": []}
    query = {"text": prompt}
    try:
        logger.info(f"Retrieving from Knowledge Base ID: {kb_id} with prompt: '{prompt}'")
        kb_response = agent_runtime_client.retrieve(
            knowledgeBaseId=kb_id,
            retrievalQuery=query
        )
        logger.info(f"KB Response received (first 500 chars): {str(kb_response)[:500]}")
        return kb_response
    except Exception as e:
        logger.error(f"Error during Knowledge Base retrieval: {e}")
        # <<< MODIFICATION: Log the specific exception >>>
        logger.exception("Knowledge Base Retrieve Exception Details:")
        return {"retrievalResults": []}


# --- Source Extraction Function ---
def extract_sources(kb_results):
    """
    Extracts and formats source URLs, scores, and page numbers from KB results.
    """
    processed_sources = []
    logger.info(f"Extracting sources from KB results (first 500 chars): {str(kb_results)[:500]}")
    for result in kb_results.get('retrievalResults', []):
        location = result.get("location", {})
        metadata = result.get("metadata", {})
        score = result.get('score')
        source_uri = None
        if location.get("type") == "S3":
            source_uri = location.get("s3Location", {}).get("uri")
        if not source_uri:
             source_uri = metadata.get('x-amz-bedrock-kb-source-uri') # Example metadata key
        page_number = metadata.get('x-amz-bedrock-kb-document-page-number') # Example metadata key

        if source_uri:
            processed_uri = re.sub(r'^s3://([^/]+)/(.*)', r'https://\1.s3.amazonaws.com/\2', source_uri)
            source_info = {"url": processed_uri, "score": score}
            if page_number:
                source_info["page"] = page_number
            processed_sources.append(source_info)
        else:
            logger.warning(f"Could not extract source_uri from result: {result}")
    logger.info(f"Processed sources: {processed_sources}")
    return processed_sources

# --- Relevance Check Function ---
def is_relevant(sources, threshold=0.4):
    """
    Checks if the top source score is above a given threshold.
    """
    if not sources:
        logger.info("No sources found, considered not relevant.")
        return False
    # Ensure score exists and handle potential None values before comparison
    top_score = sources[0].get('score')
    if top_score is None:
        logger.info("Top source score is missing or None, considered not relevant.")
        return False
    relevant = top_score > threshold
    logger.info(f"Top source score: {top_score}. Relevant (>{threshold}): {relevant}")
    return relevant

# --- History Transformation Function ---
def transform_history(history, limit=25):
    """
    Transforms the chat history received from the frontend into the
    alternating user/assistant format required by the Bedrock Converse API.
    It includes the latest user message in the transformation.
    """
    transformed = []
    last_role = None
    user_found, assistant_found = False, False
    pending_sources_content = None

    logger.info(f"Transforming raw history (last {limit} entries): {history[-limit:]}")

    for entry in history[-limit:]:
        message_type = entry.get('type')
        message_content = entry.get('message', '')

        # Skip empty messages, except potentially SOURCES placeholder
        if not message_content and message_type != 'SOURCES':
            logger.debug(f"Skipping entry with empty message content: {entry}")
            continue

        # Handle SOURCES message type - these are usually added by the bot after its TEXT response
        if message_type == 'SOURCES':
            # Store the sources content to potentially append later to the preceding assistant message
            pending_sources_content = message_content
            logger.debug(f"Stored pending sources content.")
            continue # Don't add SOURCES message itself to transformed history yet

        # Determine role for TEXT messages
        if message_type == 'TEXT':
            role = 'user' if entry.get('sentBy') == 'USER' else 'assistant'

            if role == 'user': user_found = True
            elif role == 'assistant': assistant_found = True

            # If the *previous* message added was an assistant message and we just encountered sources,
            # append the sources to that *previous* assistant message content.
            if pending_sources_content and last_role == 'assistant' and transformed:
                logger.debug(f"Appending stored sources to previous assistant message.")
                transformed[-1]['content'][0]['text'] += f"\n\nSources:\n{pending_sources_content}"
                pending_sources_content = None # Clear pending sources

            # Handle consecutive roles: Merge user messages, skip consecutive assistant for now
            if role == last_role:
                if role == 'user':
                    logger.debug(f"Merging consecutive user message.")
                    transformed[-1]['content'][0]['text'] += f"\n{message_content}" # Merge
                    continue # Don't add a new block
                else: # Consecutive assistant messages
                     logger.debug(f"Skipping consecutive assistant message.")
                     continue # Skip

            # Add the current message to transformed history
            transformed.append({
                "role": role,
                "content": [{"text": message_content}]
            })
            last_role = role # Update the last role added
            logger.debug(f"Added message: Role={role}, Content='{message_content[:50]}...'")

    # Final check: If there are leftover pending sources after the loop (e.g., history ends with SOURCES)
    # and the last actual message was from the assistant, append the sources.
    if pending_sources_content and last_role == 'assistant' and transformed:
        logger.debug(f"Appending leftover pending sources to the final assistant message.")
        transformed[-1]['content'][0]['text'] += f"\n\nSources:\n{pending_sources_content}"

    # Bedrock Converse API requires alternating roles, starting with user.
    # If the transformed history starts with 'assistant', remove it.
    if transformed and transformed[0]['role'] == 'assistant':
        logger.warning("History starts with 'assistant', removing the first entry.")
        transformed.pop(0)

    # Ensure it doesn't end with assistant (Converse API needs last message to be user)
    # Although our main handler logic relies on this ending with user, let's double-check
    if transformed and transformed[-1]['role'] == 'assistant':
        logger.warning("History transformation ended with 'assistant', removing the last entry.")
        transformed.pop()


    # Check if only one role type is present after transformation, which might indicate issues
    # (This check might be less critical now with the merging/skipping logic)
    # final_roles = {msg['role'] for msg in transformed}
    # if len(final_roles) == 1 and len(transformed) > 1:
    #      logger.warning(f"History transformation resulted in only one role type: {final_roles}. API might reject.")

    logger.info(f"Result of transform_history: {transformed}")
    return transformed


# --- Main Lambda Handler ---
def lambda_handler(event, context):
    logger.info(f"Received event: {json.dumps(event)}")

    connectionId = event.get("connectionId")
    prompt = event.get("prompt") # Current user prompt
    history_raw = event.get("history", [])

    # --- Input Validation ---
    if not connectionId:
        logger.error("Missing 'connectionId' in event.")
        return {'statusCode': 400, 'body': json.dumps({'error': 'Missing connectionId.'})}
    # Allow empty prompt if history exists? For now, require prompt.
    if not prompt and not history_raw: # Check if prompt is empty AND history is empty
        logger.error("Missing 'prompt' in event and history is empty.")
        return {'statusCode': 400, 'body': json.dumps({'error': 'No prompt provided.'})}
    # <<< MODIFICATION: Log if prompt is empty but history exists >>>
    elif not prompt:
         logger.warning("Prompt is empty, relying on history.")


    # --- Environment Variable Checks ---
    kb_id = os.environ.get('KNOWLEDGE_BASE_ID')
    websocket_callback_url = os.environ.get('URL')

    if not kb_id:
        logger.error("Environment variable 'KNOWLEDGE_BASE_ID' is not set.")
        # Consider sending error back before returning
        return {'statusCode': 500, 'body': json.dumps({'error': 'Server configuration error (KB ID missing).'})}
    if not websocket_callback_url:
        logger.error("Environment variable 'URL' (WebSocket Callback URL) is not set.")
        return {'statusCode': 500, 'body': json.dumps({'error': 'Server configuration error (Callback URL missing).'})}

    # --- Initialize API Gateway Client ---
    gateway_client = None
    try:
        gateway_client = boto3.client("apigatewaymanagementapi", endpoint_url=websocket_callback_url)
    except Exception as e:
         logger.error(f"Failed to create ApiGatewayManagementApi client with endpoint {websocket_callback_url}: {e}")
         # Cannot send messages back without this client
         return {'statusCode': 500, 'body': json.dumps({'error': 'Server configuration error (API Gateway client setup failed).'})}

    # --- History Validation ---
    if not isinstance(history_raw, list):
        logger.warning(f"Received 'history' is not a list (type: {type(history_raw)}). Using empty history.")
        history = []
    else:
        history = history_raw # Use the raw history as received

    # --- KB Retrieval ---
    logger.info(f"Querying Knowledge Base ID: [{kb_id}]...")
    # <<< MODIFICATION: Use current prompt for KB Search >>>
    kb_response = knowledge_base_retrieval(prompt if prompt else " ", kb_id) # Use current prompt, or space if empty

    # --- Source Processing & RAG Context ---
    sources = extract_sources(kb_response)
    is_kb_relevant = is_relevant(sources)
    rag_info = ""
    if is_kb_relevant:
        logger.info("KB results are relevant. Preparing RAG context.")
        for result in kb_response.get("retrievalResults", []):
            rag_info += result.get("content", {}).get("text", "") + "\n\n"
    else:
        logger.info("KB results are not relevant or no sources found.")

    # --- Prepare Messages for Bedrock ---

    # <<< MODIFICATION: Use transform_history for the *entire* history list received >>>
    # This function should now return the correct alternating structure ending with the latest user message
    messages_for_api = transform_history(history)

    # <<< MODIFICATION: Inject RAG context into the *last* message if relevant >>>
    # This assumes transform_history correctly places the current prompt as the last message
    if messages_for_api: # Check if list is not empty
         if is_kb_relevant:
             if messages_for_api[-1]['role'] == 'user':
                 original_prompt_text = messages_for_api[-1]['content'][0]['text']
                 # Construct the prompt with RAG prefix
                 rag_prompt_text = f"""Use the following information from the knowledge source to answer the question. Answer ONLY based on this information. If the information isn't sufficient, say you don't have enough information.

                 Knowledge Source Information:
                 {rag_info}

                 User's question: {original_prompt_text}"""
                 # Update the text in the last message
                 messages_for_api[-1]['content'][0]['text'] = rag_prompt_text
                 logger.info("Added RAG context to the final user message in history.")
             else:
                  # This case should ideally not happen if transform_history is correct
                  logger.warning("Transformed history did not end with user role. Cannot inject RAG context.")
         # If not is_kb_relevant, messages_for_api is used as is (already contains the final prompt)

    else: # Handle case where transform_history might return empty (e.g., invalid input history)
         logger.warning("transform_history returned empty list. Sending only the current prompt.")
         # Construct the prompt text, adding RAG if relevant even for the first turn
         llm_prompt_text = prompt if prompt else " "
         if is_kb_relevant:
              rag_prompt_text = f"""Use the following information...
              Knowledge Source Information:\n{rag_info}\nUser's question: {llm_prompt_text}"""
              llm_prompt_text = rag_prompt_text
         messages_for_api = [{"role": "user", "content": [{"text": llm_prompt_text}]}]

    # Add system prompt
    system_prompt = "You are a helpful assistant."
    system_prompts = [{"text": system_prompt}] if system_prompt else None

    logger.info(f"Sending query to LLM. System Prompt: {system_prompt}. Messages: {json.dumps(messages_for_api)}")

    # --- Invoke Bedrock & Stream Response ---
    if not bedrock_runtime_client:
         logger.error("Bedrock Runtime client not initialized. Cannot call Converse API.")
         error_data = {'statusCode': 500, 'type': 'error', 'text': 'Server error (Bedrock client)'}
         try:
             if gateway_client:
                  gateway_client.post_to_connection(ConnectionId=connectionId, Data=json.dumps(error_data))
                  # Send end signal
                  end_data = {'statusCode': 500, 'type': 'end'}
                  gateway_client.post_to_connection(ConnectionId=connectionId, Data=json.dumps(end_data))
         except Exception as gw_e: logger.error(f"Failed to send Bedrock client init error/end signal back via WebSocket: {gw_e}")
         return {'statusCode': 500, 'body': json.dumps({'error': 'Server error (Bedrock client unavailable).'})}

    response = None
    try:
        response = bedrock_runtime_client.converse_stream(
            modelId="anthropic.claude-3-5-sonnet-20240620-v1:0",
            messages=messages_for_api, # <<< MODIFICATION: Use the final prepared message list >>>
            system=system_prompts
            # inferenceConfig={ "maxTokens": 1024, "temperature": 0.7 }
        )
        logger.info("Received stream response from Bedrock Converse API.")

    except Exception as e:
        logger.error(f"Error calling Bedrock Converse API: {e}")
        # <<< MODIFICATION: Log the specific exception details >>>
        logger.exception("Bedrock Converse API Exception Details:")
        error_data = {'statusCode': 500, 'type': 'error', 'text': f'LLM Error: {type(e).__name__}'} # Send type, not full msg
        try:
            if gateway_client:
                gateway_client.post_to_connection(ConnectionId=connectionId, Data=json.dumps(error_data))
                logger.info("Sending end signal after LLM API error.")
                end_data = {'statusCode': 500, 'type': 'end'}
                gateway_client.post_to_connection(ConnectionId=connectionId, Data=json.dumps(end_data))
        except Exception as gw_e:
            logger.error(f"Failed to send error/end signal back via WebSocket: {gw_e}")
        return {'statusCode': 500, 'body': json.dumps({'error': f'Bedrock API call failed: {e}'})}

    # --- Stream Processing & WebSocket Send ---
    stream = response.get('stream') if response else None
    if stream:
        logger.info("Processing stream...")
        full_response_text = ""
        stream_finished_normally = False
        try:
            for event in stream:
                message_text = ""
                block_type = "unknown"

                if 'messageStart' in event:
                    logger.debug(f"Stream message start: Role = {event['messageStart'].get('role')}")
                    block_type = "start"

                elif 'contentBlockDelta' in event:
                    block_type = "delta"
                    delta = event['contentBlockDelta']['delta']
                    if 'text' in delta:
                        message_text = delta['text']
                        if message_text: # Avoid sending empty deltas if possible
                             full_response_text += message_text
                             delta_data = {'statusCode': 200, 'type': block_type, 'text': message_text}
                             gateway_client.post_to_connection(ConnectionId=connectionId, Data=json.dumps(delta_data))

                elif 'messageStop' in event:
                    stop_reason = event['messageStop'].get('stopReason')
                    logger.info(f"Stream message stop. Reason: {stop_reason}")
                    stream_finished_normally = True
                    break # Exit loop once message stops

                elif 'metadata' in event:
                    # Optional: Log usage from metadata if needed
                    # usage = event['metadata'].get('usage', {})
                    # logger.info(f"Usage - Input tokens: {usage.get('inputTokens')}, Output tokens: {usage.get('outputTokens')}")
                    logger.debug(f"Stream metadata: {event['metadata']}")

                elif 'contentBlockStop' in event:
                     # This event just indicates a block finished, usually text. Can often be ignored.
                     logger.debug(f"Stream content block stop event received.")

                else:
                    logger.warning(f"Unhandled stream event type: {event}")

            # ----- After stream processing loop -----

            if is_kb_relevant and sources:
                logger.info("Sending relevant sources back to client.")
                sources_data = {'statusCode': 200, 'type': 'sources', 'sources': sources}
                try:
                    gateway_client.post_to_connection(ConnectionId=connectionId, Data=json.dumps(sources_data))
                except Exception as gw_e:
                     logger.error(f"Failed to send sources back via WebSocket: {gw_e}")

            if stream_finished_normally:
                logger.info("Sending end signal to client after successful stream.")
                end_data = {'statusCode': 200, 'type': 'end'}
                try:
                    gateway_client.post_to_connection(ConnectionId=connectionId, Data=json.dumps(end_data))
                except Exception as gw_e:
                    logger.error(f"Failed to send end signal back via WebSocket: {gw_e}")

        except Exception as e:
            logger.error(f"Error processing Bedrock stream or sending data via WebSocket: {e}")
            # <<< MODIFICATION: Log the specific exception details >>>
            logger.exception("Stream Processing/WebSocket Send Exception Details:")
            try:
                error_data = {'statusCode': 500, 'type': 'error', 'text': f'Stream processing error: {type(e).__name__}'}
                gateway_client.post_to_connection(ConnectionId=connectionId, Data=json.dumps(error_data))
                logger.info("Sending end signal after stream processing error.")
                end_data = {'statusCode': 500, 'type': 'end'}
                gateway_client.post_to_connection(ConnectionId=connectionId, Data=json.dumps(end_data))
            except Exception as gw_e:
                logger.error(f"Failed to send stream error/end signal back via WebSocket: {gw_e}")
            return {'statusCode': 500, 'body': json.dumps({'error': f'Stream processing failed: {e}'})}

    else: # Handle case where Bedrock response didn't contain a 'stream'
        logger.error("No 'stream' object found in Bedrock Converse API response.")
        error_data = {'statusCode': 500, 'type': 'error', 'text': 'LLM response error (no stream).'}
        try:
            if gateway_client:
                 gateway_client.post_to_connection(ConnectionId=connectionId, Data=json.dumps(error_data))
                 logger.info("Sending end signal after no-stream error.")
                 end_data = {'statusCode': 500, 'type': 'end'}
                 gateway_client.post_to_connection(ConnectionId=connectionId, Data=json.dumps(end_data))
        except Exception as gw_e:
            logger.error(f"Failed to send no-stream error/end signal back via WebSocket: {gw_e}")
        return {'statusCode': 500, 'body': json.dumps({'error': 'Bedrock response missing stream.'})}

    logger.info("Successfully processed request and streamed response or handled error.")
    return {'statusCode': 200, 'body': json.dumps({'message': 'Message processed successfully'})}