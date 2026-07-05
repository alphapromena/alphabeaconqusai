# AlphaBeacon — Security Review

_Review of the deployed system and the code as of 2026-07-06. Scope: API, data, IAM, frontend, secrets._

## Summary
No secret leakage, no injection vulnerabilities, and data-at-rest is private. The **one significant issue is that the HTTP API has no authentication** — acceptable for a closed demo, but it must be fixed before the admin is shared or the URL is public. Everything else is minor hardening.

| # | Severity | Finding | Status / fix |
|---|---|---|---|
| 1 | 🔴 High | **API is unauthenticated** — every route (incl. writes: `/config`, `/knowledge`, `/draft/edit`, `/on-demand`, `/feedback`) is open to the internet; a Cognito pool exists but is not wired as an API-Gateway authorizer. With CORS `*`, anyone can read drafts, overwrite tenant config, poison the RAG store, or trigger billable generation runs. | **Open — recommended before public exposure.** Add an `HttpUserPoolAuthorizer` (Cognito) to the HTTP API and a login flow in the admin. |
| 2 | 🟠 Medium | **No rate/cost limit on `/on-demand`** — `config.limits.maxOnDemandPerDay` exists but isn't enforced; unauthenticated callers could spawn many Bedrock runs (cost). | Enforce the daily cap in the handler (count today's runs) and/or a WAF rate limit. Mitigated once #1 lands. |
| 3 | 🟡 Low | **Bedrock IAM policy is `resources: ["*"]`** — the Lambdas may invoke any Bedrock model, not just the ones we use. | Scope to the specific model ARNs (Nova Pro, Stable Image Core, Titan Embed) once IDs are final. |
| 4 | 🟡 Low | Input validation on new write routes is minimal (e.g. `/draft/status` accepts any string). | Validate against known enums; low impact while data is tenant-scoped. |

## What's already good ✅
- **Secrets:** none committed (git-scanned); LinkedIn tokens/keys are provisioned in **AWS Secrets Manager**, not the repo. `.env*` gitignored (except the public API URL).
- **Data at rest:** the assets **S3 bucket is fully private** (all four public-access blocks on); images are served only via **short-lived presigned URLs** (1 h). DynamoDB table + bucket use `RETAIN`.
- **Injection:** all DynamoDB access is via the SDK Document client (parameterized) — no query injection. The admin's Markdown renderer builds **React nodes** (no `dangerouslySetInnerHTML`, no raw HTML) — XSS-safe. No `eval`/`child_process`/dynamic code.
- **Transport:** all endpoints HTTPS; HSTS on the Vercel admin.
- **Auth infra present:** Cognito user pool exists with **admin-only signup** (`selfSignUpEnabled: false`) — the foundation for fixing #1.
- **Least data:** the pipeline reads only public sources; it never touches LinkedIn feeds (per LinkedIn ToS) or any PII.

## Recommended remediation order
1. **Wire Cognito auth on the API** (#1) + admin login — the single most important step before sharing the admin URL.
2. Enforce the on-demand daily cap (#2).
3. Scope the Bedrock IAM policy (#3) and add enum validation (#4).
4. Optional: a Vercel/WAF rate limit and a custom domain (also fixes the `*.vercel.app` Wi-Fi block).

**Bottom line:** safe to keep using as a private, single-operator tool now; do #1 before it's exposed to anyone else.
