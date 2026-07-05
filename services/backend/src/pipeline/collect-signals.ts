import { randomUUID } from "node:crypto";
import type { Signal, TenantConfig } from "@alphabeacon/shared";
import { getTone } from "@alphabeacon/shared";

/**
 * First pipeline stage: gather raw market signal from the tenant's PUBLIC sources
 * (RSS, blogs, news, keyword watches) and hand the run a working context.
 *
 * IMPORTANT: reading other companies' LinkedIn feeds is NOT permitted by LinkedIn's API and
 * scraping violates their terms — we track public footprint only.
 *
 * TODO: implement fetchers per Source.kind and summarize each item with Bedrock.
 */
export async function handler(event: { tenantId: string; config: TenantConfig; runId?: string; instruction?: string }) {
  const { tenantId, config } = event;

  const signals: Signal[] = []; // TODO: fetch + summarize from config.sources

  const tones = config.toneProfileIds
    .map((id) => getTone(id))
    .filter((t): t is NonNullable<typeof t> => Boolean(t));

  return {
    tenantId,
    runId: event.runId ?? randomUUID(),
    kind: event.instruction ? "on_demand" : "scheduled",
    instruction: event.instruction,
    tones,
    signals,
    brand: config.brand,
    topics: config.topics,
    grounding: [] as string[], // TODO: retrieve from Bedrock Knowledge Base (RAG)
    exemplars: [] as string[], // TODO: pull high-performing past posts + feedback notes
  };
}
