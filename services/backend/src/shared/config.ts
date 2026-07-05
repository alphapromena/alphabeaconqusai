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
  imageModelId: process.env.BEDROCK_IMAGE_MODEL ?? "amazon.titan-image-generator-v2:0",

  /** Bedrock Knowledge Base id for RAG grounding (set after the KB is provisioned). */
  knowledgeBaseId: process.env.BEDROCK_KB_ID ?? "",
} as const;
