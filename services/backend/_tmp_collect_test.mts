import { collectSignals } from "./src/collect/feeds.js";
const sources = [
  { id: "kw-dq", kind: "keyword" as const, value: "data quality" },
  { id: "kw-agentic", kind: "keyword" as const, value: "agentic AI enterprise" },
  { id: "dataversity", kind: "blog" as const, value: "https://www.dataversity.net" },
];
const signals = await collectSignals(sources, 3, 8);
console.log(`\nCollected ${signals.length} signals:\n`);
for (const s of signals) console.log(`• [${s.sourceId}] ${s.title}\n    ${s.url}\n`);
