# AlphaBeacon

An autonomous LinkedIn presence & demand-generation engine.

Every day AlphaBeacon studies the market, drafts a set of on-brand LinkedIn posts in
different tones, generates a matching image for each, runs guardrails, and hands a human a
short, ready-to-publish shortlist. A person stays in the loop — they pick, tweak, or redirect —
and every choice teaches the system to do better next time.

Initial tenant: **Alpha Pro MENA** (Ataccama data-quality partner). Multi-tenant from day one.

> Phase 1 = MVP. Stack follows the blueprint (AWS-native serverless) with **one change: the
> admin app is React (Vite), not Flutter.**

## Architecture (AWS-native, serverless)

```
Admin (React/Vite, S3+CloudFront)
        │  Cognito auth
        ▼
API Gateway ── Lambda ─────────────► DynamoDB (drafts, config, feedback)
        │                            S3 (images, raw signal, brand assets)
        │                            Secrets Manager (LinkedIn OAuth, keys)
        ▼
EventBridge Scheduler ──► Step Functions (daily pipeline)
        collect signals → generate 5 drafts (fan-out) → images → guardrails → assemble
                                   │
                                   ▼
                       Amazon Bedrock (text + image models)
                       Bedrock Knowledge Bases + OpenSearch Serverless (RAG)
```

## Monorepo layout

| Path | What |
|------|------|
| `packages/shared` | Shared TypeScript types + the tone profiles (the data model) |
| `infra` | AWS CDK (TypeScript) — the whole architecture as code |
| `services/backend` | Lambda handlers: the daily pipeline tasks + the API |
| `apps/admin-web` | React (Vite) admin app: the daily review queue |

## Phase 1 scope (MVP)

- [x] Data model + tone profiles
- [x] Infrastructure-as-code skeleton (CDK)
- [ ] Daily pipeline: collect → generate (5 tones) → images → guardrails → assemble
- [ ] RAG grounding (Bedrock Knowledge Base ingestion)
- [ ] Guardrails: brand-safety, claim-verification, repetition
- [ ] Admin review queue: select / edit / publish / feedback
- [ ] On-demand generation
- [ ] LinkedIn publishing *(blocked on LinkedIn app approval — stubbed until then)*
- [ ] Feedback learning loop

Deferred to Phase 2–3: multi-brand UI, analytics, optimal-time scheduling, Arabic support,
brand-kit image automation, fine-tuned models.

## Getting started (local dev)

```bash
pnpm install
pnpm -r build           # build all packages
```

Deployment (later — needs AWS credentials configured **by you**, not shared in chat):

```bash
# configure an IAM user with least-privilege access keys, then:
cd infra && pnpm cdk deploy
```

### Required setup (your side)
- AWS account with **Amazon Bedrock model access enabled** (text + image) in `us-east-1`.
- IAM user with scoped permissions + access keys (never a console password).
- LinkedIn Community Management API approval (in progress) for publishing.

## Security

Never commit secrets. LinkedIn OAuth tokens and third-party keys live in **AWS Secrets
Manager**, never in the repo. `.env` files are gitignored.
