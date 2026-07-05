/**
 * AI model evaluation: does AlphaBeacon produce VARIED posts, or the same idea repeatedly?
 * Loads every persisted draft, embeds each body, and measures semantic similarity:
 *   - intra-run diversity: how distinct are the 5 tones within one run (lower cosine = better)
 *   - cross-run repetition: how similar is a tone's post across different runs (lower = better)
 *
 *   cd services/backend
 *   TABLE_NAME=... AWS_REGION=us-east-1 npx tsx eval-model.mts
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { embed, cosine } from "./src/rag/embeddings.js";

const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: "us-east-1" }));
const T = process.env.TABLE_NAME!;

const res = await doc.send(new QueryCommand({
  TableName: T,
  KeyConditionExpression: "pk = :p AND begins_with(sk, :s)",
  ExpressionAttributeValues: { ":p": "TENANT#alpha-pro-mena", ":s": "DRAFT#" },
}));
const drafts = (res.Items ?? []).map((i) => i.data as any);
const byRun = new Map<string, any[]>();
for (const d of drafts) { const a = byRun.get(d.runId) ?? []; a.push(d); byRun.set(d.runId, a); }

// Embed each body once.
const vec = new Map<string, number[]>();
for (const d of drafts) vec.set(d.draftId, await embed(d.editedBody ?? d.body));
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

console.log(`Analyzed ${drafts.length} drafts across ${byRun.size} runs.\n`);

console.log("INTRA-RUN DIVERSITY (avg pairwise cosine of the 5 tones — lower = more varied):");
const intra: number[] = [];
for (const [runId, ds] of byRun) {
  if (ds.length < 2) continue;
  const sims: number[] = [];
  for (let i = 0; i < ds.length; i++) for (let j = i + 1; j < ds.length; j++) sims.push(cosine(vec.get(ds[i].draftId)!, vec.get(ds[j].draftId)!));
  const a = avg(sims); intra.push(a);
  console.log(`  ${runId.slice(0, 8)}  n=${ds.length}  avg=${a.toFixed(3)}  ${a < 0.6 ? "✅ varied" : a < 0.8 ? "🟡 some overlap" : "❌ repetitive"}`);
}
console.log(`  → overall intra-run avg: ${avg(intra).toFixed(3)}\n`);

console.log("CROSS-RUN REPETITION (same tone across different runs — lower = fresher over time):");
const byTone = new Map<string, any[]>();
for (const d of drafts) { const a = byTone.get(d.toneProfileId) ?? []; a.push(d); byTone.set(d.toneProfileId, a); }
const cross: number[] = [];
for (const [tone, ds] of byTone) {
  const uniqRun = new Map<string, any>(); for (const d of ds) if (!uniqRun.has(d.runId)) uniqRun.set(d.runId, d);
  const list = [...uniqRun.values()]; if (list.length < 2) continue;
  const sims: number[] = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) sims.push(cosine(vec.get(list[i].draftId)!, vec.get(list[j].draftId)!));
  const a = avg(sims); cross.push(a);
  console.log(`  ${tone.padEnd(13)} runs=${list.length}  avg=${a.toFixed(3)}  ${a < 0.7 ? "✅ fresh" : a < 0.85 ? "🟡 similar" : "❌ near-duplicate"}`);
}
console.log(`  → overall cross-run avg: ${avg(cross).toFixed(3)}\n`);

// Image-prompt variety
const prompts = drafts.map((d) => d.image?.prompt).filter(Boolean);
const uniqWords = new Set(prompts.join(" ").toLowerCase().split(/\W+/).filter((w:string) => w.length > 4));
console.log(`IMAGE PROMPTS: ${prompts.length} prompts, ${uniqWords.size} distinct significant words (higher = more visual variety).`);
