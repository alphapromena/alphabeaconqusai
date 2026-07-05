import { BedrockAgentRuntimeClient, RetrieveCommand } from "@aws-sdk/client-bedrock-agent-runtime";
import { config } from "../shared/config.js";

const client = new BedrockAgentRuntimeClient({ region: config.region });

/**
 * Retrieval-augmented grounding: pull the most relevant snippets from the tenant's Bedrock
 * Knowledge Base (uploaded company profile, product sheets, case studies, past winning posts)
 * so generation reflects the business rather than generic knowledge.
 *
 * Returns [] until a Knowledge Base is provisioned and BEDROCK_KB_ID is set — the pipeline
 * degrades gracefully to topic + signal grounding only.
 */
export async function retrieveGrounding(query: string, topK = 5): Promise<string[]> {
  if (!config.knowledgeBaseId) return [];

  const res = await client.send(
    new RetrieveCommand({
      knowledgeBaseId: config.knowledgeBaseId,
      retrievalQuery: { text: query },
      retrievalConfiguration: { vectorSearchConfiguration: { numberOfResults: topK } },
    }),
  );

  return (res.retrievalResults ?? [])
    .map((r) => r.content?.text?.trim())
    .filter((t): t is string => Boolean(t));
}
