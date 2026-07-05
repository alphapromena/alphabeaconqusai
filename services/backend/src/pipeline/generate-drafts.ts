import { randomUUID } from "node:crypto";
import type { BrandProfile, Signal, ToneProfile } from "@alphabeacon/shared";
import { generateDraft } from "../bedrock/generate.js";

/**
 * Fan-out stage: generate one draft for a single tone profile. Step Functions runs this in
 * parallel across the run's tones (default 5).
 */
export async function handler(event: {
  tenantId: string;
  runId: string;
  tone: ToneProfile;
  brand: BrandProfile;
  topics: string[];
  signals: Signal[];
  grounding: string[];
  exemplars: string[];
  instruction?: string;
}) {
  const gen = await generateDraft({
    brand: event.brand,
    tone: event.tone,
    topics: event.topics,
    signals: event.signals,
    grounding: event.grounding ?? [],
    exemplars: event.exemplars ?? [],
    instruction: event.instruction,
  });

  return {
    tenantId: event.tenantId,
    runId: event.runId,
    draftId: randomUUID(),
    toneProfileId: event.tone.id,
    body: gen.body,
    rationale: gen.rationale,
    citations: gen.citations,
    imagePrompt: gen.imagePrompt,
    status: "generating" as const,
    createdAt: new Date().toISOString(),
  };
}
