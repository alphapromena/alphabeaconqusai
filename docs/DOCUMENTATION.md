# AlphaBeacon — Project Documentation

> **What it is:** an autonomous LinkedIn presence & demand-generation engine. Every day it studies
> the market, drafts 5 on-brand posts in different tones, generates a matching image for each,
> runs guardrails, and hands a human a review-ready shortlist. A person picks / edits / publishes,
> and their feedback teaches the next run. First tenant: **Alpha Pro MENA** (Ataccama data-quality
> partner). Multi-tenant from day one.
>
> Built to the Phase-1 MVP blueprint, **AWS-native serverless**, with one deviation: the admin app
> is **React (Vite)**, not Flutter.

_Last updated: 2026-07-05._

---

## 0. TL;DR — current status

| Piece | Status |
|---|---|
| Admin web app (React/Vite) | 🟢 **Live** on Vercel — https://alphabeaconqusai-admin-web.vercel.app |
| AWS backend (Lambdas, Step Functions, DynamoDB, S3, Cognito, API GW) | 🟢 **Deployed** (stack `AlphaBeacon`, us-east-1) |
| Admin ↔ backend wiring | 🟢 Live (`VITE_API_URL` baked into the build) |
| Text generation (Bedrock **Nova Pro**, us-east-1) | 🟢 **Working** — no console gate needed |
| Image generation (**Stability Stable Image Core**, us-west-2) | 🟢 **Working** — verified (2.4 MB PNG). us-east-1 has no active text→image model, so images are generated in us-west-2 (see §3). |
| Pipeline logic (collect → draft → image → guardrails → assemble) | 🟢 **Verified end-to-end** against real AWS |
| Step Functions wiring fixes | 🟢 In code & committed — 🟡 **needs one `cdk deploy`** to reach the deployed state machine (the harness blocks me from running IaC applies autonomously) |
| Daily scheduler | ⚪ Created **DISABLED** by design (enable after images + a test run) |
| LinkedIn publishing | 🔴 Stubbed — **blocked on LinkedIn Community Management API approval** |

