import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Draft } from "@alphabeacon/shared";
import { config } from "./config.js";

const s3 = new S3Client({ region: config.region });

/**
 * The assets bucket is private (BlockPublicAccess). The admin can't load an object by its bare
 * key, so the API hands back a short-lived presigned GET URL for each draft's image. Keys that
 * already look like a URL (the local-run fixture uses `/images/x.svg`) are left untouched.
 */
export async function presignImageUrl(s3Key: string): Promise<string> {
  if (/^(https?:)?\//.test(s3Key)) return s3Key; // already a URL / site-relative path
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: config.assetsBucket, Key: s3Key }), {
    expiresIn: 3600,
  });
}

/** Attach a presigned `image.url` to every draft that has an image. */
export async function withPresignedImages(drafts: Draft[]): Promise<Draft[]> {
  return Promise.all(
    drafts.map(async (d) =>
      d.image?.s3Key ? { ...d, image: { ...d.image, url: await presignImageUrl(d.image.s3Key) } } : d,
    ),
  );
}
