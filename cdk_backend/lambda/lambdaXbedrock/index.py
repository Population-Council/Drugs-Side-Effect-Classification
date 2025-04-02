# /home/zvallarino/AI_AWS_PC/Drugs-Side-Effect-Classification/cdk_backend/lambda/lambdaXbedrock/index.py

import os
import json
import boto3
import re
import logging

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# --- Bot Persona Definitions ---
# Define the system prompts for different bot roles
# Using a dictionary for easy lookup and updates
BOT_PERSONAS = {
    "researchAssistant": {
        "name": "Ponyo",
        # Incorporates the RAG instruction style directly into the persona
        "prompt": "You are Ponyo, a Research Assistant. Use the provided Knowledge Source Information ONLY to answer the user's question. If the information isn't sufficient to answer, clearly state that you don't have enough information based on the provided sources. Do not use prior knowledge. Be precise and stick strictly to the details found in the Knowledge Source."
        # Note: The actual "{rag_info}" will be dynamically added later if relevant.
        # This prompt sets the stage for HOW to use the RAG info.
    },
    "softwareEngineer": {
        "name": "Chihiro",
        "prompt": "You are Chihiro, a Software Engineer. Provide clear, concise, and technically accurate answers. You can explain concepts, provide code examples (if relevant and safe), and troubleshoot technical problems based on the context provided. Be helpful and efficient."
    },
    "genderYouthExpert": {
        "name": "Kiki",
        "prompt": "You are Kiki, a Gender and Youth Expert. Answer questions related to gender issues, youth development, and related social topics with sensitivity, expertise, and an informative tone. Ensure your responses are respectful, evidence-based (if sources are provided), and appropriate for discussions on these topics."
    },
    "default": { # Fallback persona
        "name": "Assistant",
        "prompt": "You are a helpful assistant."
    }
}
# --- End Bot Persona Definitions ---

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
        De-duplicates based on the source document URI, keeping only the highest score per document.
        Returns only the single highest-scoring, unique source.
        """
        logger.info(f"Extracting and filtering sources from KB results (first 500 chars): {str(kb_results)[:500]}")
        
        # Use a dictionary to track the best source info per unique S3 URI
        best_sources_by_uri = {}

        for result in kb_results.get('retrievalResults', []):
            location = result.get("location", {})
            metadata = result.get("metadata", {})
            score = result.get('score')
            # Ensure score is a float for comparison, default to 0.0 if None or invalid
            try:
                current_score = float(score) if score is not None else 0.0
            except (ValueError, TypeError):
                current_score = 0.0

            source_uri = None
            if location.get("type") == "S3":
                source_uri = location.get("s3Location", {}).get("uri")
            # Fallback if needed (adjust key if necessary)
            # if not source_uri and metadata:
            #     source_uri = metadata.get('x-amz-bedrock-kb-source-uri')

            if source_uri:
                page_number = metadata.get('x-amz-bedrock-kb-document-page-number') # Or your specific metadata key
                processed_uri = re.sub(r'^s3://([^/]+)/(.*)', r'https://\1.s3.amazonaws.com/\2', source_uri)

                current_source_info = {
                    "url": processed_uri,
                    "score": current_score, # Use the float score
                    "_s3_uri": source_uri # Keep original URI for de-duplication key
                }
                if page_number:
                    current_source_info["page"] = page_number

                # Check if we've seen this URI before and if the current score is better
                existing_best_score = best_sources_by_uri.get(source_uri, {}).get("score", -1.0) # Default to -1 to ensure first entry is added

                if current_score > existing_best_score:
                    logger.debug(f"Updating best source for {source_uri} with score {current_score} (previous: {existing_best_score})")
                    best_sources_by_uri[source_uri] = current_source_info
                else:
                     logger.debug(f"Ignoring source for {source_uri} with score {current_score} (best score is {existing_best_score})")

            else:
                logger.warning(f"Could not extract source_uri from result: {result}")

        # Get the list of best source_info objects
        deduplicated_sources = list(best_sources_by_uri.values())

        # Sort the unique sources by score (highest first)
        # Handle potential None scores during sort by defaulting them to a low value like 0.0
        deduplicated_sources.sort(key=lambda x: x.get('score', 0.0), reverse=True)
        
        # Remove the temporary _s3_uri key before returning
        for source in deduplicated_sources:
            source.pop('_s3_uri', None)

        # Limit to the top 1 source
        top_source = deduplicated_sources[:1] # Takes the first element if list not empty, else empty list

        logger.info(f"Filtered and processed top source: {top_source}")
        return top_source # Return list containing max 1 item
    
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
# --- Main Lambda Handler ---
def lambda_handler(event, context):
    logger.info(f"Received event: {json.dumps(event)}")

    connectionId = event.get("connectionId")
    prompt = event.get("prompt") # Current user prompt
    history_raw = event.get("history", [])
    selected_role_key = event.get("role", "researchAssistant") # *** GET ROLE FROM EVENT, default ***

    # --- Input Validation ---
    # ... (keep validation as is) ...
    if not connectionId:
        logger.error("Missing 'connectionId' in event.")
        return {'statusCode': 400, 'body': json.dumps({'error': 'Missing connectionId.'})}
    if not prompt and not history_raw:
        logger.error("Missing 'prompt' in event and history is empty.")
        return {'statusCode': 400, 'body': json.dumps({'error': 'No prompt provided.'})}
    elif not prompt:
         logger.warning("Prompt is empty, relying on history.")


    # --- Environment Variable Checks ---
    # ... (keep checks as is) ...
    kb_id = os.environ.get('KNOWLEDGE_BASE_ID')
    websocket_callback_url = os.environ.get('URL')
    if not kb_id:
        logger.error("Environment variable 'KNOWLEDGE_BASE_ID' is not set.")
        return {'statusCode': 500, 'body': json.dumps({'error': 'Server configuration error (KB ID missing).'})}
    if not websocket_callback_url:
        logger.error("Environment variable 'URL' (WebSocket Callback URL) is not set.")
        return {'statusCode': 500, 'body': json.dumps({'error': 'Server configuration error (Callback URL missing).'})}


    # --- Initialize API Gateway Client ---
    # ... (keep initialization as is) ...
    gateway_client = None
    try:
        gateway_client = boto3.client("apigatewaymanagementapi", endpoint_url=websocket_callback_url)
    except Exception as e:
         logger.error(f"Failed to create ApiGatewayManagementApi client with endpoint {websocket_callback_url}: {e}")
         return {'statusCode': 500, 'body': json.dumps({'error': 'Server configuration error (API Gateway client setup failed).'})}


    # --- History Validation ---
    # ... (keep validation as is) ...
    if not isinstance(history_raw, list):
        logger.warning(f"Received 'history' is not a list (type: {type(history_raw)}). Using empty history.")
        history = []
    else:
        history = history_raw # Use the raw history as received


    # --- KB Retrieval ---
    logger.info(f"Querying Knowledge Base ID: [{kb_id}]...")
    # Use current prompt for KB Search, or a space if empty (adjust if needed)
    kb_search_term = prompt if prompt else " "
    kb_response = knowledge_base_retrieval(kb_search_term, kb_id)

    # --- Source Processing & RAG Context ---
    sources = extract_sources(kb_response)
    is_kb_relevant = is_relevant(sources)
    rag_info = ""
    if is_kb_relevant:
        logger.info("KB results are relevant. Preparing RAG context.")
        # Collect *only* the text content for the RAG context
        rag_info = "\n\n".join(
            result.get("content", {}).get("text", "")
            for result in kb_response.get("retrievalResults", [])
            if result.get("content", {}).get("text") # Ensure text exists
        )
    else:
        logger.info("KB results are not relevant or no sources found.")

    # --- Prepare Messages for Bedrock ---
    messages_for_api = transform_history(history) # Gets history ending in last user message

    # --- Dynamically Select System Prompt ---
    persona = BOT_PERSONAS.get(selected_role_key, BOT_PERSONAS["default"]) # Get persona dict, fallback to default
    system_prompt_text = persona["prompt"]
    bot_name = persona["name"] # Get the name for potential future use (e.g., logging)
    logger.info(f"Selected Bot Persona: {bot_name} (Key: {selected_role_key})")

    # --- Construct Final Prompt for LLM (Handle RAG) ---
    final_llm_prompt_text = ""
    if messages_for_api: # If history exists (and ends with user prompt)
        last_user_message_content = messages_for_api[-1]['content'][0]['text']

        if is_kb_relevant and selected_role_key == "researchAssistant":
             # Research Assistant with RAG: Prepend RAG context using its specific structure.
             # The persona prompt already instructs HOW to use the info.
             rag_enhanced_prompt = f"""Knowledge Source Information:
{rag_info}

