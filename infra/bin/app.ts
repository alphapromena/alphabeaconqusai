#!/usr/bin/env node
import { App } from "aws-cdk-lib";
import { AlphaBeaconStack } from "../lib/alphabeacon-stack.js";

const app = new App();

new AlphaBeaconStack(app, "AlphaBeacon", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    // us-east-1: broadest Amazon Bedrock model availability (text + image).
    region: process.env.CDK_DEFAULT_REGION ?? "us-east-1",
  },
});
