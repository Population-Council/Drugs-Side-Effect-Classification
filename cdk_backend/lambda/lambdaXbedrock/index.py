import os
import json
import boto3
import re
import logging

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

def knowledge_base_retrieval(prompt, kb_id):
    """Retrieve relevant information from the Knowledge Base"""
    agent = boto3.client("bedrock-agent-runtime")
    query = {"text": prompt}
    
    # Retrieve relevant information from the Knowledge Base
    retrieval_configuration = {
        'vectorSearchConfiguration': {
            'numberOfResults': 5,
        }
    }
    
    # kb_response = agent.retrieve(knowledgeBaseId=kb_id, retrievalQuery=query, retrievalConfiguration=retrieval_configuration)
    kb_response = agent.retrieve(knowledgeBaseId=kb_id, retrievalQuery=query)
    logger.info("Retrieved information from Knowledge Base")
    return kb_response


def extract_sources(kb_results):
    """Extract and process sources from knowledge base results"""
    processed_sources = []
    
    # Extract sources and scores
    for sources in kb_results.get('retrievalResults', []):
        # Get the full S3 URI
        source_uri = sources.get("metadata", {}).get('x-amz-bedrock-kb-source-uri')
        page_number = sources.get("metadata", {}).get('x-amz-bedrock-kb-document-page-number')
        score = sources.get('score')
        
        if source_uri:
            # Replace 's3://' with 'https://s3.amazonaws.com/' to make it a valid URL
            processed_uri = re.sub(r'^s3://', 'https://s3.amazonaws.com/', source_uri)
            
            # Append the processed URI and score as a dictionary
            processed_sources.append({
                "url": processed_uri,
                "score": score,
                "page": page_number,
            })
    
    # Sort sources by score in descending order
    processed_sources.sort(key=lambda x: x.get('score', 0), reverse=True)
    return processed_sources


def is_relevant(sources):
    """
    Check if the top source score is above 0.4.
    """
    if not sources:
        return False
    
    # Get the top score
    top_score = sources[0].get('score', 0)
    return top_score > 0.4


def transform_history(history, limit=25):
    """Transform history into the format expected by Bedrock API"""
    transformed = []
    last_role = None  # To track the last role added
    user_found, assistant_found = False, False
    pending_sources = None  # To temporarily hold SOURCES messages

    for entry in history[-limit:]:  # Only take the last 'limit' entries
        role = 'user' if entry.get('sentBy') == 'USER' else 'assistant'
        content = entry.get('message', '')

        if entry.get('type') == 'SOURCES':
            # Store SOURCES to append to the previous assistant response
            pending_sources = content
            continue

        if role == 'user':
            user_found = True
        elif role == 'assistant':
            assistant_found = True

        if entry.get('type') == 'TEXT':
            # Append pending sources to the last assistant response, if any
            if pending_sources and last_role == 'assistant':
                transformed[-1]['content'][0]['text'] += f"\n\nSources:\n{pending_sources}"
                pending_sources = None

            # Skip adding duplicate roles in sequence
            if role == last_role:
                continue

            transformed.append({
                "role": role,
                "content": [
                    {
                        "text": content
                    }
                ]
            })
            last_role = role  # Update the last role

    # Handle any remaining SOURCES if not yet added
    if pending_sources and last_role == 'assistant':
        transformed[-1]['content'][0]['text'] += f"\n\nSources:\n{pending_sources}"

    # If there are non-alternating entries, only keep relevant ones
    if len(transformed) > 1 and transformed[-1]['role'] == last_role:
        transformed.pop()  # Skip the last one if redundant

    # If the history only contains one role, skip it since it's being sent separately
    if not (user_found and assistant_found):
        return []

    return transformed

# Helper functions for sending responses
def send_response(gateway, connection_id, block_type, message_text):
    """Send a response chunk to the WebSocket client"""
    try:
        data = {
            'statusCode': 200,
            'type': block_type,
            'text': message_text,
        }
        gateway.post_to_connection(ConnectionId=connection_id, Data=json.dumps(data))
    except Exception as e:
        logger.error(f"Error sending response: {str(e)}")

def send_sources(gateway, connection_id, sources):
    """Send sources information to the WebSocket client"""
    try:
        sources_data = {
            'statusCode': 200,
            'type': 'sources',
            'sources': sources,
        }
        gateway.post_to_connection(ConnectionId=connection_id, Data=json.dumps(sources_data))
    except Exception as e:
        logger.error(f"Error sending sources: {str(e)}")


# Define role prompts
ROLE_PROMPTS = {
    "researchAssistant": """You are a Research Assistant for the Population Council.
Your job is to provide accurate, helpful information about research papers, methodologies, 
and findings related to Population Council's work. Focus on being precise and academic in your tone.
Cite specific research papers when possible and maintain a scholarly approach.""",
    
    "softwareEngineer": """You are a Software Engineer specialized in research data systems.
Your primary focus is on technical explanations related to data processing, analysis methodologies,
and statistical approaches. Provide code examples when helpful and focus on technical precision.
Be concise and use technical terminology appropriate for software and data professionals.""",
    
    "genderYouthExpert": """You are a Gender and Youth Expert working with the Population Council.
Your expertise is in understanding the social, cultural, and health issues affecting young people,
especially girls and women in developing countries. Approach questions with cultural sensitivity
and focus on the human impact of research. Highlight interventions that have shown positive outcomes
for youth empowerment and gender equality."""
}


