import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export interface StoredObject {
  key: string;
  sha256: string;
  size: number;
  mediaType: string;
}

export interface ObjectStorage {
  putImmutable(key: string, contents: Uint8Array, mediaType: string, expectedSha256?: string): Promise<StoredObject>;
  get(key: string): Promise<Uint8Array>;
  head(key: string): Promise<StoredObject | null>;
  createSignedGetUrl(key: string, expiresInSeconds: number): Promise<string>;
  createSignedPutUrl(key: string, mediaType: string, expiresInSeconds: number): Promise<string>;
}

const keyPattern = /^[a-zA-Z0-9][a-zA-Z0-9._/-]{0,1023}$/;

export function assertObjectKey(key: string): string {
  if (!keyPattern.test(key) || key.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("Object key is invalid or contains a traversal segment.");
  }
  return key;
}

function hash(contents: Uint8Array) {
  return createHash("sha256").update(contents).digest("hex");
}

export class FilesystemObjectStorage implements ObjectStorage {
  readonly #root: string;
  constructor(root: string) {
    if (!path.isAbsolute(root)) throw new Error("STORAGE_ROOT must be an absolute path.");
    this.#root = path.resolve(root);
  }

  #path(key: string) {
    const resolved = path.resolve(this.#root, ...assertObjectKey(key).split("/"));
    if (!resolved.startsWith(`${this.#root}${path.sep}`)) throw new Error("Object key escaped storage root.");
    return resolved;
  }

  async putImmutable(key: string, contents: Uint8Array, mediaType: string, expectedSha256?: string): Promise<StoredObject> {
    const sha256 = hash(contents);
    if (expectedSha256 && expectedSha256 !== sha256) throw new Error("Object SHA-256 does not match the declared value.");
    const filePath = this.#path(key);
    const metadataPath = `${filePath}.metadata.json`;
    const existing = await this.head(key);
    if (existing) {
      if (existing.sha256 !== sha256 || existing.mediaType !== mediaType) throw new Error("Immutable object key already exists with different content.");
      return existing;
    }
    await mkdir(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.tmp-${randomUUID()}`;
    const metadataTemporary = `${metadataPath}.tmp-${randomUUID()}`;
    await writeFile(temporary, contents, { flag: "wx" });
    await writeFile(metadataTemporary, `${JSON.stringify({ sha256, size: contents.byteLength, mediaType })}\n`, { flag: "wx" });
    await rename(temporary, filePath);
    await rename(metadataTemporary, metadataPath);
    return { key, sha256, size: contents.byteLength, mediaType };
  }

  async get(key: string) { return new Uint8Array(await readFile(this.#path(key))); }

  async head(key: string): Promise<StoredObject | null> {
    const filePath = this.#path(key);
    try {
      await access(filePath);
      const metadata = JSON.parse(await readFile(`${filePath}.metadata.json`, "utf8")) as Omit<StoredObject, "key">;
      const details = await stat(filePath);
      if (details.size !== metadata.size) throw new Error("Stored object size no longer matches metadata.");
      return { key, ...metadata };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async createSignedGetUrl(key: string) {
    assertObjectKey(key);
    return `file://${this.#path(key)}`;
  }

  async createSignedPutUrl(): Promise<string> {
    throw new Error("The filesystem driver accepts uploads through the API, not browser-signed PUT URLs.");
  }
}

export interface S3ObjectStorageOptions {
  client: S3Client;
  bucket: string;
}

export class S3ObjectStorage implements ObjectStorage {
  constructor(private readonly options: S3ObjectStorageOptions) {}

  async putImmutable(key: string, contents: Uint8Array, mediaType: string, expectedSha256?: string): Promise<StoredObject> {
    assertObjectKey(key);
    const sha256 = hash(contents);
    if (expectedSha256 && expectedSha256 !== sha256) throw new Error("Object SHA-256 does not match the declared value.");
    const existing = await this.head(key);
    if (existing) {
      if (existing.sha256 !== sha256 || existing.mediaType !== mediaType) throw new Error("Immutable object key already exists with different content.");
      return existing;
    }
    await this.options.client.send(new PutObjectCommand({ Bucket: this.options.bucket, Key: key, Body: contents, ContentType: mediaType, Metadata: { sha256 } }));
    return { key, sha256, size: contents.byteLength, mediaType };
  }

  async get(key: string) {
    assertObjectKey(key);
    const response = await this.options.client.send(new GetObjectCommand({ Bucket: this.options.bucket, Key: key }));
    if (!response.Body) throw new Error("S3 returned an empty body.");
    return new Uint8Array(await response.Body.transformToByteArray());
  }

  async head(key: string): Promise<StoredObject | null> {
    assertObjectKey(key);
    try {
      const response = await this.options.client.send(new HeadObjectCommand({ Bucket: this.options.bucket, Key: key }));
      return { key, sha256: response.Metadata?.sha256 ?? "", size: response.ContentLength ?? 0, mediaType: response.ContentType ?? "application/octet-stream" };
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404) return null;
      throw error;
    }
  }

  createSignedGetUrl(key: string, expiresInSeconds: number) {
    assertObjectKey(key);
    return getSignedUrl(this.options.client, new GetObjectCommand({ Bucket: this.options.bucket, Key: key }), { expiresIn: expiresInSeconds });
  }

  createSignedPutUrl(key: string, mediaType: string, expiresInSeconds: number) {
    assertObjectKey(key);
    return getSignedUrl(this.options.client, new PutObjectCommand({ Bucket: this.options.bucket, Key: key, ContentType: mediaType }), { expiresIn: expiresInSeconds });
  }
}

export { S3Client };
