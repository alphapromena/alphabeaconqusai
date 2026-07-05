import { randomUUID } from "node:crypto";
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import type { Feedback } from "@alphabeacon/shared";
import { config } from "../shared/config.js";
import { listDrafts, putFeedback } from "../shared/dynamo.js";

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
    if (method === "GET" && path.startsWith("/drafts")) {
      const q = event.queryStringParameters ?? {};
      const drafts = q.tenantId && q.runId ? await listDrafts(q.tenantId, q.runId) : [];
      return json(200, { drafts });
    }
    if (method === "POST" && path === "/on-demand") return json(202, await onDemand(body));
    if (method === "POST" && path === "/feedback") return json(201, await saveFeedback(body));
    if (method === "POST" && path === "/publish") return json(200, await publish(body));
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
