import fs from 'node:fs/promises';
import path from 'node:path';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { env } from '../config/env';

export interface StoredFile {
  key: string;
  url: string;
  size: number;
  contentType: string;
}

export interface StorageDriver {
  put(key: string, body: Buffer, contentType: string): Promise<StoredFile>;
  delete(key: string): Promise<void>;
}

/** Rejects keys that could escape the storage root. */
function assertSafeKey(key: string) {
  if (!/^[a-zA-Z0-9/_.-]+$/.test(key) || key.includes('..') || key.startsWith('/')) {
    throw new Error(`Unsafe storage key: ${key}`);
  }
}

class LocalStorage implements StorageDriver {
  private readonly root = path.resolve(process.cwd(), env.STORAGE_LOCAL_DIR);

  async put(key: string, body: Buffer, contentType: string): Promise<StoredFile> {
    assertSafeKey(key);
    const target = path.join(this.root, key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, body);
    return {
      key,
      url: `${env.APP_URL}/uploads/${key}`,
      size: body.length,
      contentType,
    };
  }

  async delete(key: string) {
    assertSafeKey(key);
    await fs.rm(path.join(this.root, key), { force: true });
  }
}

class S3Storage implements StorageDriver {
  private readonly client = new S3Client({ region: env.AWS_REGION });
  private readonly bucket = env.S3_BUCKET!;

  async put(key: string, body: Buffer, contentType: string): Promise<StoredFile> {
    assertSafeKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ServerSideEncryption: 'AES256',
      }),
    );
    return {
      key,
      url: `https://${this.bucket}.s3.${env.AWS_REGION}.amazonaws.com/${key}`,
      size: body.length,
      contentType,
    };
  }

  async delete(key: string) {
    assertSafeKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

export const storage: StorageDriver = env.STORAGE_DRIVER === 's3' ? new S3Storage() : new LocalStorage();

const SIGNATURES: {
  mime: string;
  ext: string;
  test: (b: Buffer) => boolean;
}[] = [
  {
    mime: 'image/png',
    ext: '.png',
    test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mime: 'image/jpeg',
    ext: '.jpg',
    test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: 'image/webp',
    ext: '.webp',
    test: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP',
  },
  {
    mime: 'application/pdf',
    ext: '.pdf',
    test: (b) => b.subarray(0, 5).toString() === '%PDF-',
  },
];

/** Detects the real file type from its magic bytes rather than trusting the client-supplied mimetype. */
export function sniffFileType(buffer: Buffer): { mime: string; ext: string } | null {
  const match = SIGNATURES.find((s) => s.test(buffer));
  return match ? { mime: match.mime, ext: match.ext } : null;
}
