# AlphaBeacon — AI Model Evaluation (post variety & repetition)

_Question the client raised: does the model keep producing the **same idea**, or genuinely varied posts? And does it pull from real sources? Date: 2026-07-06._

## Method
`services/backend/eval-model.mts` loads every persisted draft, embeds each body with Amazon Titan Text Embeddings v2, and measures semantic similarity (cosine):
- **Intra-run diversity** — average pairwise cosine of a run's 5 tone-posts. *Lower = the 5 posts express more distinct ideas* (not just distinct voices).
- **Cross-run repetition** — for each tone, average cosine of its post across different runs. *Lower = fresher over time.*

> Calibration note: Titan v2 cosines run **high in absolute terms** — same-domain business copy sits ~0.8+ even when angles differ, and truly unrelated text still ~0.5. So treat these as **relative** measures (before vs. after), not absolute "good/bad" thresholds.

## Finding (before improvements)
Across 6 runs / 30 drafts:

| Metric | Score | Read |
|---|---|---|
| Intra-run diversity (avg) | **0.877** | the 5 tones vary in *voice* but converge on one *message* (data quality → AI readiness → Ataccama) |
| Cross-run repetition (avg) | **0.843** | the same themes recur run-to-run |
| Image-prompt vocabulary | 118 distinct words / 20 prompts | images are reasonably varied |

**Verdict:** the client's instinct was right — out of the box the copy was **too repetitive in idea**. Root causes: (1) a deliberately narrow topic space (the brand is about data quality/AI), (2) all 5 parallel tones saw the same signals and the same topic list, and (3) nothing told a run to differ from previous runs.

## Improvements shipped
1. **Per-tone topic focus** — each of the 5 posts is now centered on a *different* topic facet (`topics[toneIndex]`), so one run spans data quality, governance, agentic AI, AI-readiness, and observability instead of all saying "clean your data."
2. **Per-tone signal rotation** — each tone leads with a different collected signal (the parallel drafts can't see each other, so this stops convergence on the top story).
3. **Anti-repetition context** — every run is given the opening lines of recent posts and instructed to bring a fresh angle away from them (`recentDraftLeads`).
4. **More + broader sources** — 18 public sources (5 direct RSS incl. a MENA feed, 4 site feeds, 9 keyword watches) so the signal pool itself is more diverse.
5. **Grounding (RAG)** — posts are now grounded in seeded Alpha Pro / Ataccama knowledge, so specifics (Ataccama ONE capabilities, Baker Tilly, MENA) vary the content with real facts rather than generic filler.

## Finding (after improvements)
<!-- AFTER-RESULTS -->

## Sources the model pulls from
- **Live signal** (`collect/feeds.ts`): Google-News keyword searches + RSS/blog feeds — DATAVERSITY, KDnuggets, VentureBeat AI, Unite.AI, Wamda (MENA), Ataccama blog/newsroom, TDWI, BigDATAwire, plus keyword watches (data quality, governance, agentic AI, MDM, AI readiness, data catalog, CDO, MENA data regulation, Ataccama). One failing source never sinks a run.
- **Company knowledge** (RAG): seeded docs — company profile, Ataccama ONE capabilities, positioning — retrieved by semantic similarity each run. Add more anytime via `POST /knowledge` or `seed-knowledge.mts`.
- Every factual claim must carry a source, or the claim-check guardrail flags it (verified live: a "Gartner $1.3M" stat with no URL was flagged `! claims`).

## Recommendations / further levers
- If more variety is still wanted: raise generation `temperature` (currently 0.7), widen the topic list in Settings, or add more knowledge docs (richer grounding → more specific, less generic posts).
- For higher copy quality, swap the text model to Claude Sonnet 5 (one-line change; see `BEDROCK_MODELS.md`) — better nuance and instruction-following at ~+$4/month.
- The repetition guardrail already flags near-duplicates post-hoc; the anti-repetition context above is the proactive counterpart.
