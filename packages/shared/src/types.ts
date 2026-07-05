/**
 * AlphaBeacon core data model.
 *
 * Implemented in DynamoDB (single- or multi-table by access pattern). Every record is
 * scoped by `tenantId` — the platform is multi-tenant from day one.
 */

export type ISODate = string;

/** A customer/brand. Phase 1 ships a single tenant (Alpha Pro MENA). */
export interface Tenant {
  tenantId: string;
  name: string;
  status: "active" | "paused";
  createdAt: ISODate;
}

/** Everything that shapes generation for a tenant. */
export interface TenantConfig {
  tenantId: string;
  /** Daily run time + IANA timezone, e.g. "09:00" / "Asia/Amman". */
  schedule: { time: string; timezone: string };
  /** Standing themes the AI should orbit. */
  topics: string[];
  /** Public sources to watch for signal (NOT LinkedIn feeds — see constraints). */
  sources: Source[];
  /** How many drafts per run (default 5). */
  postsPerRun: number;
  /** Tone profiles used this run (ids into TONE_PROFILES). */
  toneProfileIds: string[];
  /** Cost guardrails. */
  limits: { maxOnDemandPerDay: number; maxRegenerationsPerDraft: number };
  brand: BrandProfile;
}

/** Company profile + voice — the grounding the model must respect. */
export interface BrandProfile {
  companyProfile: string;
  offer: string;
  differentiators: string[];
  standardCta: string;
  contact: string;
  /** Voice rules reflected in every draft. */
  voice: { rules: string[]; dos: string[]; donts: string[] };
  /** Terms that must never appear (brand-safety). */
  bannedTerms: string[];
}

export type SourceKind = "rss" | "blog" | "news" | "keyword";
export interface Source {
  id: string;
  kind: SourceKind;
  /** URL for rss/blog/news, or the search term for keyword. */
  value: string;
  label?: string;
}

/** A document uploaded into the knowledge base for RAG grounding. */
export interface KnowledgeItem {
  tenantId: string;
  itemId: string;
  title: string;
  kind: "product_sheet" | "case_study" | "past_post" | "other";
  s3Key: string;
  ingestedAt?: ISODate;
}

/** One of the tone registers a draft can be written in. */
export interface ToneProfile {
  id: string;
  name: string;
  character: string;
  exampleTrigger: string;
}

export type DraftStatus =
  | "generating"
  | "needs_review"   // passed guardrails, waiting for a human
  | "flagged"        // a guardrail wants attention
  | "approved"
  | "published"
  | "skipped"
  | "rejected";

/** A single generated candidate post. */
export interface Draft {
  tenantId: string;
  draftId: string;
  runId: string;
  toneProfileId: string;
  body: string;
  /** "Why this post": the signal or topic that inspired it. */
  rationale: string;
  /** Supporting sources for any factual claim. */
  citations: Citation[];
  image?: GeneratedImage;
  guardrails: GuardrailReport;
  status: DraftStatus;
  createdAt: ISODate;
  editedBody?: string;
}

export interface Citation {
  claim: string;
  sourceUrl?: string;
  sourceTitle?: string;
  /** false = the claim could not be verified against a source. */
  verified: boolean;
}

export interface GeneratedImage {
  s3Key: string;
  prompt: string;
  model: string;
  /** Short-lived presigned GET URL the admin can render (the bucket is private). Set by the API. */
  url?: string;
}

export interface GuardrailReport {
  brandSafety: { passed: boolean; hits: string[] };
  claimCheck: { passed: boolean; unverified: string[] };
  repetition: { passed: boolean; similarTo?: string; score: number };
  /** Marketing-slop / buzzword usage — flags generic copy for a human to tighten. */
  style: { passed: boolean; buzzwords: string[] };
}

/** A published post (a Draft that went live). */
export interface Post {
  tenantId: string;
  postId: string;
  draftId: string;
  linkedInUrn?: string;
  publishedAt: ISODate;
  status: "published" | "scheduled" | "failed";
}

/** Human feedback that feeds the next run's prompting. */
export interface Feedback {
  tenantId: string;
  feedbackId: string;
  draftId: string;
  rating?: "up" | "down";
  comment?: string;
  createdAt: ISODate;
}

/** Raw market signal collected from public sources for a run. */
export interface Signal {
  id: string;
  sourceId: string;
  title: string;
  url?: string;
  summary: string;
  collectedAt: ISODate;
}

/** A single daily execution of the pipeline. */
export interface Run {
  tenantId: string;
  runId: string;
  kind: "scheduled" | "on_demand";
  status: "running" | "completed" | "failed";
  startedAt: ISODate;
  finishedAt?: ISODate;
  draftIds: string[];
  /** For on-demand runs: the user's steering instruction. */
  instruction?: string;
}