def lambda_handler(event, context):
    """Main Lambda handler function"""
    try:
        # Extract data from the event
        connection_id = event.get("connectionId")
        prompt = event.get("prompt")
        
        # Get role from the event with a default
        selected_role = event.get("role", "researchAssistant")
        
        # Validate role selection
        if selected_role not in ROLE_PROMPTS:
            selected_role = "researchAssistant"
            logger.warning(f"Invalid role: {selected_role}. Defaulting to researchAssistant.")
        
        logger.info(f"Using role: {selected_role}")
        
        # Retrieve and deserialize history
        history = event.get("history", [])
        logger.info(f"History length: {len(history)}")
        transformed_history = transform_history(history)
        
        # Get environment variables
        kb_id = os.environ['KNOWLEDGE_BASE_ID']
        
        # Get API Gateway endpoint URL
        domain_name = os.environ.get('API_GATEWAY_DOMAIN')
        stage = os.environ.get('API_GATEWAY_STAGE', 'prod')
        url = f"https://{domain_name}/{stage}"
        
        # Create API Gateway management client
        gateway = boto3.client("apigatewaymanagementapi", endpoint_url=url)
        
        # Validate input
        if not prompt:
            error_message = "No prompt provided in the event."
            logger.error(error_message)
            send_response(gateway, connection_id, "error", error_message)
            return {
                'statusCode': 400,
                'body': json.dumps({'error': error_message})
            }

        # Query Knowledge Base
        logger.info(f"Finding in Knowledge Base with ID: [{kb_id}]...")
        kb_response = knowledge_base_retrieval(prompt, kb_id)
        
        # Extract relevant text from retrieval results
        rag_info = ""
        for response in kb_response.get("retrievalResults", []):
            rag_info += response.get("content", {}).get("text", "") + "\n"
        
        # Get the role-specific prompt
        role_prompt = ROLE_PROMPTS.get(selected_role)
        
        # Construct the full prompt with retrieved information and role guidance
        full_prompt = f"""{role_prompt}

Use the following information from the knowledge source and answer the question based on this information.
If the information doesn't fully answer the question, acknowledge this and provide the best response with what's available:
    
{rag_info}

User's question: {prompt}
"""
        # Create Bedrock client
        bedrock = boto3.client(service_name="bedrock-runtime", region_name="us-west-2")
        
        # Send "start" message to client to indicate processing has begun
        send_response(gateway, connection_id, "start", "")
        
        # Prepare message payload
        message = {
            "role": "user",
            "content": [
                {
                    "text": full_prompt
                }
            ]
        }
        messages = transformed_history + [message]
        
        # Extract sources for citation
        logger.info("Extracting sources...")
        sources = extract_sources(kb_response)
        logger.info(f"Found {len(sources)} sources")

        # Invoke the Claude model through Bedrock
        logger.info("Sending query to Claude with role: " + selected_role)
        response = bedrock.converse_stream(
            modelId="anthropic.claude-3-5-sonnet-20241022-v2:0",
            messages=messages,
        )
        
        # Process streaming response
        temp_holder = ""
        stream = response.get('stream')
        if stream:
            for event in stream:
                if 'messageStart' in event:
                    # Message starting - no data to send yet
                    logger.info("Starting message stream")
                    
                elif 'contentBlockDelta' in event:
                    # Content streaming - send to client
                    block_type = "delta"
                    message_text = event['contentBlockDelta']['delta']['text']
                    
                    # Handle SOURCE tags in responses
                    if "SOURCE" in message_text:
                        temp_holder = message_text
                        message_text = ""
                    else:
                        message_text = temp_holder + message_text
                        temp_holder = ""
                        
                    send_response(gateway, connection_id, block_type, message_text)
                    
                elif 'messageStop' in event:
                    # Message completed
                    block_type = "end"
                    message_text = ""
                    send_response(gateway, connection_id, block_type, message_text)
                    
                    # Send sources if they are relevant
                    if is_relevant(sources):
                        send_sources(gateway, connection_id, sources)

        return {
            'statusCode': 200,
            'body': json.dumps({'message': 'Processing completed successfully'})
        }
        
    except Exception as e:
        error_message = f"Error in lambda_handler: {str(e)}"
        logger.error(error_message)
        
        try:
            # Try to send error message to client
            gateway = boto3.client("apigatewaymanagementapi", endpoint_url=url)
            send_response(gateway, connection_id, "error", error_message)
        except Exception as inner_e:
            logger.error(f"Failed to send error message: {str(inner_e)}")
            
        return {
            'statusCode': 500,
            'body': json.dumps({'error': error_message})
        }