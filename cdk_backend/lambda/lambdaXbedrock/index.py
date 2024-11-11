import os
import json
import boto3
import re

def knowledge_base_retrieval(prompt, kb_id):
    agent = boto3.client("bedrock-agent-runtime")
    query = {"text": prompt}
    # Retrieve relevant information from the Knowledge Base
    retrieval_configuration={
        'vectorSearchConfiguration': {
            'numberOfResults': 5,
        }
    }
    #for 5 responses hardcoded
    # kb_response = agent.retrieve(knowledgeBaseId=kb_id, retrievalQuery=query,retrievalConfiguration=retrieval_configuration)
    kb_response = agent.retrieve(knowledgeBaseId=kb_id, retrievalQuery=query)
    print(f"Updating the prompt for LLM...")
    return kb_response


def extract_sources(kb_results):
    processed_sources = []
    
    # Extract sources and scores
    print(kb_results)
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
    
    return processed_sources

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

def transform_history(history, limit=25):
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






def lambda_handler(event, context):
    # Retrieve the Knowledge Base ID from environment variables
    connectionId = event["connectionId"]
    prompt = event["prompt"]
    # Retrieve and deserialize history
    history = event.get("history", "[]")  # Default to an empty list if not provided
    print(f"History: {history}")
    transformed_history = transform_history(history)
    print(f"Transformed History: {transformed_history}")
    kb_id = os.environ['KNOWLEDGE_BASE_ID']
    url = os.environ['URL']
    
    gateway = boto3.client("apigatewaymanagementapi", endpoint_url=url)
    
    if not prompt:
        return {
            'statusCode': 400,
            'body': json.dumps({'error': 'No prompt provided in the event.'})
        }

    print(f"Finding in Knowledge Base with ID: [{kb_id}]...")
    kb_response = knowledge_base_retrieval(prompt, kb_id)

    
    # Prepare the retrieval query
    rag_info = ""
    for response in kb_response.get("retrievalResults", []):
        rag_info += response.get("content", {}).get("text", "") + "\n"
    

    
    # Construct the full prompt with retrieved information
    full_prompt = f"""Use the following information from the knowledge source and answer the question solely based on this information. Do not use any external information:
    
        {rag_info}

        User's question: {prompt}
        """
    bedrock = boto3.client(service_name="bedrock-runtime", region_name="us-west-2")
    message = {
        "role": "user",
        "content": [
            {
                "text": full_prompt
            }
        ]
    }
    messages = transformed_history + [message]
    
    print(f"Sending query to LLM using Converse API...{messages}")
    sources = extract_sources(kb_response)
    print(f"Extracted sources: {sources}")

    # Invoke the Converse API
    response = bedrock.converse_stream(
        modelId="anthropic.claude-3-5-sonnet-20241022-v2:0",
        messages=messages,
    )
    print("got response from bedrock")
    temp_holder = ""
    print(f"Response from Converse API: {response}")
    stream = response.get('stream')
    if stream:
        for event in stream:
            if 'messageStart' in event:
                block_type = "start"
                message_text = ""    
            elif 'contentBlockDelta' in event:
                block_type = "delta"
                message_text = event['contentBlockDelta']['delta']['text']
                if "SOURCE" in message_text:
                    temp_holder = message_text
                    message_text = ""
                else:
                    message_text = temp_holder + message_text
                    temp_holder = ""      
                
            elif 'messageStop' in event:
                block_type = "end"
                message_text = ""

            else:
                block_type = "blank"
                message_text = ""
            
            #Send the response body back through the gateway to the client    
            data = {
                'statusCode': 200,
                'type': block_type,
                'text': message_text,
            }
            gateway.post_to_connection(ConnectionId=connectionId, Data=json.dumps(data))
        sources_data = {
            'statusCode': 200,
            'type': 'sources',
            'sources': sources,
        }
        if is_relevant(sources):
            gateway.post_to_connection(ConnectionId=connectionId, Data=json.dumps(sources_data))
    return "Success"