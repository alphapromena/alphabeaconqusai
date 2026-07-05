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
  preferenceNotes?: string[];
  recentThemes?: string[];
  /** This tone's position in the fan-out (0-based) — used to diversify the lead signal + topic. */
  itemIndex?: number;
  instruction?: string;
}) {
  const idx = event.itemIndex ?? 0;

  // Lead each tone with a different signal so the 5 parallel drafts (which can't see each
  // other) don't all anchor on the same top story. Rotate the list by this tone's index.
  const all = event.signals ?? [];
  const off = all.length ? idx % all.length : 0;
  const signals = all.length ? [...all.slice(off), ...all.slice(0, off)] : all;

  // Give each tone a different primary topic so the 5 posts cover distinct facets, not one idea.
  const topics = event.topics ?? [];
  const focusTopic = topics.length ? topics[idx % topics.length] : undefined;

  const gen = await generateDraft({
    brand: event.brand,
    tone: event.tone,
    topics,
    focusTopic,
    signals,
    grounding: event.grounding ?? [],
    exemplars: event.exemplars ?? [],
    preferenceNotes: event.preferenceNotes ?? [],
    avoidThemes: event.recentThemes ?? [],
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
