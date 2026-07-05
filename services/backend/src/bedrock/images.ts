import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { config } from "../shared/config.js";

const client = new BedrockRuntimeClient({ region: config.region });

/**
 * Generate a post image from a prompt via a Bedrock image model. Returns raw PNG bytes;
 * the caller stores them in S3. Consistent prompt scaffolding (brand palette, style) is what
 * keeps a month of posts looking like one brand — extend `scaffoldPrompt` with the brand kit.
 */
export async function generateImage(imagePrompt: string): Promise<Buffer> {
  const body = JSON.stringify({
    taskType: "TEXT_IMAGE",
    textToImageParams: { text: scaffoldPrompt(imagePrompt) },
    imageGenerationConfig: { numberOfImages: 1, height: 1024, width: 1024, cfgScale: 8 },
  });

  const res = await client.send(
    new InvokeModelCommand({ modelId: config.imageModelId, contentType: "application/json", accept: "application/json", body }),
  );

  const json = JSON.parse(new TextDecoder().decode(res.body));
  const base64 = json.images?.[0];
  if (!base64) throw new Error("Image model returned no image");
  return Buffer.from(base64, "base64");
}

/** Consistent style scaffolding so generated images stay on-brand. */
function scaffoldPrompt(prompt: string): string {
  return `${prompt}. Clean, modern, professional enterprise-tech aesthetic. Cohesive brand palette, no text overlays, high quality.`;
}
