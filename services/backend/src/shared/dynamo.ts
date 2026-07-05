import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import type { Draft, Feedback, Post, Run, TenantConfig } from "@alphabeacon/shared";
import { config } from "./config.js";

// removeUndefinedValues: optional fields (Run.finishedAt, Citation.sourceUrl, Draft.image…)
// are frequently undefined; without this the DocumentClient throws on marshalling.
const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: config.region }), {
  marshallOptions: { removeUndefinedValues: true },
});
const TABLE = config.tableName;

/** Single-table keys: pk = TENANT#<id>, sk = <ENTITY>#<...> */
const pk = (tenantId: string) => `TENANT#${tenantId}`;

export async function getConfig(tenantId: string): Promise<TenantConfig | undefined> {
  const res = await doc.send(new GetCommand({ TableName: TABLE, Key: { pk: pk(tenantId), sk: "CONFIG" } }));
  return res.Item?.data as TenantConfig | undefined;
}

export async function putConfig(cfg: TenantConfig): Promise<void> {
  await doc.send(new PutCommand({ TableName: TABLE, Item: { pk: pk(cfg.tenantId), sk: "CONFIG", data: cfg } }));
}

export async function putRun(run: Run): Promise<void> {
  await doc.send(new PutCommand({ TableName: TABLE, Item: { pk: pk(run.tenantId), sk: `RUN#${run.runId}`, data: run } }));
}

export async function getRun(tenantId: string, runId: string): Promise<Run | undefined> {
  const res = await doc.send(new GetCommand({ TableName: TABLE, Key: { pk: pk(tenantId), sk: `RUN#${runId}` } }));
  return res.Item?.data as Run | undefined;
}

/** The most recent completed run for a tenant — powers the admin's default review queue. */
export async function latestRun(tenantId: string): Promise<Run | undefined> {
  const res = await doc.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
      ExpressionAttributeValues: { ":pk": pk(tenantId), ":sk": "RUN#" },
    }),
  );
  const runs = (res.Items ?? []).map((i) => i.data as Run).filter((r) => r.status === "completed");
  runs.sort((a, b) => (b.finishedAt ?? b.startedAt ?? "").localeCompare(a.finishedAt ?? a.startedAt ?? ""));
  return runs[0];
}

export async function putDrafts(drafts: Draft[]): Promise<void> {
  if (!drafts.length) return;
  const items = drafts.map((d) => ({
    PutRequest: { Item: { pk: pk(d.tenantId), sk: `DRAFT#${d.runId}#${d.draftId}`, data: d } },
  }));
  // BatchWrite handles up to 25 items per call.
  for (let i = 0; i < items.length; i += 25) {
    await doc.send(new BatchWriteCommand({ RequestItems: { [TABLE]: items.slice(i, i + 25) } }));
  }
}

export async function listDrafts(tenantId: string, runId: string): Promise<Draft[]> {
  const res = await doc.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
      ExpressionAttributeValues: { ":pk": pk(tenantId), ":sk": `DRAFT#${runId}#` },
    }),
  );
  return (res.Items ?? []).map((i) => i.data as Draft);
}

export async function putFeedback(fb: Feedback): Promise<void> {
  await doc.send(
    new PutCommand({ TableName: TABLE, Item: { pk: pk(fb.tenantId), sk: `FEEDBACK#${fb.feedbackId}`, data: fb } }),
  );
}

/** Recent published post bodies — the repetition guard checks new drafts against these. */
export async function recentPostBodies(tenantId: string, limit = 30): Promise<string[]> {
  const res = await doc.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
      ExpressionAttributeValues: { ":pk": pk(tenantId), ":sk": "POST#" },
      ScanIndexForward: false,
      Limit: limit,
    }),
  );
  return (res.Items ?? []).map((i) => (i.data as Post).draftId).filter(Boolean) as string[];
}
