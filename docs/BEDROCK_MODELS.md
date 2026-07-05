# AlphaBeacon — Amazon Bedrock Model Cost/Capability Study (us-east-1, mid-2026)

> **Scope:** Bedrock foundation models relevant to AlphaBeacon's workload — LinkedIn marketing copy (JSON-structured, ~2K output tokens/post, 5/day) and matching 1024×1024 brand images (~5/day). All figures are for **us-east-1**, on-demand pricing.
>
> **Verification note:** Token/image prices below are cross-checked against the [AWS Bedrock pricing page](https://aws.amazon.com/bedrock/pricing/), the [Amazon Nova pricing page](https://aws.amazon.com/nova/pricing/), and the [Bedrock model-lifecycle doc](https://docs.aws.amazon.com/bedrock/latest/userguide/model-lifecycle.html). AWS's pricing page renders its rate tables via JavaScript, so a few provider-specific numbers (noted inline) could **not** be pinned to a single authoritative figure and are flagged rather than guessed. **Exact dated Bedrock model-ID suffixes for the newest Claude models should be confirmed with `aws bedrock list-inference-profiles --region us-east-1` before pasting into code.**

---

## 1. TEXT models

AlphaBeacon currently invokes `us.amazon.nova-pro-v1:0` (a cross-region inference-profile ID), so the table uses that same **classic Bedrock InvokeModel/Converse** convention: base ID `provider.model-vN:0`, with a `us.` prefix where a US cross-region inference profile is required.

| Model | Bedrock invoke ID (us-east-1) | Input $/1M | Output $/1M | Context | Best-for / notes |
|---|---|---|---|---|---|
| **Amazon Nova Micro** | `us.amazon.nova-micro-v1:0` | **$0.035** | **$0.14** | 128K | Text-only, fastest/cheapest. Good for classification, short copy. |
| **Amazon Nova Lite** | `us.amazon.nova-lite-v1:0` | **$0.06** | **$0.24** | 300K | Multimodal, very cheap. Strong value for structured short-form copy. |
| **Amazon Nova Pro** | `us.amazon.nova-pro-v1:0` | **$0.80** | **$3.20** | 300K | **AlphaBeacon's current model.** Balanced quality; handles JSON output well. |
| **Amazon Nova Premier** | `us.amazon.nova-premier-v1:0` | **$1.20** | **$6.00** | 1M | ⚠️ **LEGACY** in us-east-1 (Legacy 2026-03-13, **EOL 2026-09-14**). Do not adopt. |
| **Claude Haiku 4.5** | `us.anthropic.claude-haiku-4-5-20251001-v1:0` | **$1.00** | **$5.00** | 200K | Cheapest current Claude; fast, good instruction-following. |
| **Claude Sonnet 5** | `us.anthropic.claude-sonnet-5-...-v1:0` ⚠️ verify suffix | **$3.00** (**$2.00 intro**) | **$15.00** (**$10.00 intro**) | 1M | Near-Opus quality on writing/agentic. Intro pricing through **2026-08-31**, then $3/$15. Best quality-for-price for premium brand copy. |
| **Claude Opus 4.8** | `us.anthropic.claude-opus-4-8-...-v1:0` ⚠️ verify suffix | **$5.00** | **$25.00** | 1M | Flagship. Overkill (and pricey) for short marketing posts. |
| **Meta Llama 3.3 70B** | `us.meta.llama3-3-70b-instruct-v1:0` | ~**$0.72** | ~**$0.72** ⚠️ | 128K | Open-weight, flat in/out rate. Solid general copy; needs `us.` profile. |
| **Meta Llama 4 Maverick 17B** | `us.meta.llama4-maverick-17b-instruct-v1:0` | *not verified* | *not verified* | up to 1M | Latest Llama 4 MoE; requires `us.` profile. Per-token price **could not be verified** — confirm before use. |
| **Meta Llama 4 Scout 17B** | `us.meta.llama4-scout-17b-instruct-v1:0` | *not verified* | *not verified* | up to 10M | Long-context Llama 4; requires `us.` profile. Price **not verified**. |
| **Mistral Large (24.07)** | `mistral.mistral-large-2407-v1:0` | ~**$2.00** ⚠️ | ~**$6.00** ⚠️ | 128K | European-hosted option. AWS page returned inconsistent Mistral figures — **treat as unverified**. |

**Claude-on-Bedrock ID caveat:** newest Claude models are accessed through **US cross-region inference profiles** (`us.anthropic.…`) with a dated `-YYYYMMDD-v1:0` suffix. Haiku 4.5's dated ID (`…-20251001-v1:0`) is confirmed; Sonnet 5 / Opus 4.8 date suffixes were **not** confirmable — run `aws bedrock list-inference-profiles` to get exact strings.

---

## 2. IMAGE models

**🔴 Headline finding (verified against the [model-lifecycle table](https://docs.aws.amazon.com/bedrock/latest/userguide/model-lifecycle.html)):** Both Amazon image models are **deprecated in us-east-1**. The **Active** image generators on Bedrock are the **Stability AI** models.

| Model | Bedrock invoke ID | Price per image | Quality / control notes | Cross-region profile? |
|---|---|---|---|---|
| **Stable Image Core** | `stability.stable-image-core-v1:1` | ~**$0.03–$0.04** ⚠️ (sources conflict) | Fast, efficient text-to-image. Good default for 1024×1024 social/brand images. | No — in-region in us-east-1 |
| **Stable Image Ultra** | `stability.stable-image-ultra-v1:1` | ~**$0.08** ⚠️ (older listings $0.14) | Best typography, composition, lighting, color — strongest for polished brand visuals. Built on SD3.5 Large. | No — in-region |
| **Stable Diffusion 3.5 Large** | `stability.sd3-5-large-v1:0` | ~**$0.08** | Stability flagship; excellent prompt adherence. Middle option between Core and Ultra. | No — in-region |
| **Stable Diffusion 3 Large** | `stability.sd3-large-v1:0` | ~**$0.08** | Predecessor to 3.5 Large; prefer 3.5. | No — in-region |
| **Amazon Nova Canvas** | `amazon.nova-canvas-v1:0` | $0.04 (Std) / $0.06 (Premium) @1024² | Studio-quality + watermarking. ⚠️ **LEGACY in us-east-1** (EOL 2026-09-30). New adoption discouraged. | No |
| **Amazon Titan Image G1 v2** | `amazon.titan-image-generator-v2:0` | (n/a — retiring) | ⚠️ **LEGACY** (EOL 2026-06-30). AlphaBeacon's dead model. | No |

---

## 3. Cost projection (30-day month; 5 posts/day @1K in+2K out; 5 images/day = 150/mo)

**Text = (0.15M × input$) + (0.30M × output$):**

| Text model | Monthly text |
|---|---|
| Nova Lite | **≈ $0.08** |
| Nova Pro (current) | **≈ $1.08** |
| Claude Haiku 4.5 | **≈ $1.65** |
| Claude Sonnet 5 (std) | **≈ $4.95** (intro **$3.30**) |

**Image = 150 × price/image:**

| Image model | Monthly image |
|---|---|
| Stable Image Core | **≈ $6.00** (≈ $4.50 if $0.03) |
| SD3.5 Large | **≈ $12.00** |
| Stable Image Ultra | **≈ $12.00** (≈ $21 if $0.14) |

**Combined:**

| Combo | **Monthly total** |
|---|---|
| **Cheap** — Nova Lite + Stable Image Core | **≈ $6.08** |
| **Balanced** — Nova Pro + Stable Image Core | **≈ $7.08** |
| **Balanced+** — Nova Pro + SD3.5 Large | **≈ $13.08** |
| **Premium** — Claude Sonnet 5 + Stable Image Ultra | **≈ $16.95** (intro ≈ $15.30) |

**Takeaway:** image generation is ~85–90% of the bill at this volume. Text is a rounding error — even flagship Sonnet 5 adds only ~$4/month.

---

## 4. Recommendation

**Text — keep `us.amazon.nova-pro-v1:0`** (works, ~$1/mo, good JSON). Premium lever: **Claude Sonnet 5** (~+$3–4/mo, near-Opus quality, intro-priced through 2026-08-31). Avoid Nova Premier (Legacy/EOL).

**Image — migrate to Stability (Nova Canvas is a dead end, EOL 2026-09-30):**
- **Primary: `stability.stable-image-core-v1:1`** — fast, ~$0.04/image (~$6/mo), Active, in-region.
- **Premium: `stability.stable-image-ultra-v1:1`** or **`stability.sd3-5-large-v1:0`** for polished typography/composition (~$12/mo).

**Before shipping:** confirm in the AWS console (us-east-1): (1) live per-image price for Stable Image Core/Ultra, (2) exact dated inference-profile IDs for any Claude model, (3) that **model access is enabled for the Stability models** in the account.
