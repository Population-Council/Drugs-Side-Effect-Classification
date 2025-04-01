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
# Get region from the Lambda environment variable, default to 'us-east-1' as a fallback
# (Lambda automatically sets AWS_REGION, so the fallback is unlikely to be needed in production)
lambda_region = os.environ.get('AWS_REGION', 'us-east-1')
logger.info(f"Using AWS Region: {lambda_region}")

# --- Bedrock Agent Runtime Client (for Knowledge Base) ---
# Initialize client with the determined region
try:
    agent_runtime_client = boto3.client("bedrock-agent-runtime", region_name=lambda_region)
except Exception as e:
    logger.error(f"Error initializing bedrock-agent-runtime client: {e}")
    # Handle client initialization error if necessary, maybe raise it

# --- Bedrock Runtime Client (for LLM Converse API) ---
# Initialize client with the determined region
try:
    bedrock_runtime_client = boto3.client(service_name="bedrock-runtime", region_name=lambda_region)
except Exception as e:
    logger.error(f"Error initializing bedrock-runtime client: {e}")
    # Handle client initialization error

# --- Knowledge Base Retrieval Function ---
def knowledge_base_retrieval(prompt, kb_id):
    """
    Retrieves relevant information from the specified Knowledge Base.
    """
    if not agent_runtime_client:
        logger.error("Bedrock Agent Runtime client not initialized.")
        # Depending on requirements, you might return an empty response or raise an error
        return {"retrievalResults": []}

    query = {"text": prompt}
    # Optional: Define retrieval configuration if needed (e.g., number of results)
    # retrieval_configuration = {
    #     'vectorSearchConfiguration': {
    #         'numberOfResults': 5,
    #     }
    # }
    try:
        logger.info(f"Retrieving from Knowledge Base ID: {kb_id} with prompt: '{prompt}'")
        # Use the pre-initialized client
        kb_response = agent_runtime_client.retrieve(
            knowledgeBaseId=kb_id,
            retrievalQuery=query
            # Uncomment if using specific configuration:
            # retrievalConfiguration=retrieval_configuration
        )
        logger.info(f"KB Response received: {kb_response}")
        return kb_response
    except Exception as e:
        logger.error(f"Error during Knowledge Base retrieval: {e}")
        # Return an empty response or re-raise the exception based on desired error handling
        return {"retrievalResults": []}


