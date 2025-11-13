# /home/zvallarino/AI_AWS_PC/Drugs-Side-Effect-Classification/cdk_backend/lambda/web-socket-handler/index.py
import os
import json
import boto3
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

lambda_client = boto3.client('lambda')

def handle_message(event, connection_id):
    logger.info(f"handle_message called with event: {json.dumps(event)}")
    response_function_arn = os.environ['RESPONSE_FUNCTION_ARN']

    try:
        body_str = event.get('body', '{}')
        body = json.loads(body_str)

        prompt = body.get('prompt')
        history = body.get('history', [])
        selected_role = body.get('role', 'researchAssistant')

        if not isinstance(history, list):
            logger.warning(f"Expected 'history' to be a list, but got {type(history)}. Setting history to an empty list.")
            history = []

        input_payload = {
            "prompt": prompt,
            "connectionId": connection_id,
            "history": history,
            "role": selected_role
        }

        logger.info(f"Invoking lambdaXbedrock with payload: {json.dumps(input_payload)}")

        lambda_client.invoke(
            FunctionName=response_function_arn,
            InvocationType='Event',
            Payload=json.dumps(input_payload)
        )

        return {'statusCode': 200, 'body': json.dumps({'message': 'Message forwarded successfully'})}

    except json.JSONDecodeError:
        logger.error("Failed to decode JSON body")
        return {'statusCode': 400, 'body': json.dumps({'error': 'Invalid JSON format in request body.'})}
    except Exception as e:
        logger.error(f"Error in handle_message: {e}")
        logger.exception("Exception details:")
        return {'statusCode': 500, 'body': json.dumps({'error': 'Internal server error processing message.'})}


def handle_feedback(event):
    """Handle feedback submission - payload is in root of event for this route"""
    logger.info(f"handle_feedback called with event: {json.dumps(event)}")
    response_function_arn = os.environ['RESPONSE_FUNCTION_ARN']

    try:
        # For submitFeedback route, the payload is directly in the event
        payload = {
            "action": event.get('action'),
            "rating": event.get('rating'),
            "botMessage": event.get('botMessage'),
            "userMessage": event.get('userMessage'),
            "timestamp": event.get('timestamp'),
            "connectionId": event.get('requestContext', {}).get('connectionId', 'unknown')
        }

        logger.info(f"Invoking lambdaXbedrock with feedback payload")

        lambda_client.invoke(
            FunctionName=response_function_arn,
            InvocationType='Event',
            Payload=json.dumps(payload)
        )

        return {'statusCode': 200, 'body': json.dumps({'message': 'Feedback forwarded successfully'})}

    except Exception as e:
        logger.error(f"Error in handle_feedback: {e}")
        logger.exception("Exception details:")
        return {'statusCode': 500, 'body': json.dumps({'error': 'Internal server error processing feedback.'})}


def lambda_handler(event, context):
    logger.info(f"lambda_handler called with event: {json.dumps(event)}")
    
    # Check if this is a feedback event (action is at root level)
    if event.get('action') == 'submitFeedback':
        logger.info("Detected submitFeedback action at root level")
        return handle_feedback(event)
    
    # For WebSocket routes, get routeKey and connectionId
    route_key = event.get('requestContext', {}).get('routeKey')
    connection_id = event.get('requestContext', {}).get('connectionId')

    if route_key == 'submitFeedback':
        logger.info("Handling submitFeedback route")
        return handle_feedback(event)

    # For other routes, require connectionId
    if not connection_id:
        logger.error("Missing connectionId in requestContext")
        if route_key == 'sendMessage':
             return {'statusCode': 400, 'body': 'Connection ID missing.'}
        else:
             logger.info(f"Handling non-sendMessage route: {route_key}")
             return {'statusCode': 200, 'body': 'Route processed.'}

    if route_key == '$connect':
         logger.info(f"Handling $connect for connectionId: {connection_id}")
         return {'statusCode': 200, 'body': 'Connect successful.'}
    elif route_key == '$disconnect':
         logger.info(f"Handling $disconnect for connectionId: {connection_id}")
         return {'statusCode': 200, 'body': 'Disconnect successful.'}
    elif route_key == 'sendMessage':
        logger.info(f"Handling sendMessage for connectionId: {connection_id}")
        return handle_message(event, connection_id)
    else:
        logger.warning(f"Unsupported routeKey: {route_key} for connectionId: {connection_id}")
        return {'statusCode': 200, 'body': json.dumps({'message': f'Unsupported route: {route_key}'})}