**The two things that need YOU (both one-liners):** see [§7 What still needs you](#7-what-still-needs-you).

---

## 1. Where everything lives

### 1.1 Repository
- **Local:** `C:\Users\user\alphabeaconqusai`
- **GitHub:** `alphapromena/alphabeaconqusai` (public), branch **`master`**
- **Package manager:** pnpm 10 workspace (monorepo). Node 24.

```
alphabeaconqusai/
├─ packages/shared/        # TS types + tone/style profiles + the Alpha Pro MENA tenant (the data model)
│   └─ src/{types,tones,style,tenants,index}.ts
├─ services/backend/       # Lambda handlers (the brains)
│   └─ src/
│      ├─ pipeline/         # collect-signals · generate-drafts · generate-images · guardrails · assemble
│      ├─ bedrock/          # generate.ts (text) · images.ts (image)
│      ├─ rag/retrieve.ts   # RAG grounding (Bedrock Knowledge Base — stub until KB provisioned)
│      ├─ collect/feeds.ts  # public-source signal collection (RSS/news/keyword)
│      ├─ api/handler.ts    # the HTTP API (drafts, runs/latest, on-demand, feedback, publish)
│      └─ shared/           # config.ts (model ids + env) · dynamo.ts (single-table access)
│      └─ local-run.mts     # local pipeline → writes apps/admin-web/public/drafts.json fixture
│      └─ pipeline-run.mts  # drives the REAL handlers end-to-end vs real AWS (seeds + verifies a run)
├─ infra/                  # AWS CDK (TypeScript) — the whole architecture as code
│   ├─ bin/app.ts · lib/alphabeacon-stack.ts · cdk.json (runs via tsx)
├─ apps/admin-web/         # React 19 + Vite 7 admin app (the daily Review Queue)
│   ├─ src/{App,main}.tsx · src/pages/ReviewQueue.tsx · src/lib/api.ts
│   └─ .env.production      # VITE_API_URL → deployed API (committed; public URL, not a secret)
└─ docs/                   # ← you are here
```

### 1.2 AWS (account `810972021476`, IAM user `qusai`, region **us-east-1**)
CloudFormation stack **`AlphaBeacon`** (deployed via CDK). Outputs:

| Output | Value |
|---|---|
| **API base URL** | `https://m711qq2a30.execute-api.us-east-1.amazonaws.com` |
| **Cognito UserPoolId** | `us-east-1_74qRZnzlD` |
| **Cognito UserPoolClientId** | `18uragldp8bibp2saglu8qc9f` |
| **DynamoDB TableName** | `AlphaBeacon-TableCD117FA1-1DGAP7Q6VNIEI` |
| **S3 AssetsBucket** | `alphabeacon-assets9a31d427-rp1mx7trks4e` |
| **Step Functions** | state machine `DailyPipeline` (in the stack) |
| **EventBridge Scheduler** | `DefaultDailySchedule` — `cron(0 14 * * ? *)` `Asia/Amman`, **DISABLED** |

Bootstrap: the account was already CDK-bootstrapped (stack `CDKToolkit`, 2023).

### 1.3 Vercel (admin app hosting)
- **Team:** `alphapromenas-projects` (`team_ghx9RCoCKeZq5bJBgQqSIJ9B`)
- **Project:** `alphabeaconqusai-admin-web` (`prj_pkka7JrJm9nDWhflLYKgtUBG48qb`), framework Vite, Root Directory `apps/admin-web`, Output `dist`
- **Live URL:** https://alphabeaconqusai-admin-web.vercel.app (auto-deploys on push to `master`)
- ⚠️ **Access note:** `*.vercel.app` is **blocked on your office/uni Wi-Fi** (SNI reset, common in Jordan) — it opens fine on mobile data or via VPN. Durable fix: attach a custom subdomain of `alphapromena.com` (you own it on the same Vercel team).

---

## 2. Architecture (AWS-native, serverless)

```
Admin (React/Vite, hosted on Vercel; blueprint target = S3+CloudFront)
        │  fetch()  (Cognito auth planned)
        ▼
API Gateway (HTTP) ── Lambda (api/handler) ─────────► DynamoDB (single table: drafts, config, runs, feedback)
        │                                             S3 (images, raw signal, brand assets)
        │                                             Secrets Manager (LinkedIn OAuth, keys)
        ▼
EventBridge Scheduler ──► Step Functions (DailyPipeline)
   collect-signals → Map[per tone]: generate-draft → generate-image → guardrails → assemble
                                          │
                                          ▼
                              Amazon Bedrock (text: Nova Pro · image: Stability)
                              Bedrock Knowledge Base + OpenSearch Serverless (RAG — Phase 1.5)
```

**Data model (DynamoDB single-table):** `pk = TENANT#<id>`, `sk` = `CONFIG` | `RUN#<runId>` | `DRAFT#<runId>#<draftId>` | `FEEDBACK#<id>` | `POST#<id>`.

**HTTP API routes** (`services/backend/src/api/handler.ts`):
| Method · Path | Purpose |
|---|---|
| `GET /runs/latest?tenantId=` | Latest completed run + its drafts (the admin's default queue) |
| `GET /drafts?tenantId=&runId=` | Drafts for a specific run |
| `POST /on-demand` `{tenantId, instruction}` | Kick off an on-demand generation run |
| `POST /feedback` `{tenantId, draftId, rating, comment}` | Capture feedback (feeds future runs) |
| `POST /publish` `{tenantId, draftId}` | Publish to LinkedIn — **stubbed** until API approval |
| `POST /draft/edit` `{tenantId, runId, draftId, editedBody}` | Save an inline edit |
| `POST /draft/status` `{tenantId, runId, draftId, status}` | Approve / skip a draft |
| `GET /config?tenantId=` · `PUT /config {config}` | Read / update tenant config (schedule, topics, sources) |
| `POST /knowledge` `{tenantId, title, text}` | Ingest a doc into the RAG store (chunk + embed) |

---

## 3. AI models (what we use & why)

- **Text:** `us.amazon.nova-pro-v1:0` (Amazon Nova Pro) in **us-east-1** — works with no console gate, ~$1/month at this volume, good JSON-structured copy. Premium upgrade lever: Claude Sonnet 5.
- **Image:** `stability.stable-image-core-v1:1` (Stability Stable Image Core) in **us-west-2** — Active, on-demand, ~$0.04/image, verified working. **Why us-west-2:** us-east-1 offers *no* active text→image model for this account — Amazon's Titan/Nova Canvas are EOL/Legacy (Nova Canvas is access-blocked), and the only Stability models in us-east-1 are *editing* tools (upscale/inpaint), not base generators. The Stability base generators (Core/Ultra/SD3.5) are served from us-west-2. Bedrock invocation is region-independent from the S3 bucket, so this is transparent. Set via `config.imageRegion` (env `BEDROCK_IMAGE_REGION`, default `us-west-2`). Premium: `stability.stable-image-ultra-v1:1`.

Full pricing tables, cost projections, and the reasoning are in **[`docs/BEDROCK_MODELS.md`](./BEDROCK_MODELS.md)**.

Model ids are set in `services/backend/src/shared/config.ts` and overridable via env `BEDROCK_TEXT_MODEL` / `BEDROCK_IMAGE_MODEL`.

---

## 4. How to run things

All commands assume you've run `pnpm install` at the repo root once.

### 4.1 Admin app locally
```bash
pnpm dev:admin
# http://localhost:5175  — in dev, VITE_API_URL is unset so it reads the local
# apps/admin-web/public/drafts.json fixture (works on your Wi-Fi; not blocked).
```

### 4.2 Generate a real run locally (real Bedrock)
```bash
cd services/backend
AWS_REGION=us-east-1 npx tsx local-run.mts     # → writes drafts.json fixture (placeholder images)
```

### 4.3 Drive the real Lambda handlers end-to-end vs real AWS (seeds + verifies a run in DynamoDB)
```bash
cd services/backend
AWS_REGION=us-east-1 \
  TABLE_NAME=AlphaBeacon-TableCD117FA1-1DGAP7Q6VNIEI \
  ASSETS_BUCKET=alphabeacon-assets9a31d427-rp1mx7trks4e \
  npx tsx pipeline-run.mts
```

### 4.4 Build / typecheck
```bash
pnpm -r build          # build all packages
pnpm -r typecheck
```

### 4.5 Deploy infra (needs your AWS creds; see §7)
```bash
cd infra
CDK_DEFAULT_REGION=us-east-1 npx cdk deploy --require-approval never
```

### 4.6 Trigger the deployed pipeline (after deploy)
```bash
# via the API:
curl -X POST https://m711qq2a30.execute-api.us-east-1.amazonaws.com/on-demand \
  -H 'content-type: application/json' \
  -d '{"tenantId":"alpha-pro-mena","instruction":"data quality for AI readiness"}'
# or start the Step Functions state machine directly with input {"tenantId":"alpha-pro-mena"}
```

---

## 5. What was built / fixed in this session (2026-07-05)

1. **Made the CDK deployable** — `cdk.json` runs via **tsx** (ts-node/esm broke on Node 24); derived `__dirname` from `import.meta.url` (ESM); allowed the **esbuild** build script so `NodejsFunction` bundling works. Added `@types/node`.
2. **Deployed the backend** to AWS and verified the API (`GET /drafts` → 200).
3. **Wired the admin to the backend** — `VITE_API_URL` baked into `apps/admin-web/.env.production`; pushed → Vercel auto-redeployed.
4. **Fixed the Step Functions pipeline wiring** (it had never run):
   - The per-tone `Map` had no `itemSelector`, so each branch got only a bare tone (missing tenantId/brand/signals) → added an `itemSelector` merging the tone with the shared run context.
   - The guardrails step expected `{draft, bannedTerms, recentBodies}` but received flat draft fields → rewrote it to accept the flat draft and fetch banned terms + recent posts itself.
   - `collect-signals` now always returns `instruction` (empty string, not undefined) so the Map JSONPath resolves.
5. **Made image generation resilient** — a dead/disabled image model no longer sinks the whole run; the draft continues with no image.
6. **Fixed a latent DynamoDB bug** — writes crashed on `undefined` optional fields; the DocumentClient now uses `removeUndefinedValues`.
7. **Added a "latest run" API + admin wiring** — `GET /runs/latest`, and `api.listDrafts()` now fetches the latest completed run's drafts.
8. **Set the image model** to the Active `stability.stable-image-core-v1:1` (Amazon image models are EOL).
9. **Researched all Bedrock models** with pricing → `docs/BEDROCK_MODELS.md`.

---

## 6. Phase-1 scope status (vs. blueprint)

| Feature | Status |
|---|---|
| Daily pipeline: 5 posts across tones, each with rationale + citations + image | 🟢 built & verified end-to-end on AWS |
| Guardrails: brand-safety, claim-check, repetition, style | 🟢 working (correctly flags buzzwords / unsourced claims) |
| Review queue: view / **inline edit** / **approve** / **feedback (up-down + note)** / **skip** | 🟢 admin UI, all actions wired to the API |
| On-demand generation (from the review queue) | 🟢 `POST /on-demand` + UI box |
| **RAG grounding** (company + Ataccama knowledge) | 🟢 lightweight vector store (Titan embeddings + DynamoDB), seeded & retrieval-verified |
| **Feedback learning loop** | 🟢 up-rated posts → few-shot exemplars; comments → preference notes, injected into generation |
| **Config UI** (schedule / topics / keyword sources) | 🟢 Settings tab + `GET`/`PUT /config` |
| Markdown rendering in the review queue | 🟢 |
| Signal variety | 🟢 18 sources + per-tone signal rotation (see `docs/MODEL_EVAL.md`) |
| LinkedIn publishing | 🔴 stubbed — blocked on API approval (external) |
| Multi-tenant architecture | 🟢 tenant-scoped from day one |

> Note on RAG: the blueprint specifies Bedrock Knowledge Bases + OpenSearch Serverless. We use an equivalent **serverless vector store** (Bedrock Titan embeddings + DynamoDB + in-Lambda cosine) instead — it delivers the same MVP grounding at ~$0 idle, vs. OpenSearch Serverless's ~$700/month floor. Swappable later behind the same `retrieveGrounding()` interface.

---

## 7. What still needs you

**Just one thing** — I'm blocked from running cloud IaC applies autonomously (harness security boundary). Everything else (code, admin on Vercel, RAG seeding, verification) is done.

**Deploy the latest backend** (pushes the new pipeline logic + new API routes — RAG grounding, learning loop, per-tone variety, `/config`, `/draft/edit`, `/draft/status`, `/knowledge` — to AWS):
```bash
cd C:\Users\user\alphabeaconqusai\infra
npx cdk deploy --require-approval never
```
The admin (Vercel) already auto-deploys on push, but the **new API routes only go live after this `cdk deploy`**. Until then, the Settings tab and edit/skip actions call routes the old Lambda returns 404 for.

> Note: `cdk deploy` via a normal shell may hit a 2-minute wrapper timeout, but CloudFormation finishes server-side regardless — just re-check the stack status if the CLI is killed.

**Already done for you (no action needed):** image model works (`stability.stable-image-core-v1:1` in us-west-2 — Bedrock's Model-access page is retired, models auto-activate on first invoke); the RAG knowledge base is seeded (`seed-knowledge.mts`, 6 chunks of Alpha Pro / Ataccama grounding).

**Then, to go live daily:** run a test generation (§4.6), confirm the drafts look right in the admin, then enable the `DefaultDailySchedule` EventBridge schedule (flip `state` to `ENABLED` in `infra/lib/alphabeacon-stack.ts` and redeploy, or enable it in the console).

**Optional but recommended:** attach a custom subdomain of `alphapromena.com` to the Vercel project so the admin isn't blocked on your Wi-Fi.

---

## 8. Security notes
- ⚠️ **The HTTP API is currently unauthenticated** — fine for a private single-operator demo, but wire a Cognito authorizer + admin login before sharing the URL. Full analysis in **`docs/SECURITY_REVIEW.md`** (1 High + minor items).
- AWS credentials live in `~/.aws/credentials` on your machine — never in the repo, never shared in chat.
- LinkedIn OAuth tokens + third-party keys belong in **AWS Secrets Manager** (the stack provisions a secret), never in the repo.
- `.env*` is gitignored except `.env.example` and the admin's public `.env.production` (which holds only the public API URL).
- Assets S3 bucket is private; images are served via short-lived presigned URLs.

## 9. Companion documents
- **`BEDROCK_MODELS.md`** — Bedrock text + image model pricing & recommendation.
- **`MODEL_EVAL.md`** — post variety / repetition evaluation (before/after).
- **`QA_REPORT.md`** — full end-to-end QA results.
- **`SECURITY_REVIEW.md`** — security findings & remediation order.
