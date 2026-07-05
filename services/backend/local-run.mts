/**
 * Local end-to-end run: collect live signals → generate the day's drafts → guardrails →
 * image (real Bedrock image model if one is enabled, else a branded placeholder) → write
 * everything to the admin app's public/ so the Review Queue shows a real run without AWS deploy.
 *
 * Run from services/backend:  ./node_modules/.bin/tsx local-run.mts
 */
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { collectSignals } from "./src/collect/feeds.js";
import { generateDraft } from "./src/bedrock/generate.js";
import { generateImage } from "./src/bedrock/images.js";
import { buildReport, reportPassed } from "./src/pipeline/guardrails.js";
import { config } from "./src/shared/config.js";
import { ALPHA_PRO_MENA, TONE_PROFILES, type Draft } from "@alphabeacon/shared";

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(here, "../../apps/admin-web/public");
const imagesDir = resolve(publicDir, "images");
mkdirSync(imagesDir, { recursive: true });

const runId = `run-${new Date().toISOString().slice(0, 10)}`;
const brand = ALPHA_PRO_MENA.brand;

console.log(`\n📡 collecting signals…`);
const signals = await collectSignals(ALPHA_PRO_MENA.sources.filter((s) => s.kind === "keyword"), 3, 12);
console.log(`   ${signals.length} signals. text model: ${config.textModelId}\n`);

const drafts: Draft[] = [];
const prior: string[] = [];

for (const tone of TONE_PROFILES) {
  const draftId = randomUUID().slice(0, 8);
  process.stdout.write(`✍️  ${tone.name.padEnd(14)} `);
  const g = await generateDraft({ brand, tone, topics: ALPHA_PRO_MENA.topics, signals, grounding: [], exemplars: [] });
  const guardrails = buildReport(g.body, g.citations, brand.bannedTerms, prior);
  prior.push(g.body);

  // Image: try a real Bedrock image model; fall back to an on-brand placeholder.
  let image: Draft["image"];
  try {
    const png = await generateImage(g.imagePrompt);
    writeFileSync(resolve(imagesDir, `${draftId}.png`), png);
    image = { s3Key: `/images/${draftId}.png`, prompt: g.imagePrompt, model: config.imageModelId };
    process.stdout.write("🖼  real  ");
  } catch {
    const svg = placeholderSvg(tone.name, g.imagePrompt, drafts.length);
    writeFileSync(resolve(imagesDir, `${draftId}.svg`), svg);
    image = { s3Key: `/images/${draftId}.svg`, prompt: g.imagePrompt, model: "placeholder" };
    process.stdout.write("🎨 placeholder ");
  }

  drafts.push({
    tenantId: ALPHA_PRO_MENA.tenantId,
    draftId,
    runId,
    toneProfileId: tone.id,
    body: g.body,
    rationale: g.rationale,
    citations: g.citations,
    image,
    guardrails,
    status: reportPassed(guardrails) ? "needs_review" : "flagged",
    createdAt: new Date().toISOString(),
  });
  console.log(reportPassed(guardrails) ? "✅" : "⚠️ flagged");
}

writeFileSync(resolve(publicDir, "drafts.json"), JSON.stringify({ runId, drafts }, null, 2));
console.log(`\n✔ wrote ${drafts.length} drafts → ${resolve(publicDir, "drafts.json")}`);

/** Deterministic on-brand abstract placeholder (used until a Bedrock image model is enabled). */
function placeholderSvg(tone: string, prompt: string, i: number): string {
  const rose = "#FF1E57";
  const cx = [22, 78, 30, 70, 50][i % 5];
  const cy = [30, 68, 72, 26, 50][i % 5];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="g" cx="${cx}%" cy="${cy}%" r="90%">
      <stop offset="0%" stop-color="#2a1420"/>
      <stop offset="55%" stop-color="#17121b"/>
      <stop offset="100%" stop-color="#0d0b10"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <g fill="none" stroke="${rose}" stroke-opacity="0.5">
    <circle cx="${cx * 12}" cy="${cy * 6.3}" r="120"/>
    <circle cx="${cx * 12}" cy="${cy * 6.3}" r="190" stroke-opacity="0.25"/>
    <circle cx="${cx * 12}" cy="${cy * 6.3}" r="260" stroke-opacity="0.12"/>
  </g>
  <circle cx="${cx * 12}" cy="${cy * 6.3}" r="10" fill="${rose}"/>
  <text x="60" y="80" fill="#f1eff3" font-family="ui-monospace,monospace" font-size="20" letter-spacing="3" opacity="0.85">ALPHABEACON</text>
  <text x="60" y="560" fill="${rose}" font-family="ui-monospace,monospace" font-size="26" letter-spacing="2">${esc(tone)}</text>
  <text x="60" y="595" fill="#c9c6d0" font-family="system-ui,sans-serif" font-size="16" opacity="0.7">${esc(prompt.slice(0, 78))}</text>
</svg>`;
}

function esc(s: string): string {
  return s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] as string);
}
