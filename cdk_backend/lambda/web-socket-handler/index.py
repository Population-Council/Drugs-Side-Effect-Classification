import os
import json
import boto3
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

lambda_client = boto3.client('lambda')
# api_client = boto3.client('apigatewaymanagementapi') # No longer needed, lambdaXbedrock calls this

def handle_message(event, connection_id):
    logger.info(f"handle_message called with event: {json.dumps(event)}") # Log the entire event
    response_function_arn = os.environ['RESPONSE_FUNCTION_ARN']

    prompt = json.loads(event.get('body', '{}')).get('prompt')
    # print("Complete Event:", json.dumps(event, indent=2))
    # Extract and process history
    body_str = event.get('body', '{}')
    body = json.loads(body_str)
    history = body.get('history', [])

    if not isinstance(history, list):
        logger.warning(f"Expected 'history' to be a list, but got {type(history)}. Setting history to an empty list.")
        history = []

    input = {
        "prompt": prompt,
        "connectionId": connection_id,
        "history": history
    }
    print(input) # Redundant with logger.info, but leave it
    lambda_client.invoke(
        FunctionName=response_function_arn,
        InvocationType='Event',
        Payload=json.dumps(input)
    )

    return {'statusCode': 200}

def lambda_handler(event, context):
    logger.info(f"lambda_handler called with event: {json.dumps(event)}")  # Log the incoming event
    route_key = event.get('requestContext', {}).get('routeKey')
    connection_id = event.get('requestContext', {}).get('connectionId')

    if route_key == 'sendMessage':
        return handle_message(event, connection_id)
    else:
        return {'statusCode': 400, 'body': 'Unsupported route'}