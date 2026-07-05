import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { config } from "../shared/config.js";

const client = new BedrockRuntimeClient({ region: config.region });

/**
 * Generate a post image from a prompt via a Bedrock image model. Returns raw PNG bytes;
 * the caller stores them in S3. The request/response shape differs by provider, so we branch
 * on the model id — Amazon (Titan/Nova Canvas) vs Stability. Consistent prompt scaffolding
 * (brand palette, style) is what keeps a month of posts looking like one brand.
 */
export async function generateImage(imagePrompt: string): Promise<Buffer> {
  const modelId = config.imageModelId;
  const prompt = scaffoldPrompt(imagePrompt);
  const body = modelId.includes("stability")
    ? JSON.stringify({ prompt, mode: "text-to-image", aspect_ratio: "1:1", output_format: "png" })
    : JSON.stringify({
        taskType: "TEXT_IMAGE",
        textToImageParams: { text: prompt },
        imageGenerationConfig: { numberOfImages: 1, height: 1024, width: 1024, cfgScale: 8 },
      });

  const res = await client.send(
    new InvokeModelCommand({ modelId, contentType: "application/json", accept: "application/json", body }),
  );

  const json = JSON.parse(new TextDecoder().decode(res.body));
  // Amazon returns { images: [b64] }; Stability newer { images: [b64] }, SDXL { artifacts: [{ base64 }] }.
  const base64: string | undefined = json.images?.[0] ?? json.artifacts?.[0]?.base64;
  if (!base64) throw new Error("Image model returned no image");
  return Buffer.from(base64, "base64");
}

/** Consistent style scaffolding so generated images stay on-brand. */
function scaffoldPrompt(prompt: string): string {
  return `${prompt}. Clean, modern, professional enterprise-tech aesthetic. Cohesive brand palette (deep rose accent on ink/near-white), no text overlays, high quality.`;
}
