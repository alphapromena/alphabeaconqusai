import { randomUUID } from "node:crypto";
import type { KnowledgeChunk } from "@alphabeacon/shared";
import { putKnowledgeChunks } from "../shared/dynamo.js";
import { embed } from "./embeddings.js";

/** Split text into ~maxChars chunks on paragraph, then sentence, boundaries. */
export function chunkText(text: string, maxChars = 900): string[] {
  const paras = text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let cur = "";
  const push = () => {
    if (cur.trim()) chunks.push(cur.trim());
    cur = "";
  };
  for (const p of paras) {
    if ((cur + " " + p).length <= maxChars) {
      cur += " " + p;
      continue;
    }
    push();
    if (p.length <= maxChars) {
      cur = p;
    } else {
      // Paragraph itself too long → split by sentence.
      let s = "";
      for (const sent of p.split(/(?<=[.!?])\s+/)) {
        if ((s + " " + sent).length > maxChars) {
          if (s.trim()) chunks.push(s.trim());
          s = sent;
        } else s += " " + sent;
      }
      if (s.trim()) chunks.push(s.trim());
    }
  }
  push();
  return chunks;
}

/** Chunk → embed → store a document in the tenant's RAG store. Returns the chunk count. */
export async function ingestDocument(
  tenantId: string,
  title: string,
  text: string,
  docId: string = randomUUID().slice(0, 8),
): Promise<number> {
  const parts = chunkText(text);
  const chunks: KnowledgeChunk[] = [];
  for (let i = 0; i < parts.length; i++) {
    const vector = await embed(parts[i]);
    chunks.push({ tenantId, docId, chunkIdx: i, title, text: parts[i], vector });
  }
  await putKnowledgeChunks(chunks);
  return chunks.length;
}
