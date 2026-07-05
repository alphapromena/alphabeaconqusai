/** Runtime configuration, sourced from Lambda environment variables. */
export const config = {
  region: process.env.AWS_REGION ?? "us-east-1",
  tableName: process.env.TABLE_NAME ?? "",
  assetsBucket: process.env.ASSETS_BUCKET ?? "",
  linkedInSecretArn: process.env.LINKEDIN_SECRET_ARN ?? "",
  stateMachineArn: process.env.STATE_MACHINE_ARN ?? "",

  /**
   * Bedrock model ids. Override via env once you have enabled model access in the Bedrock
   * console (Model access → enable the text + image models you want). Prefer the latest Claude
   * inference profile for text (e.g. a current `*.anthropic.claude-*` id in your region).
   */
  // Default text model: Amazon Nova Pro — cheap, no Anthropic use-case gate, good quality.
  // Swap to a Claude inference profile (e.g. "us.anthropic.claude-sonnet-4-6") for premium
  // grounding once the Anthropic use-case form is submitted. Newer models on Bedrock require
  // the cross-region inference-profile id (the `us.` prefix) for on-demand throughput.
  textModelId: process.env.BEDROCK_TEXT_MODEL ?? "us.amazon.nova-pro-v1:0",
  // Stability Stable Image Core (Active, ~$0.04/image). Swap to stability.stable-image-ultra-v1:1
  // for premium. NOTE: us-east-1 offers NO active text->image model (Nova Canvas is Legacy +
  // access-blocked; Stability there is edit-only). The Stability base generators are served from
  // us-west-2, so images are generated there (imageRegion) while the rest of the stack stays in
  // us-east-1 — Bedrock invocation is independent of the S3 bucket's region.
  imageModelId: process.env.BEDROCK_IMAGE_MODEL ?? "stability.stable-image-core-v1:1",
  imageRegion: process.env.BEDROCK_IMAGE_REGION ?? "us-west-2",
  // Embeddings for the lightweight RAG store (chunks + vectors in DynamoDB, cosine search in
  // the Lambda) — avoids the ~$700/mo idle cost of OpenSearch Serverless at MVP scale.
  embedModelId: process.env.BEDROCK_EMBED_MODEL ?? "amazon.titan-embed-text-v2:0",

  /** Bedrock Knowledge Base id for RAG grounding (set after the KB is provisioned). */
  knowledgeBaseId: process.env.BEDROCK_KB_ID ?? "",
} as const;
