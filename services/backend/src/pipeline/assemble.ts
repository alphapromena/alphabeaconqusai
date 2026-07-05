/**
 * Final pipeline stage: persist the run's drafts and mark the run ready for review.
 *
 * TODO: batch-write drafts + run record to DynamoDB (single-table), and notify the reviewer
 * (email / push) that today's shortlist is ready.
 */
export async function handler(event: {
  tenantId: string;
  runId: string;
  drafts: Array<Record<string, unknown>>;
}) {
  const drafts = event.drafts ?? [];

  // TODO: persist via services/backend/src/shared/dynamo.ts (putDrafts, putRun).
  return {
    tenantId: event.tenantId,
    runId: event.runId,
    status: "completed" as const,
    draftCount: drafts.length,
    finishedAt: new Date().toISOString(),
  };
}