# --- Source Extraction Function ---
def extract_sources(kb_results):
    """
    Extracts and formats source URLs, scores, and page numbers from KB results.
    """
    processed_sources = []
    logger.info(f"Extracting sources from KB results: {kb_results}")

    for result in kb_results.get('retrievalResults', []):
        location = result.get("location", {})
        metadata = result.get("metadata", {})
        score = result.get('score')

        source_uri = None
        # Check different potential structures for S3 URI
        if location.get("type") == "S3":
             source_uri = location.get("s3Location", {}).get("uri")

        # Fallback or alternative check in metadata (adjust if your KB setup differs)
        if not source_uri:
             source_uri = metadata.get('x-amz-bedrock-kb-source-uri') # Example metadata key

        page_number = metadata.get('x-amz-bedrock-kb-document-page-number') # Example metadata key

        if source_uri:
            # Replace 's3://' with 'https://s3.amazonaws.com/' to make it a web-accessible URL
            # Note: This assumes public access or pre-signed URLs might be needed for actual viewing
            processed_uri = re.sub(r'^s3://([^/]+)/(.*)', r'https://\1.s3.amazonaws.com/\2', source_uri)

            source_info = {
                "url": processed_uri,
                "score": score,
            }
            if page_number: # Only include page number if available
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
    Assumes sources are sorted by score descending by the retrieval API.
    """
    if not sources:
        logger.info("No sources found, considered not relevant.")
        return False

    top_score = sources[0].get('score', 0)
    relevant = top_score > threshold
    logger.info(f"Top source score: {top_score}. Relevant (>{threshold}): {relevant}")
    return relevant

# --- History Transformation Function ---
def transform_history(history, limit=25):
    """
    Transforms the chat history into the format required by the Bedrock Converse API,
    ensuring alternating user/assistant roles and handling SOURCES messages.
    """
    transformed = []
    last_role = None
    user_found, assistant_found = False, False
    pending_sources_content = None # To hold SOURCES content temporarily

    logger.info(f"Transforming history (last {limit} entries): {history[-limit:]}")

    # Iterate through the most recent history entries
    for entry in history[-limit:]:
        message_type = entry.get('type')
        message_content = entry.get('message', '')

        # Handle SOURCES message type
        if message_type == 'SOURCES':
            # Store the sources content to potentially append later
            pending_sources_content = message_content
            logger.debug(f"Stored pending sources: {pending_sources_content}")
            continue # Don't add SOURCES message itself to transformed history

        # Determine role for TEXT messages
        if message_type == 'TEXT':
            role = 'user' if entry.get('sentBy') == 'USER' else 'assistant'

            if role == 'user':
                user_found = True
            elif role == 'assistant':
                assistant_found = True

            # Check if the current role is the same as the last one added
            if role == last_role:
                logger.debug(f"Skipping consecutive message from role: {role}")
                continue # Skip adding duplicate roles in sequence

            # Prepare the content block
            current_text = message_content

            # If the *previous* message was an assistant message and we have pending sources,
            # append the sources to the *previous* assistant message content.
            # Note: This assumes SOURCES always follow an assistant TEXT message. Adjust if needed.
            if pending_sources_content and last_role == 'assistant' and transformed:
                 logger.debug(f"Appending pending sources to previous assistant message.")
                 transformed[-1]['content'][0]['text'] += f"\n\nSources:\n{pending_sources_content}"
                 pending_sources_content = None # Clear pending sources

            # Add the current message to transformed history
            transformed.append({
                "role": role,
                "content": [{"text": current_text}]
            })
            last_role = role # Update the last role added
            logger.debug(f"Added message: Role={role}, Content='{current_text[:50]}...'")


    # Final check: If there are leftover pending sources after the loop (e.g., history ends with SOURCES)
    # and the last actual message was from the assistant, append the sources.
    if pending_sources_content and last_role == 'assistant' and transformed:
        logger.debug(f"Appending leftover pending sources to the last assistant message.")
        transformed[-1]['content'][0]['text'] += f"\n\nSources:\n{pending_sources_content}"

    # Bedrock Converse API requires alternating roles, starting with user.
    # If the transformed history starts with 'assistant', remove it.
    if transformed and transformed[0]['role'] == 'assistant':
        logger.warning("History starts with 'assistant', removing the first entry.")
        transformed.pop(0)

    # If only one role type is present after transformation, it's not valid conversational history for Bedrock.
    if not (user_found and assistant_found) and len(transformed) > 0:
         logger.warning(f"History transformation resulted in non-alternating or single-role messages. Returning empty history. User found: {user_found}, Assistant found: {assistant_found}")
         # return [] # Return empty if not alternating or only one side spoke

    logger.info(f"Transformed History: {transformed}")
    return transformed


# --- Main Lambda Handler ---
def lambda_handler(event, context):
    logger.info(f"Received event: {json.dumps(event)}")

    connectionId = event.get("connectionId")
    prompt = event.get("prompt")
    history_raw = event.get("history", []) # Expecting a list directly now

    # Validate input
    if not connectionId:
        logger.error("Missing 'connectionId' in event.")
        return {'statusCode': 400, 'body': json.dumps({'error': 'Missing connectionId.'})}
    if not prompt:
        logger.error("Missing 'prompt' in event.")
        # Optionally send error back via WebSocket if connectionId is present
        # url = os.environ.get('URL') etc... handle this case if needed
        return {'statusCode': 400, 'body': json.dumps({'error': 'No prompt provided.'})}

    # Retrieve necessary environment variables
    kb_id = os.environ.get('KNOWLEDGE_BASE_ID')
    websocket_callback_url = os.environ.get('URL') # API Gateway Management API Endpoint URL

    if not kb_id:
        logger.error("Environment variable 'KNOWLEDGE_BASE_ID' is not set.")
        return {'statusCode': 500, 'body': json.dumps({'error': 'Server configuration error (KB ID missing).'})}
    if not websocket_callback_url:
        logger.error("Environment variable 'URL' (WebSocket Callback URL) is not set.")
        return {'statusCode': 500, 'body': json.dumps({'error': 'Server configuration error (Callback URL missing).'})}

    # Initialize API Gateway Management client (needs the specific endpoint URL)
    try:
        gateway_client = boto3.client("apigatewaymanagementapi", endpoint_url=websocket_callback_url)
    except Exception as e:
         logger.error(f"Failed to create ApiGatewayManagementApi client with endpoint {websocket_callback_url}: {e}")
         # Cannot send messages back without this client
         return {'statusCode': 500, 'body': json.dumps({'error': 'Server configuration error (API Gateway client setup failed).'})}

    # Transform history
    # Ensure history is a list
    if not isinstance(history_raw, list):
        logger.warning(f"Received 'history' is not a list (type: {type(history_raw)}). Using empty history.")
        history = []
    else:
        history = history_raw
    transformed_history = transform_history(history) # Use the potentially corrected history list

    # 1. Retrieve from Knowledge Base
    logger.info(f"Querying Knowledge Base ID: [{kb_id}]...")
    kb_response = knowledge_base_retrieval(prompt, kb_id)

    # 2. Extract Sources and Check Relevance
    sources = extract_sources(kb_response)
    is_kb_relevant = is_relevant(sources) # Check if KB results meet threshold

    # 3. Prepare RAG context (only if relevant)
    rag_info = ""
    if is_kb_relevant:
        logger.info("KB results are relevant. Preparing RAG context.")
        for result in kb_response.get("retrievalResults", []):
            rag_info += result.get("content", {}).get("text", "") + "\n\n" # Add spacing between chunks
    else:
        logger.info("KB results are not relevant or no sources found. Proceeding without RAG context.")

    # 4. Construct LLM Prompt
    # Base instruction for the LLM
    system_prompt = "You are a helpful assistant."
    if is_kb_relevant:
        # If KB provided relevant info, instruct the model to use it preferentially
        llm_prompt_text = f"""Use the following information from the knowledge source to answer the question. Answer ONLY based on this information. If the information isn't sufficient, say you don't have enough information.

        Knowledge Source Information:
        {rag_info}

        User's question: {prompt}"""
    else:
        # If KB wasn't relevant, just pass the user's prompt directly
        llm_prompt_text = prompt

    # 5. Prepare messages for Bedrock Converse API
    # Ensure history alternates and starts with user
    # The final user message is constructed separately
    final_user_message = {
        "role": "user",
        "content": [{"text": llm_prompt_text}]
    }

    # Combine history and the final user message
    messages = transformed_history + [final_user_message]

    # Add system prompt if desired (check model compatibility)
    # Anthropic Claude v3 models support the 'system' parameter
    system_prompts = [{"text": system_prompt}] if system_prompt else None


    logger.info(f"Sending query to LLM. System Prompt: {system_prompt}. Messages: {json.dumps(messages)}")

    # 6. Invoke Bedrock Converse Stream API
    if not bedrock_runtime_client:
         logger.error("Bedrock Runtime client not initialized. Cannot call Converse API.")
         # Send error back to client?
         return {'statusCode': 500, 'body': json.dumps({'error': 'Server error (Bedrock client unavailable).'})}

    try:
        response = bedrock_runtime_client.converse_stream(
            modelId="anthropic.claude-3-5-sonnet-20240620-v1:0", # Verify model ID is correct and available in your region
            messages=messages,
            system=system_prompts # Pass system prompt if using one
            # Add inferenceConfig if needed (e.g., max_tokens, temperature)
            # inferenceConfig={ "maxTokens": 1024, "temperature": 0.7 }
        )
        logger.info("Received stream response from Bedrock Converse API.")

    except Exception as e:
        logger.error(f"Error calling Bedrock Converse API: {e}")
        # Send error message back to the client via WebSocket
        error_data = {'statusCode': 500, 'type': 'error', 'text': f'LLM Error: {e}'}
        try:
             gateway_client.post_to_connection(ConnectionId=connectionId, Data=json.dumps(error_data))
        except Exception as gw_e:
             logger.error(f"Failed to send error back via WebSocket: {gw_e}")
        return {'statusCode': 500, 'body': json.dumps({'error': f'Bedrock API call failed: {e}'})}

    # 7. Stream Response back via WebSocket
    stream = response.get('stream')
    if stream:
        logger.info("Processing stream...")
        full_response_text = "" # Keep track of the full response if needed later
        try:
            for event in stream:
                message_text = ""
                block_type = "unknown"

                if 'messageStart' in event:
                    # Optional: Handle start event if needed (e.g., log role)
                    logger.debug(f"Stream message start: Role = {event['messageStart'].get('role')}")
                    block_type = "start" # Indicate start of assistant message
                    # Send a start indicator?
                    # start_data = {'statusCode': 200, 'type': block_type}
                    # gateway_client.post_to_connection(ConnectionId=connectionId, Data=json.dumps(start_data))

                elif 'contentBlockDelta' in event:
                    block_type = "delta"
                    delta = event['contentBlockDelta']['delta']
                    if 'text' in delta:
                         message_text = delta['text']
                         full_response_text += message_text # Append to full response
                         #logger.debug(f"Stream delta: '{message_text}'") # Log stream chunks

                         # Send the delta back to the client
                         delta_data = {'statusCode': 200, 'type': block_type, 'text': message_text}
                         gateway_client.post_to_connection(ConnectionId=connectionId, Data=json.dumps(delta_data))

                elif 'messageStop' in event:
                    block_type = "end"
                    stop_reason = event['messageStop'].get('stopReason')
                    logger.info(f"Stream message stop. Reason: {stop_reason}")
                     # Send an end indicator?
                    # end_data = {'statusCode': 200, 'type': block_type}
                    # gateway_client.post_to_connection(ConnectionId=connectionId, Data=json.dumps(end_data))
                    break # Exit loop once message stops

                elif 'metadata' in event:
                     # Handle metadata if needed (e.g., token counts, stop reason)
                     logger.debug(f"Stream metadata: {event['metadata']}")
                     pass

                else:
                     # Handle other event types or errors within the stream
                     logger.warning(f"Unhandled stream event type: {event}")


            # After stream finishes, send sources if they were relevant
            if is_kb_relevant and sources:
                 logger.info("Sending relevant sources back to client.")
                 sources_data = {'statusCode': 200, 'type': 'sources', 'sources': sources}
                 gateway_client.post_to_connection(ConnectionId=connectionId, Data=json.dumps(sources_data))
            else:
                 logger.info("No relevant sources to send.")

        except Exception as e:
             logger.error(f"Error processing Bedrock stream or sending data via WebSocket: {e}")
             # Attempt to send an error message back if possible
             try:
                 error_data = {'statusCode': 500, 'type': 'error', 'text': f'Stream processing error: {e}'}
                 gateway_client.post_to_connection(ConnectionId=connectionId, Data=json.dumps(error_data))
             except Exception as gw_e:
                 logger.error(f"Failed to send stream processing error back via WebSocket: {gw_e}")
             # Still return an error status from the lambda itself
             return {'statusCode': 500, 'body': json.dumps({'error': f'Stream processing failed: {e}'})}

    else:
        logger.error("No 'stream' object found in Bedrock Converse API response.")
        # Send error back
        error_data = {'statusCode': 500, 'type': 'error', 'text': 'LLM response error (no stream).'}
        try:
            gateway_client.post_to_connection(ConnectionId=connectionId, Data=json.dumps(error_data))
        except Exception as gw_e:
             logger.error(f"Failed to send no-stream error back via WebSocket: {gw_e}")
        return {'statusCode': 500, 'body': json.dumps({'error': 'Bedrock response missing stream.'})}

    logger.info("Successfully processed request and streamed response.")
    return {'statusCode': 200, 'body': json.dumps({'message': 'Message processed and streamed successfully'})}