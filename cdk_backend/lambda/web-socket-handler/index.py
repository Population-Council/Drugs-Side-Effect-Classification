import os
import json
import boto3
import logging

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

lambda_client = boto3.client('lambda')
api_client = boto3.client('apigatewaymanagementapi')

def handle_message(event, connection_id):
    """Handle incoming WebSocket messages and forward to response Lambda"""
    response_function_arn = os.environ['RESPONSE_FUNCTION_ARN']
    
    # Parse the body content
    body_str = event.get('body', '{}')
    
    try:
        body = json.loads(body_str)
        prompt = body.get('prompt', '')
        history = body.get('history', [])
        
        # Extract role information (default to researchAssistant if not provided)
        selected_role = body.get('role', 'researchAssistant')
        
        logger.info(f"Selected role: {selected_role}")
        
        # Validate history is a list
        if not isinstance(history, list):
            logger.warning(f"Expected 'history' to be a list, but got {type(history)}. Setting history to an empty list.")
            history = []
            
        # Prepare input for the response Lambda
        input_payload = {
            "prompt": prompt,
            "connectionId": connection_id,
            "history": history,
            "role": selected_role  # Include the role in the payload
        }
        
        logger.info(f"Sending to response function with role: {selected_role}")
        
        # Invoke the response Lambda function
        lambda_client.invoke(
            FunctionName=response_function_arn,
            InvocationType='Event',
            Payload=json.dumps(input_payload)
        )
        
        return {'statusCode': 200}
        
    except json.JSONDecodeError as e:
        logger.error(f"JSON decode error: {str(e)}")
        return {'statusCode': 400, 'body': 'Invalid JSON body'}
        
    except Exception as e:
        logger.error(f"Error in handle_message: {str(e)}")
        return {'statusCode': 500, 'body': f"Server error: {str(e)}"}

def lambda_handler(event, context):
    """
    Main Lambda handler function for WebSocket API
    """
    route_key = event.get('requestContext', {}).get('routeKey')
    connection_id = event.get('requestContext', {}).get('connectionId')
    
    logger.info(f"Received event with route: {route_key}")
    
    if route_key == '$connect':
        return {'statusCode': 200, 'body': 'Connected'}
        
    elif route_key == '$disconnect':
        return {'statusCode': 200, 'body': 'Disconnected'}
        
    elif route_key == 'sendMessage':
        return handle_message(event, connection_id)
        
    else:
        logger.warning(f"Unsupported route: {route_key}")
        return {'statusCode': 400, 'body': 'Unsupported route'} 


# import os
# import json
# import boto3

# lambda_client = boto3.client('lambda')
# api_client = boto3.client('apigatewaymanagementapi')

# def handle_message(event, connection_id):
#     response_function_arn = os.environ['RESPONSE_FUNCTION_ARN']

#     prompt = json.loads(event.get('body', '{}')).get('prompt')
#     # print("Complete Event:", json.dumps(event, indent=2))
#     # Extract and process history
#     body_str = event.get('body', '{}')
#     body = json.loads(body_str)
#     history = body.get('history', [])
        
#     if not isinstance(history, list):
#         logger.warning(f"Expected 'history' to be a list, but got {type(history)}. Setting history to an empty list.")
#         history = []
    
#     input = {
#         "prompt": prompt,
#         "connectionId": connection_id,
#         "history": history    
#     }
#     print(input)
#     lambda_client.invoke(
#         FunctionName=response_function_arn,
#         InvocationType='Event',
#         Payload=json.dumps(input)
#     )
    
#     return {'statusCode': 200}

# def lambda_handler(event, context):
#     route_key = event.get('requestContext', {}).get('routeKey')
#     connection_id = event.get('requestContext', {}).get('connectionId')

#     if route_key == 'sendMessage':
#         return handle_message(event, connection_id)
#     else:
#         return {'statusCode': 400, 'body': 'Unsupported route'}