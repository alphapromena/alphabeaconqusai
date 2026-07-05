import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import type { BrandProfile, Citation, Signal, ToneProfile } from "@alphabeacon/shared";
import { MARKETING_BUZZWORDS } from "@alphabeacon/shared";
import { config } from "../shared/config.js";
import { isSpecificSource } from "../pipeline/guardrails.js";

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
  const baseUser = buildUserPrompt(input);

  // Cheaper models (e.g. Nova) occasionally emit truncated or slightly malformed JSON.
  // Give generous headroom, then retry once with a firmer instruction before failing.
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const user =
      attempt === 0
        ? baseUser
        : `${baseUser}\n\nIMPORTANT: return ONLY one complete, valid JSON object. Escape every quote and newline inside string values. Do not wrap it in markdown.`;
    const res = await client.send(
      new ConverseCommand({
        modelId: config.textModelId,
        system: [{ text: system }],
        messages: [{ role: "user", content: [{ text: user }] }],
        inferenceConfig: { maxTokens: 2048, temperature: 0.7 },
      }),
    );
    const text = res.output?.message?.content?.find((c) => "text" in c)?.text ?? "";
    try {
      return parseDraft(text);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("generateDraft failed to parse model output");
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
    `Avoid generic marketing buzzwords — they read as slop and will be flagged: ${MARKETING_BUZZWORDS.join(", ")}. Write plainly and specifically instead.`,
    `Use emoji sparingly (a few at most), not on every line.`,
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
  const rawCitations = Array.isArray(json.citations) ? (json.citations as Record<string, unknown>[]) : [];
  const citations: Citation[] = rawCitations.map((c) => ({
    claim: String(c.claim ?? ""),
    sourceUrl: (c.sourceUrl as string) ?? undefined,
    sourceTitle: (c.sourceTitle as string) ?? undefined,
    verified: isSpecificSource(c.sourceUrl as string | undefined), // homepage-only URLs count as unverified
  }));
  return {
    body: String(json.body ?? "").trim(),
    rationale: String(json.rationale ?? "").trim(),
    citations,
    imagePrompt: String(json.imagePrompt ?? "").trim(),
  };
}

function extractJson(text: string): Record<string, unknown> {
  let s = text.trim();
  // Strip a ```json ... ``` fence if the model wrapped its output in one.
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();

  const start = s.indexOf("{");
  if (start === -1) throw new Error("Model did not return JSON");

  // Balanced, string-aware scan to find the matching close brace — robust to
  // stray braces inside string values (which lastIndexOf('}') gets wrong).
  let depth = 0;
  let inStr = false;
  let esc = false;
  let end = -1;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) {
      end = i;
      break;
    }
  }
  const slice = end === -1 ? s.slice(start) : s.slice(start, end + 1);
  return JSON.parse(repairJson(slice));
}

/** Light repair for the most common model JSON slips (trailing commas). */
function repairJson(s: string): string {
  return s.replace(/,\s*([}\]])/g, "$1");
}
