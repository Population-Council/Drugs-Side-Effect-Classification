import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigatewayv2 from '@aws-cdk/aws-apigatewayv2-alpha';
import * as apigatewayv2_integrations from '@aws-cdk/aws-apigatewayv2-integrations-alpha';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { bedrock } from '@cdklabs/generative-ai-cdk-constructs';
import * as amplify from '@aws-cdk/aws-amplify-alpha';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import { Construct } from 'constructs';

interface CdkBackendStackProps extends cdk.StackProps {
  githubToken: string;
}

export class CdkBackendStackInstanceB extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CdkBackendStackProps) {
    super(scope, id, props);

    const kb = new bedrock.KnowledgeBase(this, 'kb-instanceB', {
      embeddingsModel: bedrock.BedrockFoundationModel.TITAN_EMBED_TEXT_V2_1024,
      instruction: 'Knowledge base for Litigation B',
    });

    const bucketB = s3.Bucket.fromBucketName(
      this,
      'bucket-instanceB',
      'cdkbackendstack-instanceb-litigationbdocbucket15a6-4leqsqspqrxj'
    );

    const dataSourceB = new bedrock.S3DataSource(this, 'datasource-instanceB', {
      bucket: bucketB,
      knowledgeBase: kb,
      chunkingStrategy: bedrock.ChunkingStrategy.DEFAULT,
    });

    const webSocketApi = new apigatewayv2.WebSocketApi(this, 'ws-api-instanceB', {
      apiName: 'ws-api-instanceB',
    });

    const webSocketStage = new apigatewayv2.WebSocketStage(this, 'ws-stage-instanceB', {
      webSocketApi,
      stageName: 'production',
      autoDeploy: true,
    });

    const lambdaXbedrock = new lambda.Function(this, 'lambda-bedrock-instanceB', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.lambda_handler',
      code: lambda.Code.fromAsset('lambda/lambdaXbedrock'),
      environment: {
        URL: webSocketStage.callbackUrl,
        KNOWLEDGE_BASE_ID: kb.knowledgeBaseId,
      },
    });

    lambdaXbedrock.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:*', 'execute-api:ManageConnections'],
      resources: ['*'],
    }));

    const webSocketHandler = new lambda.Function(this, 'websocket-handler-instanceB', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'index.lambda_handler',
      code: lambda.Code.fromAsset('lambda/web-socket-handler'),
      environment: {
        RESPONSE_FUNCTION_ARN: lambdaXbedrock.functionArn,
      },
    });

    lambdaXbedrock.grantInvoke(webSocketHandler);

    webSocketApi.addRoute('sendMessage', {
      integration: new apigatewayv2_integrations.WebSocketLambdaIntegration(
        'ws-integration-instanceB', webSocketHandler
      ),
    });

    webSocketHandler.addToRolePolicy(new iam.PolicyStatement({
      actions: ['execute-api:ManageConnections'],
      resources: [`arn:aws:execute-api:${this.region}:${this.account}:${webSocketApi.apiId}/${webSocketStage.stageName}/POST/@connections/*`],
    }));

    // ✅ Recreate Amplify App
    const githubTokenSecret = new secretsmanager.Secret(this, 'GitHubTokenInstanceB', {
      secretName: 'pc-github-token-instanceB',
      secretStringValue: cdk.SecretValue.unsafePlainText(props.githubToken),
    });

    const amplifyApp = new amplify.App(this, 'litigationB-ReactApp', {
      appName: 'litigationB-ReactApp',
      sourceCodeProvider: new amplify.GitHubSourceCodeProvider({
        owner: 'Population-Council',
        repository: 'Drugs-Side-Effect-Classification',
        oauthToken: githubTokenSecret.secretValue,
      }),
      buildSpec: codebuild.BuildSpec.fromObject({
        version: '1.0',
        frontend: {
          phases: {
            preBuild: {
              commands: ['cd frontend', 'npm ci']
            },
            build: {
              commands: ['npm run build']
            }
          },
          artifacts: {
            baseDirectory: 'frontend/build',
            files: ['**/*']
          },
          cache: {
            paths: ['frontend/node_modules/**/*']
          }
        }
      }),
    });

    amplifyApp.addBranch('main', {
      autoBuild: true,
      stage: 'PRODUCTION',
    });

    amplifyApp.addEnvironment('REACT_APP_WEBSOCKET_API', webSocketStage.callbackUrl);
    amplifyApp.addEnvironment('REACT_APP_BUCKET_NAME', bucketB.bucketName);
    amplifyApp.addEnvironment('REACT_APP_KNOWLEDGE_BASE_ID', kb.knowledgeBaseId);

    githubTokenSecret.grantRead(amplifyApp);

    // Outputs
    new cdk.CfnOutput(this, 'BucketNameInstanceB', { value: bucketB.bucketName });
    new cdk.CfnOutput(this, 'KnowledgeBaseIdInstanceB', { value: kb.knowledgeBaseId });
    new cdk.CfnOutput(this, 'WebSocketURLInstanceB', { value: webSocketStage.callbackUrl });
    new cdk.CfnOutput(this, 'AmplifyAppURLInstanceB', {
      value: `https://${amplifyApp.defaultDomain}`,
      description: 'Amplify Application URL for litigationB-ReactApp',
    });
  }
}