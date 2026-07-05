import type { Citation, Draft, GuardrailReport } from "@alphabeacon/shared";
import { MARKETING_BUZZWORDS } from "@alphabeacon/shared";
import { getConfig, recentPostBodies } from "../shared/dynamo.js";

/**
 * Guardrails run on every draft before a human sees it. They are not optional polish — the
 * claim-check in particular is what keeps the brand from publishing a confident falsehood.
 */

export function checkBrandSafety(body: string, bannedTerms: string[]): GuardrailReport["brandSafety"] {
  const lower = body.toLowerCase();
  const hits = bannedTerms.filter((t) => t && lower.includes(t.toLowerCase()));
  return { passed: hits.length === 0, hits };
}

/**
 * Claim-check: every factual claim must carry a *specific* checkable source. A claim with no
 * URL — or one that only cites a site's homepage (e.g. "gartner.com", a tell that the model
 * pulled a number from memory rather than a provided signal) — is flagged for the human.
 * TODO: add active verification — fetch the source and confirm the number actually appears.
 */
export function checkClaims(citations: Citation[]): GuardrailReport["claimCheck"] {
  const unverified = citations.filter((c) => !isSpecificSource(c.sourceUrl)).map((c) => c.claim);
  return { passed: unverified.length === 0, unverified };
}

/** A source URL is "specific" only if it points at an article/page, not a bare homepage. */
export function isSpecificSource(url?: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.pathname.replace(/\/+$/, "").length > 0; // has a path beyond "/"
  } catch {
    return false;
  }
}

/**
 * Style guard: flags marketing-slop / buzzwords ("seamless", "cutting-edge", …). These aren't
 * unsafe, just generic and off-brand — surfacing them lets a human tighten before publishing.
 */
export function checkStyle(body: string, buzzwords: string[] = MARKETING_BUZZWORDS): GuardrailReport["style"] {
  const norm = body.toLowerCase().replace(/[-_]/g, " ");
  const hits = buzzwords.filter((w) => norm.includes(w.toLowerCase()));
  return { passed: hits.length === 0, buzzwords: hits };
}

/**
 * Repetition guard: semantic similarity against recent posts so the feed doesn't feel like a
 * loop. MVP uses a cheap token-overlap (Jaccard) heuristic; swap for Bedrock embeddings +
 * a cosine threshold once the vector store is wired.
 */
export function checkRepetition(
  body: string,
  recentBodies: string[],
  threshold = 0.6,
): GuardrailReport["repetition"] {
  let worst = 0;
  let similarTo: string | undefined;
  for (const prev of recentBodies) {
    const score = jaccard(tokens(body), tokens(prev));
    if (score > worst) {
      worst = score;
      similarTo = prev.slice(0, 60);
    }
  }
  return { passed: worst < threshold, similarTo: worst >= threshold ? similarTo : undefined, score: round(worst) };
}

export function buildReport(
  body: string,
  citations: Citation[],
  bannedTerms: string[],
  recentBodies: string[],
): GuardrailReport {
  return {
    brandSafety: checkBrandSafety(body, bannedTerms),
    claimCheck: checkClaims(citations),
    repetition: checkRepetition(body, recentBodies),
    style: checkStyle(body),
  };
}

export function reportPassed(r: GuardrailReport): boolean {
  return r.brandSafety.passed && r.claimCheck.passed && r.repetition.passed && r.style.passed;
}

function tokens(s: string): Set<string> {
  return new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 3));
}
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}
function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Step Functions task: attach the guardrail report to a draft and set its status.
 *
 * Receives the flat draft object emitted by the preceding "generate image" step (it carries
 * tenantId + the draft fields). Self-sufficient: it fetches the tenant's banned terms and
 * recent post history itself, so the state machine doesn't have to thread that data through
 * every step. Returns the completed Draft.
 */
export async function handler(event: Draft & { imagePrompt?: string }) {
  const body = event.editedBody ?? event.body;
  const cfg = await getConfig(event.tenantId);
  const bannedTerms = cfg?.brand.bannedTerms ?? [];
  const recentBodies = await recentPostBodies(event.tenantId);
  const guardrails = buildReport(body, event.citations ?? [], bannedTerms, recentBodies);
  return { ...event, guardrails, status: reportPassed(guardrails) ? "needs_review" : "flagged" } as Draft;
}
