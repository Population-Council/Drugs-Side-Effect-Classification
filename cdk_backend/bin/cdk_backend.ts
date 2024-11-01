#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CdkBackendStack } from '../lib/cdk_backend-stack';

const app = new cdk.App();

const githubToken = app.node.tryGetContext('githubToken');
if (!githubToken) {
  throw new Error('GitHub token must be provided. Use -c githubToken=<your-token> when deploying.');
}

new CdkBackendStack(app, 'CdkBackendStack', {
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEFAULT_REGION 
  },
  githubToken: githubToken,
});