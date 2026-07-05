/**
 * End-to-end pipeline dry-run that drives the REAL Lambda handlers in the same order the
 * Step Functions state machine does (collect → per-tone: draft → image → guardrails → assemble),
 * against real AWS (Bedrock + DynamoDB). Proves the wiring fixes before the SFN deploy and
 * seeds a real run into DynamoDB so the deployed API's /runs/latest has data to serve.
 *
 *   cd services/backend
 *   TABLE_NAME=... ASSETS_BUCKET=... AWS_REGION=us-east-1 npx tsx pipeline-run.mts
 */
import { ALPHA_PRO_MENA } from "@alphabeacon/shared";
import { putConfig, latestRun, listDrafts } from "./src/shared/dynamo.js";
import { handler as collect } from "./src/pipeline/collect-signals.js";
import { handler as generateDraft } from "./src/pipeline/generate-drafts.js";
import { handler as generateImage } from "./src/pipeline/generate-images.js";
import { handler as guardrails } from "./src/pipeline/guardrails.js";
import { handler as assemble } from "./src/pipeline/assemble.js";

// 1. Seed the tenant config into DynamoDB (idempotent).
await putConfig(ALPHA_PRO_MENA);
console.log(`✔ seeded config for ${ALPHA_PRO_MENA.tenantId}`);

// 2. collect signals (opens a run, returns the shared context).
const ctx: any = await collect({ tenantId: ALPHA_PRO_MENA.tenantId });
console.log(`✔ collect: runId=${ctx.runId}  signals=${ctx.signals.length}  tones=${ctx.tones.length}`);

// 3. Per-tone fan-out — exactly what the SFN Map does, sequentially here.
const drafts: any[] = [];
for (let i = 0; i < ctx.tones.length; i++) {
  const tone = ctx.tones[i];
  const item = {
    tenantId: ctx.tenantId,
    runId: ctx.runId,
    tone,
    brand: ctx.brand,
    topics: ctx.topics,
    signals: ctx.signals,
    grounding: ctx.grounding,
    exemplars: ctx.exemplars,
    preferenceNotes: ctx.preferenceNotes,
    recentThemes: ctx.recentThemes,
    itemIndex: i,
    instruction: ctx.instruction,
  };
  const d1: any = await generateDraft(item);
  const d2: any = await generateImage(d1);
  const d3: any = await guardrails(d2);
  drafts.push(d3);
  console.log(`  ✍️  ${tone.id.padEnd(14)} ${d3.status}${d3.image ? " 🖼" : " (no image)"}`);
}

// 4. assemble — persist drafts + mark run completed.
const res: any = await assemble({ tenantId: ctx.tenantId, runId: ctx.runId, drafts });
console.log(`✔ assemble: ${res.draftCount} drafts persisted, run ${res.status}`);

// 5. Verify via the same paths the API uses.
const lr = await latestRun(ALPHA_PRO_MENA.tenantId);
const listed = lr ? await listDrafts(ALPHA_PRO_MENA.tenantId, lr.runId) : [];
console.log(`✔ verify: latestRun=${lr?.runId} (${lr?.status}) → listDrafts returned ${listed.length} drafts`);
