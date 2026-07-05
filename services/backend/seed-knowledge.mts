/**
 * Seed the RAG knowledge base for Alpha Pro MENA with company + Ataccama grounding, so daily
 * generation is anchored in real business facts rather than generic model knowledge.
 *
 *   cd services/backend
 *   TABLE_NAME=... AWS_REGION=us-east-1 npx tsx seed-knowledge.mts
 */
import { ingestDocument } from "./src/rag/ingest.js";

const TENANT = "alpha-pro-mena";

const DOCS: { docId: string; title: string; text: string }[] = [
  {
    docId: "company-profile",
    title: "Alpha Pro MENA — Company Profile",
    text: `Alpha Pro MENA is a multi-practice AI and data firm serving enterprises across the Middle East and North Africa. It is the only certified Ataccama Solution Partner in the MENA region, and works in strategic alliance with Baker Tilly for audit, tax, and advisory services.

Offer: data governance and intelligence delivered on the Ataccama ONE platform; AI consulting and AI audits; custom AI and agentic-AI solutions; and full-stack platform / product development for enterprises.

Differentiators: the only certified Ataccama Solution Partner in MENA; the Baker Tilly alliance pairing data/AI with regulatory, audit and compliance depth; combined AI + data-engineering capability; and regional expertise and network across the GCC and wider MENA market.

Ideal customers: CDOs, CIOs, heads of data, and data leaders at banks, government entities, healthcare, telecom, and large enterprises pursuing AI readiness and regulatory compliance.

Contact: info@alphapromena.com, +962 79 186 4006, Amman, Jordan. Standard call to action: "Is your data AI-ready? Book a free discovery."`,
  },
  {
    docId: "ataccama-one",
    title: "Ataccama ONE — Platform Capabilities",
    text: `Ataccama ONE is a unified, AI-powered data management platform that brings data quality, data governance, master data management (MDM), a data catalog, and data observability together in a single product.

Data quality: automated profiling, rule-based and AI-suggested data quality checks, cleansing and standardization, and continuous monitoring of data health across sources.

Data governance: a business glossary, data ownership and stewardship workflows, policies, and lineage so organizations can trust and control their data.

Data catalog: automated discovery and cataloging of data assets with AI-assisted metadata, making data findable and understandable across the enterprise.

Master data management (MDM): a single trusted view of core entities (customers, products, suppliers) through matching, merging, and survivorship.

Data observability: anomaly detection and monitoring that flags data issues (freshness, volume, schema drift) before they reach downstream AI and analytics.

AI readiness: because AI amplifies whatever data it is fed, clean, governed, well-cataloged data is the foundation of reliable AI. Ataccama ONE is designed to make enterprise data AI-ready, with agentic and generative-AI features that accelerate data management tasks.`,
  },
  {
    docId: "positioning",
    title: "Positioning & Messaging",
    text: `Core thesis: "garbage in, garbage out" — AI does not fix poor data, it scales the damage. Reliable AI outcomes require trustworthy, governed data first. Most failed AI initiatives are data problems, not model problems.

Poor data quality is widely cited by analysts as a multi-million-dollar annual cost to large enterprises and a top reason AI and analytics projects underdeliver.

Alpha Pro MENA's message to enterprise leaders: get your data AI-ready — quality, governance, catalog, and observability — then let AI earn its keep. In regulated MENA industries (banking, government, healthcare), governance and compliance are non-negotiable, and the Baker Tilly alliance strengthens that assurance.

Voice: confident, data-driven, and credibly provocative — never clickbait. Always tie data quality/governance to concrete AI and business outcomes, cite real sources for any statistic, and end on a clear call to action.`,
  },
];

let total = 0;
for (const d of DOCS) {
  const n = await ingestDocument(TENANT, d.title, d.text, d.docId);
  console.log(`  ✔ ingested "${d.title}" → ${n} chunks`);
  total += n;
}
console.log(`\n✔ seeded ${total} knowledge chunks for ${TENANT}`);
