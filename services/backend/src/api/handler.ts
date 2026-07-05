import { randomUUID } from "node:crypto";
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import type { DraftStatus, Feedback, TenantConfig } from "@alphabeacon/shared";
import { config } from "../shared/config.js";
import { getConfig, latestRun, listDrafts, patchDraft, putConfig, putFeedback } from "../shared/dynamo.js";
import { ingestDocument } from "../rag/ingest.js";
import { withPresignedImages } from "../shared/s3.js";

const sfn = new SFNClient({ region: config.region });

interface HttpEvent {
  requestContext: { http: { method: string; path: string } };
  body?: string;
  queryStringParameters?: Record<string, string>;
}

/** Single Lambda behind API Gateway, routed by method + path. */
export async function handler(event: HttpEvent) {
  const { method, path } = event.requestContext.http;
  const body = event.body ? JSON.parse(event.body) : {};

  try {
    // Latest completed run + its drafts — the admin's default review queue (no runId needed).
    if (method === "GET" && path.startsWith("/runs/latest")) {
      const tenantId = event.queryStringParameters?.tenantId;
      if (!tenantId) return json(400, { error: "tenantId required" });
      const run = await latestRun(tenantId);
      if (!run) return json(200, { run: null, drafts: [] });
      return json(200, { run, drafts: await withPresignedImages(await listDrafts(tenantId, run.runId)) });
    }
    if (method === "GET" && path.startsWith("/drafts")) {
      const q = event.queryStringParameters ?? {};
      const drafts = q.tenantId && q.runId ? await listDrafts(q.tenantId, q.runId) : [];
      return json(200, { drafts: await withPresignedImages(drafts) });
    }
    if (method === "POST" && path === "/on-demand") return json(202, await onDemand(body));
    if (method === "POST" && path === "/feedback") return json(201, await saveFeedback(body));
    if (method === "POST" && path === "/publish") return json(200, await publish(body));

    // Inline edit / status change (approve, skip) from the review queue.
    if (method === "POST" && path === "/draft/edit") {
      await patchDraft(body.tenantId, body.runId, body.draftId, { editedBody: body.editedBody });
      return json(200, { saved: true });
    }
    if (method === "POST" && path === "/draft/status") {
      await patchDraft(body.tenantId, body.runId, body.draftId, { status: body.status as DraftStatus });
      return json(200, { saved: true });
    }

    // Tenant config (schedule, topics, sources, brand voice) — read/update from the settings UI.
    if (method === "GET" && path.startsWith("/config")) {
      const tenantId = event.queryStringParameters?.tenantId;
      if (!tenantId) return json(400, { error: "tenantId required" });
      return json(200, { config: (await getConfig(tenantId)) ?? null });
    }
    if (method === "PUT" && path === "/config") {
      await putConfig(body.config as TenantConfig);
      return json(200, { saved: true });
    }

    // RAG knowledge ingestion — chunk + embed + store a company doc for grounding.
    if (method === "POST" && path === "/knowledge") {
      if (!body.tenantId || !body.text) return json(400, { error: "tenantId and text required" });
      const chunks = await ingestDocument(body.tenantId, body.title ?? "Untitled", body.text, body.docId);
      return json(201, { ingested: true, chunks });
    }

    return json(404, { error: "Not found" });
  } catch (err) {
    return json(500, { error: (err as Error).message });
  }
}

/** Kick off an on-demand generation run with a steering instruction. */
async function onDemand(body: { tenantId: string; instruction: string }) {
  await sfn.send(
    new StartExecutionCommand({
      stateMachineArn: config.stateMachineArn,
      input: JSON.stringify({ tenantId: body.tenantId, instruction: body.instruction }),
    }),
  );
  return { started: true };
}

/** Persist feedback; it feeds the next run's prompting (exemplars + preference notes). */
async function saveFeedback(body: { tenantId: string; draftId: string; rating?: "up" | "down"; comment?: string }) {
  const fb: Feedback = {
    tenantId: body.tenantId,
    feedbackId: randomUUID(),
    draftId: body.draftId,
    rating: body.rating,
    comment: body.comment,
    createdAt: new Date().toISOString(),
  };
  await putFeedback(fb);
  return { saved: true };
}

/**
 * Publish an approved draft to the LinkedIn company page.
 * BLOCKED: requires LinkedIn Community Management API approval (w_organization_social).
 * Until approved, this is a stub — the admin exports/copies the post manually.
 */
async function publish(_body: { tenantId: string; draftId: string }) {
  return { published: false, reason: "LinkedIn API approval pending — publishing stubbed" };
}

function json(statusCode: number, data: unknown) {
  return { statusCode, headers: { "content-type": "application/json" }, body: JSON.stringify(data) };
}