Based ONLY on the information above, answer the user's question: {last_user_message_content}"""
             messages_for_api[-1]['content'][0]['text'] = rag_enhanced_prompt
             logger.info("Added RAG context to the final user message for Research Assistant.")
        elif is_kb_relevant:
             # Other personas with RAG: Provide context more generally.
             # Persona prompt guides general behavior.
             rag_enhanced_prompt = f"""Use the following information if relevant to answer the user's question:
Knowledge Source Information:
{rag_info}

User's question: {last_user_message_content}"""
             messages_for_api[-1]['content'][0]['text'] = rag_enhanced_prompt
             logger.info(f"Added RAG context to the final user message for {bot_name}.")
        # else: No RAG needed, last message remains as is.

    else: # No history, first message
        base_prompt = prompt if prompt else " " # Should usually have a prompt here
        if is_kb_relevant and selected_role_key == "researchAssistant":
            # RAG for first message - Research Assistant
             rag_enhanced_prompt = f"""Knowledge Source Information:
{rag_info}

Based ONLY on the information above, answer the user's question: {base_prompt}"""
             final_llm_prompt_text = rag_enhanced_prompt
             logger.info("Added RAG context for first message (Research Assistant).")
        elif is_kb_relevant:
             # RAG for first message - Other personas
             rag_enhanced_prompt = f"""Use the following information if relevant to answer the user's question:
Knowledge Source Information:
{rag_info}

User's question: {base_prompt}"""
             final_llm_prompt_text = rag_enhanced_prompt
             logger.info(f"Added RAG context for first message ({bot_name}).")
        else:
             # No RAG for first message
             final_llm_prompt_text = base_prompt

        # Construct the first message for the API
        messages_for_api = [{"role": "user", "content": [{"text": final_llm_prompt_text}]}]


    # --- Set System Prompt for Bedrock ---
    system_prompts = [{"text": system_prompt_text}] if system_prompt_text else None

    logger.info(f"Sending query to LLM. System Prompt: '{system_prompt_text}'. Messages: {json.dumps(messages_for_api)}")

    # --- Invoke Bedrock & Stream Response ---
    if not bedrock_runtime_client:
        # ... (error handling as before) ...
        logger.error("Bedrock Runtime client not initialized. Cannot call Converse API.")
        # ... send error via websocket ...
        return {'statusCode': 500, 'body': json.dumps({'error': 'Server error (Bedrock client unavailable).'})}

    response = None
    try:
        response = bedrock_runtime_client.converse_stream(
            modelId="anthropic.claude-3-5-sonnet-20240620-v1:0", # Or your desired model
            messages=messages_for_api, # Use the final prepared message list
            system=system_prompts # Use the dynamically selected system prompt
            # inferenceConfig={ "maxTokens": 1024, "temperature": 0.7 } # Optional
        )
        logger.info("Received stream response from Bedrock Converse API.")

    except Exception as e:
        # ... (error handling as before) ...
        logger.error(f"Error calling Bedrock Converse API: {e}")
        logger.exception("Bedrock Converse API Exception Details:")
        # ... send error via websocket ...
        return {'statusCode': 500, 'body': json.dumps({'error': f'Bedrock API call failed: {e}'})}


    # --- Stream Processing & WebSocket Send ---
    # ... (Stream processing logic remains the same) ...
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

                # ... (handle other event types like metadata, contentBlockStop etc. as before) ...
                elif 'metadata' in event:
                     logger.debug(f"Stream metadata: {event['metadata']}")
                elif 'contentBlockStop' in event:
                     logger.debug(f"Stream content block stop event received.")
                else:
                     logger.warning(f"Unhandled stream event type: {list(event.keys())}")


            # ----- After stream processing loop -----

            # Send sources only if KB was relevant AND sources were found
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
             # ... (Stream error handling as before) ...
            logger.error(f"Error processing Bedrock stream or sending data via WebSocket: {e}")
            logger.exception("Stream Processing/WebSocket Send Exception Details:")
            # ... send error/end via websocket ...
            return {'statusCode': 500, 'body': json.dumps({'error': f'Stream processing failed: {e}'})}

    else: # Handle case where Bedrock response didn't contain a 'stream'
        # ... (No stream error handling as before) ...
        logger.error("No 'stream' object found in Bedrock Converse API response.")
        # ... send error/end via websocket ...
        return {'statusCode': 500, 'body': json.dumps({'error': 'Bedrock response missing stream.'})}

    logger.info("Successfully processed request and streamed response or handled error.")
    return {'statusCode': 200, 'body': json.dumps({'message': 'Message processed successfully'})}