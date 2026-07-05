import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { generateImage } from "../bedrock/images.js";
import { config } from "../shared/config.js";

const s3 = new S3Client({ region: config.region });

/**
 * Fan-out stage: generate an image matched to the draft's copy and store it in S3.
 */
export async function handler(event: {
  tenantId: string;
  draftId: string;
  imagePrompt: string;
  [k: string]: unknown;
}) {
  const png = await generateImage(event.imagePrompt);
  const s3Key = `${event.tenantId}/images/${event.draftId}.png`;

  await s3.send(
    new PutObjectCommand({ Bucket: config.assetsBucket, Key: s3Key, Body: png, ContentType: "image/png" }),
  );

  return {
    ...event,
    image: { s3Key, prompt: event.imagePrompt, model: config.imageModelId },
  };
}
