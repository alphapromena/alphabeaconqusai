import { randomUUID } from "node:crypto";
import type { TenantConfig } from "@alphabeacon/shared";
import { getTone } from "@alphabeacon/shared";
import { collectSignals } from "../collect/feeds.js";
import { retrieveGrounding } from "../rag/retrieve.js";
import { getConfig, putRun } from "../shared/dynamo.js";

/**
 * First pipeline stage: load the tenant config, gather raw market signal from public sources,
 * retrieve RAG grounding, and open a run. Hands the fan-out stage a full working context.
 *
 * IMPORTANT: reading other companies' LinkedIn feeds is not permitted by LinkedIn's API — we
 * track public footprint only (RSS, blogs, news, keyword watches).
 */
export async function handler(event: { tenantId: string; runId?: string; instruction?: string; config?: TenantConfig }) {
  const { tenantId } = event;
  const config = event.config ?? (await getConfig(tenantId));
  if (!config) throw new Error(`No config for tenant ${tenantId}`);

  const runId = event.runId ?? randomUUID();
  const kind = event.instruction ? "on_demand" : "scheduled";

  const signals = await collectSignals(config.sources);

  // Ground on the tenant's own materials, keyed off the topics + steering instruction.
  const groundingQuery = [event.instruction, ...config.topics].filter(Boolean).join(". ");
  const grounding = await retrieveGrounding(groundingQuery);

  const tones = config.toneProfileIds
    .map((id) => getTone(id))
    .filter((t): t is NonNullable<typeof t> => Boolean(t));

  await putRun({
    tenantId,
    runId,
    kind,
    status: "running",
    startedAt: new Date().toISOString(),
    draftIds: [],
    instruction: event.instruction,
  });

  return {
    tenantId,
    runId,
    kind,
    // Empty string (not undefined) so the Step Functions Map itemSelector JSONPath
    // "$.instruction" always resolves — an absent field would fail the state.
    instruction: event.instruction ?? "",
    tones,
    signals,
    brand: config.brand,
    topics: config.topics,
    grounding,
    exemplars: [] as string[], // TODO: high-performing past posts + feedback preference notes
  };
}
