import { Stack, StackProps, Duration, RemovalPolicy, CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as secrets from "aws-cdk-lib/aws-secretsmanager";
import * as iam from "aws-cdk-lib/aws-iam";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import * as scheduler from "aws-cdk-lib/aws-scheduler";
import * as apigw from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * The full AlphaBeacon architecture as code.
 *
 * NOTE: the RAG layer (Bedrock Knowledge Base + OpenSearch Serverless vector store) is added
 * in a follow-up once the ingestion pipeline lands — it needs either L1 CfnResources or the
 * generative-ai-cdk-constructs library, kept out here to keep the base stack dependency-light.
 */
export class AlphaBeaconStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const backend = (name: string) =>
      path.join(__dirname, "..", "..", "services", "backend", "src", name);

    // ── Data & storage ──────────────────────────────────────────────
    // Single-table design: PK = TENANT#<id>, SK = <ENTITY>#<id>
    const table = new dynamodb.Table(this, "Table", {
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const assets = new s3.Bucket(this, "Assets", {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const linkedInSecret = new secrets.Secret(this, "LinkedInSecret", {
      description: "LinkedIn OAuth tokens + third-party API keys (per tenant)",
    });

    // ── Auth ────────────────────────────────────────────────────────
    const userPool = new cognito.UserPool(this, "UserPool", {
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const userPoolClient = userPool.addClient("AdminClient", {
      authFlows: { userSrp: true },
    });

    // ── Bedrock access (text + image models) ────────────────────────
    const bedrockPolicy = new iam.PolicyStatement({
      actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
      resources: ["*"], // scope to specific model ARNs once model IDs are locked
    });

    const commonEnv = {
      TABLE_NAME: table.tableName,
      ASSETS_BUCKET: assets.bucketName,
      LINKEDIN_SECRET_ARN: linkedInSecret.secretArn,
    };

    const makeFn = (name: string, file: string, timeout = 30) => {
      const fn = new NodejsFunction(this, name, {
        runtime: Runtime.NODEJS_20_X,
        entry: backend(file),
        handler: "handler",
        timeout: Duration.seconds(timeout),
        memorySize: 512,
        environment: commonEnv,
        bundling: { minify: true },
      });
      table.grantReadWriteData(fn);
      assets.grantReadWrite(fn);
      linkedInSecret.grantRead(fn);
      fn.addToRolePolicy(bedrockPolicy);
      return fn;
    };

    // ── Daily pipeline (Step Functions) ─────────────────────────────
    const collect = makeFn("CollectSignals", "pipeline/collect-signals.ts", 120);
    const generate = makeFn("GenerateDraft", "pipeline/generate-drafts.ts", 120);
    const image = makeFn("GenerateImage", "pipeline/generate-images.ts", 120);
    const guard = makeFn("Guardrails", "pipeline/guardrails.ts", 60);
    const assemble = makeFn("Assemble", "pipeline/assemble.ts", 60);

    const collectTask = new tasks.LambdaInvoke(this, "Collect signals", {
      lambdaFunction: collect,
      outputPath: "$.Payload",
    });

    // Fan out: one draft per tone profile, generated in parallel. itemSelector builds each
    // branch's input by merging the current tone ($$.Map.Item.Value) with the shared run
    // context (tenantId, brand, signals, grounding…) so "generate draft" gets a full payload.
    const perTone = new sfn.Map(this, "Per tone", {
      itemsPath: "$.tones",
      itemSelector: {
        tenantId: sfn.JsonPath.stringAt("$.tenantId"),
        runId: sfn.JsonPath.stringAt("$.runId"),
        tone: sfn.JsonPath.objectAt("$$.Map.Item.Value"),
        brand: sfn.JsonPath.objectAt("$.brand"),
        topics: sfn.JsonPath.objectAt("$.topics"),
        signals: sfn.JsonPath.objectAt("$.signals"),
        grounding: sfn.JsonPath.objectAt("$.grounding"),
        exemplars: sfn.JsonPath.objectAt("$.exemplars"),
        instruction: sfn.JsonPath.stringAt("$.instruction"),
      },
      resultPath: "$.drafts",
      maxConcurrency: 5,
    });
    perTone.itemProcessor(
      new tasks.LambdaInvoke(this, "Generate draft", { lambdaFunction: generate, outputPath: "$.Payload" })
        .next(new tasks.LambdaInvoke(this, "Generate image", { lambdaFunction: image, outputPath: "$.Payload" }))
        .next(new tasks.LambdaInvoke(this, "Run guardrails", { lambdaFunction: guard, outputPath: "$.Payload" })),
    );

    const assembleTask = new tasks.LambdaInvoke(this, "Assemble shortlist", {
      lambdaFunction: assemble,
      outputPath: "$.Payload",
    });

    const definition = collectTask.next(perTone).next(assembleTask);
    const stateMachine = new sfn.StateMachine(this, "DailyPipeline", {
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      timeout: Duration.minutes(15),
    });

    // ── Scheduler: trigger the pipeline per tenant at the configured time ─
    const schedulerRole = new iam.Role(this, "SchedulerRole", {
      assumedBy: new iam.ServicePrincipal("scheduler.amazonaws.com"),
    });
    stateMachine.grantStartExecution(schedulerRole);
    // Alpha Pro MENA daily schedule: 2:00 PM Jordan time.
    // (Per-tenant schedules are created dynamically by the API for additional tenants.)
    new scheduler.CfnSchedule(this, "DefaultDailySchedule", {
      flexibleTimeWindow: { mode: "OFF" },
      scheduleExpression: "cron(0 14 * * ? *)",
      scheduleExpressionTimezone: "Asia/Amman",
      target: {
        arn: stateMachine.stateMachineArn,
        roleArn: schedulerRole.roleArn,
        input: JSON.stringify({ tenantId: "alpha-pro-mena" }),
      },
      state: "DISABLED", // enabled once Bedrock + config are live
    });

    // ── API (HTTP API + Lambda) ─────────────────────────────────────
    const api = makeFn("ApiHandler", "api/handler.ts", 30);
    stateMachine.grantStartExecution(api);
    api.addEnvironment("STATE_MACHINE_ARN", stateMachine.stateMachineArn);

    const httpApi = new apigw.HttpApi(this, "HttpApi", {
      corsPreflight: { allowOrigins: ["*"], allowMethods: [apigw.CorsHttpMethod.ANY], allowHeaders: ["*"] },
    });
    httpApi.addRoutes({
      path: "/{proxy+}",
      methods: [apigw.HttpMethod.ANY],
      integration: new HttpLambdaIntegration("ApiIntegration", api),
    });

    // ── Outputs ─────────────────────────────────────────────────────
    new CfnOutput(this, "ApiUrl", { value: httpApi.apiEndpoint });
    new CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
    new CfnOutput(this, "UserPoolClientId", { value: userPoolClient.userPoolClientId });
    new CfnOutput(this, "TableName", { value: table.tableName });
    new CfnOutput(this, "AssetsBucket", { value: assets.bucketName });
  }
}
