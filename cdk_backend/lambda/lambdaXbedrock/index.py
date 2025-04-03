# /home/zvallarino/AI_AWS_PC/Drugs-Side-Effect-Classification/cdk_backend/lambda/lambdaXbedrock/index.py

import os
import json
import boto3
import re
import logging
from botocore.exceptions import ClientError # Import ClientError for specific exception handling

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

SUPPORTED_COUNTRIES = {
    "afghanistan", "algeria", "argentina", "armenia", "belarus", "belize", "benin",
    "bosnia and herzegovina", "brazil", "burkina faso", "burundi", "cambodia",
    "cameroon", "central africa republic", "colombia", "congo, dem. rep",
    "costa rica", "côte d'ivoire", "china", "pakistan", "thailand", "ethiopia",
    "mauritius", "djibouti", "dominica", "dominican republic", "el salvador",
    "equatorial guinea", "gabon", "gambia", "georgia", "ghana", "grenada",
    "guatemala", "guinea", "guinea-bissau", "india", "indonesia", "jamaica",
    "kenya", "kiribati", "kosovo", "kyrgyz republic","Kyrgyzstan", "lebanon", "lesotho",
    "liberia", "libya", "angola", "madagascar", "malawi", "malaysia", "maldives",
    "mali", "marshall islands", "mexico", "micronesia", "moldova", "mongolia",
    "montenegro", "morocco", "mozambique", "myanmar", "nepal", "nigeria",
    "papua new guinea", "peru", "philippines", "rwanda", "samoa", "senegal",
    "serbia", "sierra leone", "solomon islands", "somalia", "south africa",
    "south sudan", "sri lanka", "st. lucia", "st. vincent and the grenadines",
    "suriname", "tanzania", "lao pdr", "laos", # <<< Include common variations
    "timor-leste", "togo", "tunisia", "türkiye", "turkey", # <<< Include variations
    "turkmenistan", "uganda", "ukraine", "bhutan", "bangladesh", "uzbekistan",
    "vanuatu", "vietnam", "west bank and gaza", "zambia", "zimbabwe"
}

# --- Helper function (Example - you'll need to implement robust extraction) ---
def extract_and_normalize_country(text):
    """
    Placeholder: Extracts and normalizes country name from text.
    You might use simple keyword checks first, then potentially an LLM call for complex cases.
    Handles variations like 'Lao PDR' -> 'laos', 'Türkiye' -> 'turkey'.
    Returns normalized country name (lowercase) or None.
    """
    text_lower = text.lower()
    # Simple checks first
    for country in SUPPORTED_COUNTRIES:
        if country in text_lower:
            # Normalize variations if needed (add more rules)
            if country == "lao pdr": return "laos"
            if country == "türkiye": return "turkey"
            # ... other normalizations ...
            return country # Return the first match found (might need refinement)

    # If simple checks fail, consider an LLM call here for complex queries
    # logger.info("Simple check failed, potentially call LLM for country extraction...")

    return None # No supported country found/extracted

