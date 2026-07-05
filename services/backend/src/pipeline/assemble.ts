import type { Draft, Run } from "@alphabeacon/shared";
import { putDrafts, putRun } from "../shared/dynamo.js";

/**
 * Final pipeline stage: persist the run's drafts and mark the run ready for review.
 * TODO: notify the reviewer (email / push) that today's shortlist is ready.
 */
export async function handler(event: { tenantId: string; runId: string; drafts: Draft[] }) {
  const drafts = (event.drafts ?? []).filter(Boolean);

  await putDrafts(drafts);

  const run: Run = {
    tenantId: event.tenantId,
    runId: event.runId,
    kind: "scheduled",
    status: "completed",
    startedAt: "",
    finishedAt: new Date().toISOString(),
    draftIds: drafts.map((d) => d.draftId),
  };
  await putRun(run);

  return { tenantId: event.tenantId, runId: event.runId, status: "completed", draftCount: drafts.length };
}
