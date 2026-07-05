import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { config } from "../shared/config.js";

const client = new BedrockRuntimeClient({ region: config.region });

/** Embed a single text into a dense vector via Amazon Titan Text Embeddings v2 (1024-dim). */
export async function embed(text: string): Promise<number[]> {
  const res = await client.send(
    new InvokeModelCommand({
      modelId: config.embedModelId,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({ inputText: text.slice(0, 8000) }),
    }),
  );
  const json = JSON.parse(new TextDecoder().decode(res.body));
  return json.embedding as number[];
}

/** Cosine similarity between two equal-length vectors. */
export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}
