import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import type { BrandProfile, Citation, Signal, ToneProfile } from "@alphabeacon/shared";
import { config } from "../shared/config.js";

const client = new BedrockRuntimeClient({ region: config.region });

export interface DraftGeneration {
  body: string;
  rationale: string;
  citations: Citation[];
  imagePrompt: string;
}

export interface GenerateInput {
  brand: BrandProfile;
  tone: ToneProfile;
  topics: string[];
  signals: Signal[];
  /** RAG snippets retrieved from the tenant's knowledge base. */
  grounding: string[];
  /** Learned exemplars + preference notes from prior high-performing posts / feedback. */
  exemplars: string[];
  /** On-demand steering instruction, prepended to the context when present. */
  instruction?: string;
}

/**
 * Generate a single LinkedIn draft in a given tone. The model is instructed to ground every
 * factual claim in a provided source and to emit structured JSON so the pipeline can enforce
 * guardrails (claim-check, brand-safety, repetition) before a human ever sees it.
 */
export async function generateDraft(input: GenerateInput): Promise<DraftGeneration> {
  const system = buildSystemPrompt(input.brand, input.tone);
  const user = buildUserPrompt(input);

  const res = await client.send(
    new ConverseCommand({
      modelId: config.textModelId,
      system: [{ text: system }],
      messages: [{ role: "user", content: [{ text: user }] }],
      inferenceConfig: { maxTokens: 1200, temperature: 0.7 },
    }),
  );

  const text = res.output?.message?.content?.find((c) => "text" in c)?.text ?? "";
  return parseDraft(text);
}

function buildSystemPrompt(brand: BrandProfile, tone: ToneProfile): string {
  return [
    `You write LinkedIn company-page posts for ${brand.companyProfile}`,
    `Offer: ${brand.offer}`,
    `Differentiators: ${brand.differentiators.join("; ")}`,
    `Standard call to action: ${brand.standardCta}`,
    ``,
    `Voice rules: ${brand.voice.rules.join("; ")}`,
    `Do: ${brand.voice.dos.join("; ")}`,
    `Don't: ${brand.voice.donts.join("; ")}`,
    `Never use these terms: ${brand.bannedTerms.join(", ") || "(none)"}`,
    ``,
    `Write in this tone — ${tone.name}: ${tone.character}`,
    `Example of the register: "${tone.exampleTrigger}"`,
    ``,
    `CRITICAL: every factual claim or statistic MUST be backed by a source from the provided`,
    `signals or grounding. Do NOT invent statistics. If you cannot source a number, do not`,
    `state it. End on a clear call to action.`,
    ``,
    `Respond with ONLY a JSON object of the form:`,
    `{"body": string, "rationale": string, "citations": [{"claim": string, "sourceUrl": string|null, "sourceTitle": string|null}], "imagePrompt": string}`,
    `- body: the post copy, ready to publish.`,
    `- rationale: one sentence, "why this post" — the signal or topic that inspired it.`,
    `- citations: every factual claim with its supporting source (null url if none — then remove the claim).`,
    `- imagePrompt: a concise prompt for a matching on-brand image.`,
  ].join("\n");
}

function buildUserPrompt(input: GenerateInput): string {
  const parts: string[] = [];
  if (input.instruction) parts.push(`STEERING INSTRUCTION (highest priority): ${input.instruction}`);
  parts.push(`Standing topics: ${input.topics.join(", ")}`);
  if (input.grounding.length) parts.push(`Grounding from our own materials:\n- ${input.grounding.join("\n- ")}`);
  if (input.exemplars.length) parts.push(`High-performing past examples to echo (style, not content):\n- ${input.exemplars.join("\n- ")}`);
  parts.push(
    `Today's market signals (title — summary — url):\n` +
      input.signals.map((s) => `- ${s.title} — ${s.summary} — ${s.url ?? "no-url"}`).join("\n"),
  );
  parts.push(`Write one post now.`);
  return parts.join("\n\n");
}

function parseDraft(text: string): DraftGeneration {
  const json = extractJson(text);
  const citations: Citation[] = (json.citations ?? []).map((c: Record<string, unknown>) => ({
    claim: String(c.claim ?? ""),
    sourceUrl: (c.sourceUrl as string) ?? undefined,
    sourceTitle: (c.sourceTitle as string) ?? undefined,
    verified: Boolean(c.sourceUrl), // provisional; the claim-check guardrail confirms this
  }));
  return {
    body: String(json.body ?? "").trim(),
    rationale: String(json.rationale ?? "").trim(),
    citations,
    imagePrompt: String(json.imagePrompt ?? "").trim(),
  };
}

function extractJson(text: string): Record<string, unknown> {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Model did not return JSON");
  return JSON.parse(text.slice(start, end + 1));
}
