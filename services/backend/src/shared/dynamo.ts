import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  BatchWriteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import type { Draft, DraftStatus, Feedback, KnowledgeChunk, Post, Run, TenantConfig } from "@alphabeacon/shared";
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

/** Patch a single draft in place (inline edit / status change from the review queue). */
export async function patchDraft(
  tenantId: string,
  runId: string,
  draftId: string,
  patch: { editedBody?: string; status?: DraftStatus },
): Promise<void> {
  const sets: string[] = [];
  const names: Record<string, string> = { "#d": "data" };
  const vals: Record<string, unknown> = {};
  if (patch.editedBody !== undefined) {
    sets.push("#d.#eb = :eb");
    names["#eb"] = "editedBody";
    vals[":eb"] = patch.editedBody;
  }
  if (patch.status !== undefined) {
    sets.push("#d.#st = :st");
    names["#st"] = "status";
    vals[":st"] = patch.status;
  }
  if (!sets.length) return;
  await doc.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { pk: pk(tenantId), sk: `DRAFT#${runId}#${draftId}` },
      UpdateExpression: "SET " + sets.join(", "),
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: vals,
    }),
  );
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

export async function listFeedback(tenantId: string, limit = 100): Promise<Feedback[]> {
  const res = await doc.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
      ExpressionAttributeValues: { ":pk": pk(tenantId), ":sk": "FEEDBACK#" },
      ScanIndexForward: false,
      Limit: limit,
    }),
  );
  return (res.Items ?? []).map((i) => i.data as Feedback);
}

/** Recent draft opening lines across runs — fed to generation as "angles to avoid repeating". */
export async function recentDraftLeads(tenantId: string, limit = 8): Promise<string[]> {
  const res = await doc.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
      ExpressionAttributeValues: { ":pk": pk(tenantId), ":sk": "DRAFT#" },
      ScanIndexForward: false,
      Limit: limit * 2,
    }),
  );
  const leads = (res.Items ?? [])
    .map((i) => i.data as Draft)
    .map((d) => (d.editedBody ?? d.body).replace(/\s+/g, " ").trim().slice(0, 90))
    .filter(Boolean);
  return Array.from(new Set(leads)).slice(0, limit);
}

// ── Knowledge base (lightweight RAG: chunks + vectors, cosine search in the Lambda) ──
export async function putKnowledgeChunks(chunks: KnowledgeChunk[]): Promise<void> {
  if (!chunks.length) return;
  const items = chunks.map((c) => ({
    PutRequest: {
      Item: { pk: pk(c.tenantId), sk: `KNOW#${c.docId}#${String(c.chunkIdx).padStart(4, "0")}`, data: c },
    },
  }));
  for (let i = 0; i < items.length; i += 25) {
    await doc.send(new BatchWriteCommand({ RequestItems: { [TABLE]: items.slice(i, i + 25) } }));
  }
}

export async function listKnowledgeChunks(tenantId: string): Promise<KnowledgeChunk[]> {
  const out: KnowledgeChunk[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await doc.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
        ExpressionAttributeValues: { ":pk": pk(tenantId), ":sk": "KNOW#" },
        ExclusiveStartKey,
      }),
    );
    for (const i of res.Items ?? []) out.push(i.data as KnowledgeChunk);
    ExclusiveStartKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (ExclusiveStartKey);
  return out;
}

/**
 * Learning loop: turn human feedback into generation context. Up-rated drafts become few-shot
 * exemplars (echo their style, not their content); every comment becomes a preference note.
 */
export async function getLearningContext(
  tenantId: string,
  { maxExemplars = 3, maxNotes = 6 } = {},
): Promise<{ exemplars: string[]; preferenceNotes: string[] }> {
  const feedback = await listFeedback(tenantId, 100);
  if (!feedback.length) return { exemplars: [], preferenceNotes: [] };

  // Map every draft body by id so up-rated feedback can pull the exemplar text.
  const res = await doc.send(
    new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
      ExpressionAttributeValues: { ":pk": pk(tenantId), ":sk": "DRAFT#" },
    }),
  );
  const bodyById = new Map<string, string>();
  for (const i of res.Items ?? []) {
    const d = i.data as Draft;
    bodyById.set(d.draftId, d.editedBody ?? d.body);
  }

  const exemplars = feedback
    .filter((f) => f.rating === "up")
    .map((f) => bodyById.get(f.draftId))
    .filter((b): b is string => Boolean(b))
    .slice(0, maxExemplars);

  const preferenceNotes = feedback
    .filter((f) => f.comment)
    .map((f) => `(${f.rating ?? "note"}) ${f.comment}`)
    .slice(0, maxNotes);

  return { exemplars, preferenceNotes };
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
