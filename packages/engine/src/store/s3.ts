import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import type { ZodType } from "zod";
import type { Store } from "./types.js";

/**
 * S3-backed Store. SINGLE WRITER: only the engine writes these keys, so there
 * are no concurrent-write races on the JSON files. A missing key or invalid
 * body resolves to the fallback rather than throwing.
 */
export class S3Store implements Store {
  constructor(
    private readonly bucket: string,
    private readonly client: S3Client = new S3Client({}),
  ) {}

  async readJson<T>(key: string, schema: ZodType<T>, fallback: T): Promise<T> {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      const body = await res.Body?.transformToString();
      if (!body) return fallback;
      return schema.parse(JSON.parse(body));
    } catch {
      return fallback; // NoSuchKey (first run) or parse/validation failure
    }
  }

  async writeJson(key: string, value: unknown, cacheControl: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: JSON.stringify(value),
        ContentType: "application/json",
        CacheControl: cacheControl,
      }),
    );
  }
}
