import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigatewayv2 from '@aws-cdk/aws-apigatewayv2-alpha'; // Use alpha module for WebSocketApi
import * as apigatewayv2_integrations from '@aws-cdk/aws-apigatewayv2-integrations-alpha'; // Use alpha module for integrations
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { bedrock } from '@cdklabs/generative-ai-cdk-constructs';
import * as amplify from '@aws-cdk/aws-amplify-alpha'; // Use alpha module for Amplify App
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import { Construct } from 'constructs';

interface CdkBackendStackProps extends cdk.StackProps {
  githubToken: string;
}

export class CdkBackendStackInstanceB extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CdkBackendStackProps) {
    super(scope, id, props);

    // --- Knowledge Base Setup ---
    const kb = new bedrock.KnowledgeBase(this, 'kb-instanceB', {
      embeddingsModel: bedrock.BedrockFoundationModel.TITAN_EMBED_TEXT_V1, // *** NOTE: Make sure this matches the model used during ingestion ***
      instruction: 'Knowledge base for Litigation B',
    });

    // --- S3 Bucket Reference ---
    // Use the exact name provided in your frontend info
    const bucketB = s3.Bucket.fromBucketName(
      this,
      'bucket-instanceB',
      'cdkbackendstack-instanceb-litigationbdocbucket15a6-4leqsqspqrxj'
    );

    // --- Knowledge Base Data Source ---
    const dataSourceB = new bedrock.S3DataSource(this, 'datasource-instanceB', {
       bucket: bucketB,
       knowledgeBase: kb,
       chunkingStrategy: bedrock.ChunkingStrategy.DEFAULT, // Or FIXED_SIZE if you prefer
       // Optional: maxTokens, overlapPercentage
     });

    // --- WebSocket API Setup ---
    const webSocketApi = new apigatewayv2.WebSocketApi(this, 'ws-api-instanceB', {
      apiName: 'ws-api-instanceB',
      // Define routes needed - $connect, $disconnect, $default, sendMessage
      connectRouteOptions: { integration: new apigatewayv2_integrations.WebSocketMockIntegration('connect')}, // Example mock integration
      disconnectRouteOptions: { integration: new apigatewayv2_integrations.WebSocketMockIntegration('disconnect') }, // Example mock integration
      defaultRouteOptions: { integration: new apigatewayv2_integrations.WebSocketMockIntegration('default') } // Example mock integration
    });

    const webSocketStage = new apigatewayv2.WebSocketStage(this, 'ws-stage-instanceB', {
      webSocketApi,
      stageName: 'production', // Your stage name
      autoDeploy: true,
    });

