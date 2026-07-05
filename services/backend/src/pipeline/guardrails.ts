import type { Citation, GuardrailReport } from "@alphabeacon/shared";

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
 * Claim-check: every factual claim must carry a checkable source. Claims the model produced
 * without a source URL are flagged for the human (and ideally stripped upstream).
 * TODO: add active verification — fetch the source and confirm the number actually appears.
 */
export function checkClaims(citations: Citation[]): GuardrailReport["claimCheck"] {
  const unverified = citations.filter((c) => !c.sourceUrl).map((c) => c.claim);
  return { passed: unverified.length === 0, unverified };
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
  };
}

export function reportPassed(r: GuardrailReport): boolean {
  return r.brandSafety.passed && r.claimCheck.passed && r.repetition.passed;
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

/** Step Functions task: attach the guardrail report to a draft and set its status. */
export async function handler(event: {
  draft: { body: string; editedBody?: string; citations: Citation[] };
  bannedTerms: string[];
  recentBodies: string[];
}) {
  const body = event.draft.editedBody ?? event.draft.body;
  const guardrails = buildReport(body, event.draft.citations, event.bannedTerms ?? [], event.recentBodies ?? []);
  return { ...event.draft, guardrails, status: reportPassed(guardrails) ? "needs_review" : "flagged" };
}
