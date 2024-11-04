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


def lambda_handler(event, context):
    # Retrieve the Knowledge Base ID from environment variables
    connectionId = event["connectionId"]
    prompt = event["prompt"]
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

    # Prepare request parameters
    kwargs = {
        "modelId": "anthropic.claude-3-5-sonnet-20241022-v2:0",
        "contentType": "application/json",
        "accept": "application/json",
        "body": json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 1000,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": full_prompt
                        }
                    ]
                }
            ]
        })
    }
    
    print(f"Sending query to LLM using Converse API...")
    sources = extract_sources(kb_response)
    print(f"Extracted sources: {sources}")

    # Invoke the Converse API
    response = bedrock.invoke_model_with_response_stream(**kwargs)
    print("got response from bedrock")
    temp_holder = ""
    stream = response.get('body')
    if stream:

        #for each returned token from the model:
        for token in stream:

            #The "chunk" contains the model-specific response
            chunk = token.get('chunk')
            if chunk:
                
                #Decode the LLm response body from bytes
                chunk_text = json.loads(chunk['bytes'].decode('utf-8'))
                
                #Construct the response body based on the LLM response, (Where the generated text starts/stops)
                if chunk_text['type'] == "content_block_start":
                    block_type = "start"
                    message_text = ""
                    
                elif chunk_text['type'] == "content_block_delta":
                    block_type = "delta"
                    message_text = chunk_text['delta']['text']

                    if "SOURCE" in message_text:
                        temp_holder = message_text
                        message_text = ""
                    else:
                        message_text = temp_holder + message_text
                        temp_holder = ""      
                    
                elif chunk_text['type'] == "content_block_stop":
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