    // --- Lambda Functions Setup ---
    // Bedrock Interaction Lambda
    const lambdaXbedrock = new lambda.Function(this, 'lambda-bedrock-instanceB', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.lambda_handler',
      code: lambda.Code.fromAsset('lambda/lambdaXbedrock'),
      environment: {
        // Pass the **Callback URL** for the Lambda to send messages back
        URL: webSocketStage.callbackUrl,
        KNOWLEDGE_BASE_ID: kb.knowledgeBaseId,
      },
      timeout: cdk.Duration.minutes(5), // Increase timeout if needed for Bedrock calls
    });

    // Grant Bedrock Lambda permissions
    lambdaXbedrock.addToRolePolicy(new iam.PolicyStatement({
        actions: ['bedrock:Retrieve', 'bedrock:InvokeModel'], // Specific permissions are better
        resources: [
            kb.knowledgeBaseArn, // Permission for the specific KB
            `arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-3-5-sonnet-20240620-v1:0`, // Permission for specific model
            `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v1` // Check model name
            // Add other models if used
        ],
    }));
    lambdaXbedrock.addToRolePolicy(new iam.PolicyStatement({ // Permission to send messages back
        actions: ['execute-api:ManageConnections'],
        resources: [`arn:aws:execute-api:${this.region}:${this.account}:${webSocketApi.apiId}/${webSocketStage.stageName}/POST/@connections/*`],
    }));

    // WebSocket Handler Lambda
    const webSocketHandler = new lambda.Function(this, 'websocket-handler-instanceB', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.lambda_handler', // Assuming file is lambda/web-socket-handler/index.py
      code: lambda.Code.fromAsset('lambda/web-socket-handler'),
      environment: {
        RESPONSE_FUNCTION_ARN: lambdaXbedrock.functionArn,
      },
    });

    // Grant WebSocket Handler permission to invoke the Bedrock Lambda
    lambdaXbedrock.grantInvoke(webSocketHandler);


    // --- WebSocket API Route Integration ---
    // Add the 'sendMessage' route to trigger the handler lambda
    webSocketApi.addRoute('sendMessage', {
      integration: new apigatewayv2_integrations.WebSocketLambdaIntegration(
        'ws-sendMessage-integration-instanceB', // Integration ID
        webSocketHandler // The Lambda function to integrate with
      ),
    });


    // --- Amplify Frontend App Setup ---
    // Retrieve GitHub Token from Secrets Manager
     const githubTokenSecret = secretsmanager.Secret.fromSecretNameV2(
       this,
       'GitHubTokenInstanceBImport', // ID for CDK construct
       'pc-github-token' // Actual name of the secret in Secrets Manager
     );


    const amplifyApp = new amplify.App(this, 'litigationB-ReactApp', {
      appName: 'litigationB-ReactApp', // Optional: customize app name
      sourceCodeProvider: new amplify.GitHubSourceCodeProvider({
        owner: 'Population-Council', // Your GitHub owner/organization
        repository: 'Drugs-Side-Effect-Classification', // Your repository name
        oauthToken: githubTokenSecret.secretValue, // Reference the secret value
      }),
      // Define build settings
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '1.0',
        frontend: {
          phases: {
            preBuild: {
              commands: ['cd frontend', 'npm ci'] // Navigate and install dependencies
            },
            build: {
              commands: ['npm run build'] // Build command for React app
            }
          },
          artifacts: {
            baseDirectory: 'frontend/build', // Output directory
            files: ['**/*']
          },
          cache: {
            paths: ['frontend/node_modules/**/*'] // Cache dependencies
          }
        }
      }),
       // Note: platform attribute might be needed depending on amplify-alpha version
       // platform: amplify.Platform.WEB,
    });

    // Add a branch (e.g., main)
    const mainBranch = amplifyApp.addBranch('main', {
      autoBuild: true, // Automatically build on push
      stage: 'PRODUCTION', // Or 'DEVELOPMENT', etc.
    });

    // --- * KEY CHANGE HERE * ---
    // Construct the correct WebSocket connection URL (wss://) for the frontend
    const webSocketConnectUrl = `wss://${webSocketApi.apiId}.execute-api.${this.region}.amazonaws.com/${webSocketStage.stageName}`;

    // Add Environment Variables for the Amplify App
    amplifyApp.addEnvironment('REACT_APP_WEBSOCKET_API', webSocketConnectUrl); // <<< Use the correct wss:// URL
    amplifyApp.addEnvironment('REACT_APP_BUCKET_NAME', bucketB.bucketName);
    amplifyApp.addEnvironment('REACT_APP_KNOWLEDGE_BASE_ID', kb.knowledgeBaseId);

    // Grant Amplify Role access to read the secret if needed (usually Amplify handles this implicitly with GitHubSourceCodeProvider)
    // githubTokenSecret.grantRead(amplifyApp.grantPrincipal);


    // --- CDK Outputs ---
    new cdk.CfnOutput(this, 'BucketNameInstanceB', { value: bucketB.bucketName });
    new cdk.CfnOutput(this, 'KnowledgeBaseIdInstanceB', { value: kb.knowledgeBaseId });
    // Output both WebSocket URLs for clarity
    new cdk.CfnOutput(this, 'WebSocketConnectURLInstanceB', {
        value: webSocketConnectUrl,
        description: 'WebSocket URL for frontend connection (wss://)'
    });
    new cdk.CfnOutput(this, 'WebSocketCallbackURLInstanceB', {
        value: webSocketStage.callbackUrl,
        description: 'WebSocket Callback URL for backend Lambda (https://)'
    });
    new cdk.CfnOutput(this, 'AmplifyAppURLInstanceB', {
      value: `https://${mainBranch.branchName}.${amplifyApp.appId}.amplifyapp.com`, // Construct the Amplify URL
      description: 'Amplify Application URL for litigationB-ReactApp',
    });
  }
}