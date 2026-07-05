# AlphaBeacon — QA Report

_Full end-to-end QA pass against the live system (AWS us-east-1 + us-west-2, Vercel). Date: 2026-07-06._

**Result: 34 / 34 checks passed. 1 minor cosmetic finding (non-blocking).**

---

## A. API contract (deployed HTTP API)
| Test | Expected | Result |
|---|---|---|
| `GET /runs/latest?tenantId=` (valid) | 200 + run + drafts | ✅ 200 |
| `GET /runs/latest` (missing tenantId) | 400 | ✅ 400 |
| `GET /runs/latest?tenantId=<unknown>` | 200 `{run:null,drafts:[]}` | ✅ |
| `GET /drafts?tenantId=&runId=` | 200 | ✅ 200 |
| `GET /<unknown route>` | 404 | ✅ 404 |
| `POST /publish` | `{published:false}` (stub) | ✅ |
| CORS (preflight OPTIONS) | `allow-origin/methods/headers: *` | ✅ (added when `Origin` present) |

## B. Image pipeline (the presigned-URL fix)
| Test | Result |
|---|---|
| All 5 draft images return a presigned `url` | ✅ |
| Presigned URLs load from the private bucket | ✅ **5/5 → HTTP 200 image/png** (~3.3 MB each) |
| Admin renders images (browser) | ✅ **5/5 loaded**, first image 1536px |

## C. Data integrity (DynamoDB + S3)
| Test | Result |
|---|---|
| Tenant config present, 5 tone profiles | ✅ |
| All drafts well-formed (all required fields) | ✅ 5/5 |
| Every draft has an image | ✅ |
| 5 distinct tone profiles per run | ✅ |
| Draft `s3Key`s match objects in S3 | ✅ |

## D. Write paths
| Test | Result |
|---|---|
| `POST /feedback` returns `{saved:true}` | ✅ |
| Feedback persisted to DynamoDB | ✅ verified by query |

## E. Guardrails correctness (unit checks on the logic)
| Check | Result |
|---|---|
| Brand-safety flags a banned term / passes clean copy | ✅ / ✅ |
| Claim-check flags an unsourced claim / passes a specific source | ✅ / ✅ |
| `isSpecificSource` rejects a bare homepage / accepts an article path | ✅ / ✅ |
| Style guard flags a buzzword ("seamless") | ✅ |
| Repetition flags a near-duplicate / passes distinct text | ✅ / ✅ |
| **Live confirmation:** banking post's "Gartner $1.3M" claim flagged `! claims` in the UI | ✅ (correct anti-hallucination behavior) |

## F. Live pipeline (real Step Functions on AWS)
| Test | Result |
|---|---|
| Scheduled run via `StartExecution {tenantId}` | ✅ **SUCCEEDED** → 5 drafts |
| On-demand run with instruction ("data governance in banking") | ✅ **SUCCEEDED** → 5 drafts, and the copy is visibly banking-specific → instruction steering works |
| Last 10 SFN executions | ✅ all SUCCEEDED, **0 failures** |
| Text model (Nova Pro, us-east-1) | ✅ working |
| Image model (Stable Image Core, us-west-2) | ✅ working, on-brand palette |

## G. Infra & security
| Test | Result |
|---|---|
| Assets S3 bucket private (all 4 public-access blocks on) | ✅ yes |
| Cognito user pool exists, **admin-only signup** | ✅ (matches blueprint) |
| EventBridge Scheduler **DISABLED** (`cron(0 14 * * ? *)` Asia/Amman) | ✅ (safe — no accidental daily runs) |
| No AWS keys / secrets tracked in git | ✅ |
| `.env` files gitignored | ✅ |
| Full workspace build (all 4 packages) | ✅ clean |

## H. UI (admin review queue, live)
| Test | Result |
|---|---|
| Page loads, 5 posts render | ✅ |
| All 5 images load (no broken images) | ✅ 5/5 |
| All 5 tone labels present (Story/Educational/Data-driven/Provocative/Direct-CTA) | ✅ |
| Guardrail badges render (brand-safe / claims / fresh / on-voice) | ✅ |

---

## Findings

**🟡 Minor / cosmetic (non-blocking) — Markdown not rendered in the admin.**
The draft body is stored as Markdown (`**bold**`, `- bullets`) but the Review Queue prints it as raw text, so a reviewer sees literal `**` and `-`. Recommend rendering Markdown (or stripping it) in `ReviewQueue.tsx` for a cleaner review experience. Does not affect generation, guardrails, publishing, or data — purely display polish.

**No functional defects found.** Every layer — Bedrock (text + image), Step Functions orchestration, guardrails, DynamoDB, S3, API, Cognito, Scheduler, and the admin UI — behaves correctly end-to-end.

## Verdict
**The AlphaBeacon MVP is functionally complete and production-sound for Phase 1.** Remaining items are by design / external: enable the daily Scheduler when ready, LinkedIn publishing (blocked on API approval), and the Markdown-rendering polish above.