# --- Bot Persona Definitions ---
BOT_PERSONAS = {
    "researchAssistant": {
        "name": "Ponyo",
        "prompt": "You are Ponyo, a Research Assistant. Use the provided Knowledge Source Information ONLY to answer the user's question. If the information isn't sufficient to answer, clearly state that you don't have enough information based on the provided sources. Do not use prior knowledge. Be precise and stick strictly to the details found in the Knowledge Source."
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

# --- Helper Function: Send WebSocket Message ---
def send_ws_message(gateway_client, connection_id, data):
    """Safely sends a message payload via WebSocket."""
    if not gateway_client:
        logger.error(f"Cannot send message to {connection_id}: gateway_client not available.")
        return False
    try:
        gateway_client.post_to_connection(ConnectionId=connection_id, Data=json.dumps(data))
        logger.info(f"Sent message type '{data.get('type', 'unknown')}' to {connection_id}")
        return True
    except ClientError as e:
        # Handle specific exceptions like GoneException (client disconnected)
        if e.response['Error']['Code'] == 'GoneException':
            logger.warning(f"Cannot send message to {connection_id}: Connection is gone (GoneException).")
        else:
            logger.error(f"Failed to send message type '{data.get('type', 'unknown')}' to {connection_id}: {e}")
            logger.exception("WebSocket Send Exception Details:")
        return False
    except Exception as e: # Catch other potential errors during send
         logger.error(f"Unexpected error sending message type '{data.get('type', 'unknown')}' to {connection_id}: {e}")
         logger.exception("WebSocket Send Unexpected Exception Details:")
         return False

# --- Helper Function: Send Error and End Signals ---
def send_error_and_end(gateway_client, connection_id, error_text, status_code=500):
    """Sends both an error message and an end signal."""
    error_data = {'statusCode': status_code, 'type': 'error', 'text': error_text}
    end_data = {'statusCode': status_code, 'type': 'end'}
    send_ws_message(gateway_client, connection_id, error_data)
    send_ws_message(gateway_client, connection_id, end_data)

# --- Knowledge Base Retrieval Function ---
def knowledge_base_retrieval(prompt, kb_id):
    """Retrieves relevant information from the specified Knowledge Base."""
    if not agent_runtime_client:
        logger.error("Bedrock Agent Runtime client not initialized.")
        return {"retrievalResults": []}
    query = {"text": prompt}
    try:
        logger.info(f"Retrieving from Knowledge Base ID: {kb_id} with prompt: '{prompt}'")
        kb_response = agent_runtime_client.retrieve(
            knowledgeBaseId=kb_id,
            retrievalQuery=query,
            retrievalConfiguration={
                'vectorSearchConfiguration': {
                    'numberOfResults': 3 # Example: retrieve top 3 results
                }
            }
        )
        logger.info(f"KB Response received (first 500 chars): {str(kb_response)[:500]}")
        return kb_response
    except ClientError as e:
        logger.error(f"Error during Knowledge Base retrieval: {e}")
        logger.exception("Knowledge Base Retrieve ClientError Details:")
        return {"retrievalResults": []}
    except Exception as e:
        logger.error(f"Unexpected error during Knowledge Base retrieval: {e}")
        logger.exception("Knowledge Base Retrieve Unexpected Exception Details:")
        return {"retrievalResults": []}

# --- Source Extraction Function ---
def extract_sources(kb_results):
    """
    Extracts and formats source URLs, scores, and page numbers from KB results.
    De-duplicates based on the source document URI, keeping only the highest score per document.
    Returns only the single highest-scoring, unique source.
    """
    logger.info(f"Extracting and filtering sources from KB results (first 500 chars): {str(kb_results)[:500]}")

    best_sources_by_uri = {}
    for result in kb_results.get('retrievalResults', []):
        location = result.get("location", {})
        metadata = result.get("metadata", {})
        score = result.get('score')
        try:
            current_score = float(score) if score is not None else 0.0
        except (ValueError, TypeError):
            current_score = 0.0

        source_uri = None
        if location.get("type") == "S3":
            source_uri = location.get("s3Location", {}).get("uri")

        if source_uri:
            page_number = metadata.get('x-amz-bedrock-kb-document-page-number')
            try:
                # Attempt conversion to float/int for numerical page numbers
                page_number = float(page_number) if page_number is not None else None
            except (ValueError, TypeError):
                logger.warning(f"Could not convert page number '{page_number}' to float for {source_uri}")
                page_number = None # Keep as None if conversion fails

            processed_uri = re.sub(r'^s3://([^/]+)/(.*)', r'https://\1.s3.amazonaws.com/\2', source_uri)

            current_source_info = {
                "url": processed_uri,
                "score": current_score,
                "_s3_uri": source_uri
            }
            if page_number is not None: # Add only if valid number
                current_source_info["page"] = page_number

            existing_best_score = best_sources_by_uri.get(source_uri, {}).get("score", -1.0)

            if current_score > existing_best_score:
                logger.debug(f"Updating best source for {source_uri} with score {current_score} (previous: {existing_best_score})")
                best_sources_by_uri[source_uri] = current_source_info
            else:
                 logger.debug(f"Ignoring source for {source_uri} with score {current_score} (best score is {existing_best_score})")
        else:
            logger.warning(f"Could not extract source_uri from result: {result}")

    deduplicated_sources = list(best_sources_by_uri.values())
    deduplicated_sources.sort(key=lambda x: x.get('score', 0.0), reverse=True)

    for source in deduplicated_sources:
        source.pop('_s3_uri', None)

    # top_source = deduplicated_sources[:1]
    logger.info(f"Filtered and processed unique sources: {deduplicated_sources}")
    return deduplicated_sources

# --- Relevance Check Function ---
def is_relevant(sources):
    """
    Check if the top source score is above 0.4.

    Args:
        sources (list): A list of dictionaries representing the sources, each containing a 'score' key.

    Returns:
        bool: True if the top source score is above 0.4, otherwise False.
    """
    if not sources:
        return False
    
    # Sort sources by score in descending order
    top_score = sources[0].get('score', 0)
    return top_score > 0.4
# --- History Transformation Function ---
def transform_history(history, limit=25):
    """
    Transforms chat history into the Bedrock Converse API format (alternating user/assistant).
    Handles potential merging of consecutive user messages and skips consecutive assistant messages.
    Crucially, this processes the history *before* the current user prompt.
    """
    transformed = []
    last_role = None
    pending_sources_content = None # Placeholder for sources associated with previous assistant msg

    logger.info(f"Transforming raw history (last {limit} entries): {history[-limit:]}")

    for entry in history[-limit:]:
        message_type = entry.get('type')
        message_content = entry.get('message', '').strip() # Strip whitespace
        sent_by = entry.get('sentBy')

        # Skip entries without essential info or empty TEXT messages
        if not message_type or not sent_by or (message_type == 'TEXT' and not message_content):
            logger.debug(f"Skipping invalid or empty history entry: {entry}")
            continue

        # Handle SOURCES type - associate with the immediately preceding assistant message if possible
        if message_type == 'SOURCES':
            # Note: Current Bedrock API doesn't directly use sources in history.
            # We might store this to append to the *last added* assistant message for context,
            # but it won't be sent as a separate 'SOURCES' role.
            # For simplicity now, we might just log and ignore it for history transformation.
            logger.debug(f"Ignoring SOURCES entry for history transformation: {entry}")
            continue # Ignore SOURCES for the API history list

        # Process TEXT messages
        if message_type == 'TEXT':
            role = 'user' if sent_by == 'USER' else 'assistant'

            # Merge consecutive user messages
            if role == 'user' and last_role == 'user':
                logger.debug("Merging consecutive user message.")
                if transformed and 'content' in transformed[-1] and transformed[-1]['content']:
                    transformed[-1]['content'][0]['text'] += f"\n{message_content}"
                else: # Should not happen if logic is sound, but safety check
                     transformed.append({"role": role, "content": [{"text": message_content}]})
                continue # Skip adding a new block

            # Skip consecutive assistant messages (Bedrock expects alternating turns)
            elif role == 'assistant' and last_role == 'assistant':
                logger.debug("Skipping consecutive assistant message.")
                continue

            # Add the message block
            transformed.append({
                "role": role,
                "content": [{"text": message_content}]
            })
            last_role = role
            logger.debug(f"Added history message: Role={role}, Content='{message_content[:50]}...'")

        # Handle other message types if necessary (e.g., FILE) - currently ignored for history
        else:
             logger.debug(f"Ignoring message type '{message_type}' for history transformation.")


    # --- Final Validation ---
    # Remove leading assistant message if present
    if transformed and transformed[0]['role'] == 'assistant':
        logger.warning("History transformation started with 'assistant', removing first entry.")
        transformed.pop(0)

    # Remove trailing assistant message if present (API expects last message to be user)
    # This shouldn't happen if we correctly append the *current* user prompt later,
    # but it's a safety check on the *transformed history* itself.
    if transformed and transformed[-1]['role'] == 'assistant':
        logger.warning("History transformation ended with 'assistant', removing last entry.")
        transformed.pop()

    logger.info(f"Result of transform_history: {transformed}")
    return transformed


# --- Main Lambda Handler ---
def lambda_handler(event, context):
    logger.info(f"Received event: {json.dumps(event)}")

    connectionId = event.get("connectionId")
    prompt = event.get("prompt") # Current user prompt
    history_raw = event.get("history", [])
    selected_role_key = event.get("role", "researchAssistant")

    # --- Initialize API Gateway Client ---
    # Moved up to allow sending errors earlier if config fails
    websocket_callback_url = os.environ.get('URL')
    gateway_client = None
    if websocket_callback_url:
        try:
            gateway_client = boto3.client("apigatewaymanagementapi", endpoint_url=websocket_callback_url)
        except Exception as e:
            logger.error(f"Failed to create ApiGatewayManagementApi client with endpoint {websocket_callback_url}: {e}")
            # Cannot send error back easily here, but log it.
    else:
         logger.error("Environment variable 'URL' (WebSocket Callback URL) is not set.")
         # Cannot proceed without callback URL
         return {'statusCode': 500, 'body': json.dumps({'error': 'Server configuration error (Callback URL missing).'})}

    # --- Input Validation ---
    if not connectionId:
        logger.error("Missing 'connectionId' in event.")
        # Can't send error back without connectionId
        return {'statusCode': 400, 'body': json.dumps({'error': 'Missing connectionId.'})}
    if not prompt: # Allow empty prompt if history exists (e.g., user just sends file?) - Revisit if needed
         logger.warning("Prompt is empty.")
         # If allowing empty prompts is not desired, add error handling:
         # send_error_and_end(gateway_client, connectionId, "No prompt provided.", 400)
         # return {'statusCode': 400, 'body': json.dumps({'error': 'No prompt provided.'})}

    ### START GOAL 1 MODIFICATION ###
    # --- Direct Handling for "List Countries" Query ---
    if prompt: # Only check if prompt is not empty/None
        prompt_lower = prompt.lower()
        # List of phrases to trigger the direct country list response
        country_query_phrases = [
            "what countries",
            "which countries",
            "country coverage",
            "countries covered",
            "countries do you have",
            "list of countries",
            "available countries"
        ]
        if any(phrase in prompt_lower for phrase in country_query_phrases):
            logger.info(f"Detected country list query: '{prompt}'")
            try:
                # Format the list nicely
                sorted_countries = sorted(list(SUPPORTED_COUNTRIES))
                # Capitalize each country name for better display
                formatted_countries = ", ".join(c.title() for c in sorted_countries)
                response_text = f"Based on the documents currently available, I have information related to the following countries: {formatted_countries}."

                # Send the response via WebSocket
                response_data = {'statusCode': 200, 'type': 'text', 'text': response_text}
                send_ws_message(gateway_client, connectionId, response_data)

                # Send the end signal
                end_data = {'statusCode': 200, 'type': 'end'}
                send_ws_message(gateway_client, connectionId, end_data)

                logger.info("Successfully handled country list request directly.")
                # Return successfully, bypassing the rest of the function (RAG/LLM)
                return {'statusCode': 200, 'body': json.dumps({'message': 'Handled country list request directly.'})}

            except Exception as e:
                logger.error(f"Error formatting or sending country list: {e}")
                # Send an error back to the user if possible
                send_error_and_end(gateway_client, connectionId, "Sorry, I encountered an error trying to list the countries.", 500)
                return {'statusCode': 500, 'body': json.dumps({'error': 'Error handling country list request.'})}
    # ### END GOAL 1 MODIFICATION ###
    
    # --- Environment Variable Check (KB_ID) ---
    kb_id = os.environ.get('KNOWLEDGE_BASE_ID')
    if not kb_id:
        logger.error("Environment variable 'KNOWLEDGE_BASE_ID' is not set.")
        send_error_and_end(gateway_client, connectionId, "Server configuration error (KB ID missing).", 500)
        return {'statusCode': 500, 'body': json.dumps({'error': 'Server configuration error (KB ID missing).'})}

    # --- History Validation ---
    if not isinstance(history_raw, list):
        logger.warning(f"Received 'history' is not a list (type: {type(history_raw)}). Using empty history.")
        history = []
    else:
        history = history_raw

    # --- KB Retrieval ---
    rag_info = ""
    sources = []
    is_kb_relevant = False
    if prompt: # Only query KB if there is a prompt
        kb_search_term = prompt
        try:
            kb_response = knowledge_base_retrieval(kb_search_term, kb_id)
            sources = extract_sources(kb_response)
            is_kb_relevant = is_relevant(sources)
            if is_kb_relevant:
                logger.info("KB results are relevant. Preparing RAG context.")
                rag_info = "\n\n".join(
                    result.get("content", {}).get("text", "")
                    for result in kb_response.get("retrievalResults", [])
                    if result.get("content", {}).get("text")
                ).strip() # Strip leading/trailing whitespace from combined context
                # Optional: Truncate rag_info if it's too long
                # MAX_RAG_LENGTH = 10000 # Example limit
                # if len(rag_info) > MAX_RAG_LENGTH:
                #    logger.warning(f"Truncating RAG info from {len(rag_info)} to {MAX_RAG_LENGTH} chars.")
                #    rag_info = rag_info[:MAX_RAG_LENGTH] + "..."

            else:
                logger.info("KB results are not relevant or no sources found.")
        except Exception as kb_e:
             logger.error(f"An error occurred during KB processing: {kb_e}")
             # Decide if this error should stop processing or just proceed without RAG
             # For now, proceed without RAG
             is_kb_relevant = False
             rag_info = ""
             sources = []
    else:
        logger.info("Skipping KB retrieval as prompt is empty.")


    # --- Prepare Messages for Bedrock ---
    # Transform the history *received* from the event
    try:
        transformed_history = transform_history(history)
    except Exception as hist_e:
        logger.error(f"Error during history transformation: {hist_e}")
        logger.exception("History Transformation Exception Details:")
        send_error_and_end(gateway_client, connectionId, "Error processing chat history.", 500)
        return {'statusCode': 500, 'body': json.dumps({'error': 'Error processing chat history.'})}

    # The 'prompt' from the event is the *current* user message
    current_user_prompt = prompt if prompt else " " # Use space if prompt was empty but allowed

    # --- Construct Final Prompt Text (Handle RAG) ---
    llm_prompt_text = current_user_prompt
    if is_kb_relevant and rag_info: # Ensure rag_info is not empty
        logger.info(f"Augmenting current prompt with RAG context for role {selected_role_key}.")
        rag_prefix = ""
        if selected_role_key == "researchAssistant":
            rag_prefix = f"""Knowledge Source Information:
---
{rag_info}
---

Based ONLY on the information above, answer the user's question: """
        else:
             rag_prefix = f"""Use the following information if relevant to answer the user's question:
Knowledge Source Information:
---
{rag_info}
---

User's question: """
        llm_prompt_text = f"{rag_prefix}{current_user_prompt}"

    # --- Combine History and Current Prompt ---
    messages_for_api = transformed_history # Start with the processed history
    messages_for_api.append({ # Add the current user turn as the last message
        "role": "user",
        "content": [{"text": llm_prompt_text}]
    })

    # --- Set System Prompt for Bedrock ---
    persona = BOT_PERSONAS.get(selected_role_key, BOT_PERSONAS["default"])
    system_prompt_text = persona["prompt"]
    bot_name = persona["name"]
    logger.info(f"Selected Bot Persona: {bot_name} (Key: {selected_role_key})")
    system_prompts = [{"text": system_prompt_text}] if system_prompt_text else None

    logger.info(f"Sending query to LLM. System Prompt[:100]: '{system_prompt_text[:100]}...'. Messages: {json.dumps(messages_for_api)}")

    # --- Invoke Bedrock & Stream Response ---
    if not bedrock_runtime_client:
        logger.error("Bedrock Runtime client not initialized. Cannot call Converse API.")
        send_error_and_end(gateway_client, connectionId, "Server error (Bedrock client unavailable).", 500)
        return {'statusCode': 500, 'body': json.dumps({'error': 'Server error (Bedrock client unavailable).'})}

    response = None
    stream = None
    stream_finished_normally = False # Flag to track if 'messageStop' event was received
    full_response_text = "" # Accumulate text for potential logging

    try:
        response = bedrock_runtime_client.converse_stream(
            modelId="anthropic.claude-3-5-sonnet-20240620-v1:0",
            messages=messages_for_api,
            system=system_prompts,
            # Optional: Add inference config like max tokens, temperature
            # inferenceConfig={ "maxTokens": 2048, "temperature": 0.7 }
        )
        logger.info("Received stream response from Bedrock Converse API.")
        stream = response.get('stream')

        if stream:
            logger.info("Processing stream...")
            for event in stream:
                block_type = "unknown"
                message_text = ""

                if 'messageStart' in event:
                    logger.debug(f"Stream message start: Role = {event['messageStart'].get('role')}")
                    block_type = "start"
                elif 'contentBlockDelta' in event:
                    block_type = "delta"
                    delta = event['contentBlockDelta']['delta']
                    if 'text' in delta:
                        message_text = delta['text']
                        if message_text:
                            full_response_text += message_text # Accumulate locally
                            delta_data = {'statusCode': 200, 'type': block_type, 'text': message_text}
                            if not send_ws_message(gateway_client, connectionId, delta_data):
                                logger.warning("Stopping stream processing as WebSocket send failed (client likely disconnected).")
                                break # Stop processing if we can't send back
                elif 'messageStop' in event:
                    stop_reason = event['messageStop'].get('stopReason')
                    logger.info(f"Stream message stop. Reason: {stop_reason}")
                    stream_finished_normally = True
                    # Don't break here if metadata event can come after messageStop
                elif 'metadata' in event:
                    # Optional: Log usage tokens if needed
                    # usage = event['metadata'].get('usage', {})
                    # logger.info(f"Usage - Input: {usage.get('inputTokens')}, Output: {usage.get('outputTokens')}")
                    logger.debug(f"Stream metadata received: {event['metadata']}")
                    # If metadata includes stop_reason, could also set stream_finished_normally here
                    if event['metadata'].get('stopReason'):
                         stream_finished_normally = True # Ensure flag is set if stop reason is in metadata
                    break # Often safe to break after metadata containing usage/stop reason
                elif 'contentBlockStop' in event:
                    logger.debug("Stream content block stop event received.")
                else:
                    unhandled_key = list(event.keys())[0] if event else "None"
                    logger.warning(f"Unhandled stream event type/key: {unhandled_key}")

            # --- After stream processing loop ---
            logger.info(f"Finished processing stream loop. Stream finished normally: {stream_finished_normally}")
            logger.info(f"Full response text accumulated: {full_response_text[:500]}...") # Log accumulated text

            # Send sources only if relevant and found earlier
            if is_kb_relevant and sources:
                sources_data = {'statusCode': 200, 'type': 'sources', 'sources': sources}
                send_ws_message(gateway_client, connectionId, sources_data)

            # Send end signal (use helper function)
            status_code = 200 if stream_finished_normally else 500
            end_data = {'statusCode': status_code, 'type': 'end'}
            if not stream_finished_normally:
                end_data['reason'] = 'Stream did not report a normal stop reason.'
            send_ws_message(gateway_client, connectionId, end_data)

        else: # Handle case where Bedrock response didn't contain a 'stream'
            logger.error("No 'stream' object found in Bedrock Converse API response.")
            send_error_and_end(gateway_client, connectionId, "LLM response error (no stream).", 500)
            return {'statusCode': 500, 'body': json.dumps({'error': 'Bedrock response missing stream.'})}

    except ClientError as e: # Catch specific boto3 errors like Throttling
        error_text = f'LLM API Error: {type(e).__name__} - {e}'
        logger.error(error_text)
        logger.exception("Bedrock Converse API ClientError Details:")
        send_error_and_end(gateway_client, connectionId, f'LLM API Error: {type(e).__name__}', 500)
        return {'statusCode': 500, 'body': json.dumps({'error': error_text})}
    except Exception as e: # Catch broader errors during streaming/API call
        error_text = f'Error during LLM interaction: {type(e).__name__} - {e}'
        logger.error(error_text)
        logger.exception("LLM Interaction Unexpected Exception Details:")
        send_error_and_end(gateway_client, connectionId, f'Error during LLM interaction: {type(e).__name__}', 500)
        return {'statusCode': 500, 'body': json.dumps({'error': error_text})}

    logger.info("Successfully processed request and streamed response or handled error.")
    return {'statusCode': 200, 'body': json.dumps({'message': 'Message processed successfully'})}