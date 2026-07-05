import { listKnowledgeChunks } from "../shared/dynamo.js";
import { embed, cosine } from "./embeddings.js";

/**
 * Retrieval-augmented grounding: pull the most relevant snippets from the tenant's ingested
 * knowledge (company profile, product sheets, case studies, past winning posts) so generation
 * reflects the business rather than generic knowledge.
 *
 * Lightweight store: chunks + Titan embeddings live in DynamoDB; similarity is computed in the
 * Lambda (cosine). Fine for MVP scale (tens–hundreds of chunks) and costs ~nothing at idle,
 * unlike OpenSearch Serverless. Swap for a Bedrock Knowledge Base later without touching callers.
 *
 * Returns [] when nothing has been ingested — the pipeline degrades to topic + signal grounding.
 */
export async function retrieveGrounding(tenantId: string, query: string, topK = 5): Promise<string[]> {
  const chunks = await listKnowledgeChunks(tenantId);
  if (!chunks.length) return [];

  const q = await embed(query);
  return chunks
    .map((c) => ({ text: c.text, score: cosine(q, c.vector) }))
    .sort((a, b) => b.score - a.score)
    .filter((r) => r.score > 0.05) // drop only near-zero matches (Titan v2 cosines run low)
    .slice(0, topK)
    .map((r) => r.text);
}
