import fs from "node:fs/promises";
import path from "node:path";

/** Small storage adapter: local disk for development, Vercel Blob for deployed stores. */
export interface StorageAdapter {
  put(key: string, data: Buffer, contentType: string): Promise<string>;
  remove(url: string): Promise<void>;
}

export class StorageNotConfiguredError extends Error {
  constructor() {
    super(
      "Photo storage is not set up for this deployed store. Connect Vercel Blob to the project (it adds BLOB_READ_WRITE_TOKEN) and redeploy, then try again.",
    );
  }
}

export function isDeployed() {
  return process.env.VERCEL === "1" || process.env.STORE_DEPLOYED === "1";
}

export function storageStatus(): { ok: boolean; kind: "local" | "blob" | "missing"; message: string } {
  if (isDeployed()) {
    if (process.env.BLOB_READ_WRITE_TOKEN)
      return { ok: true, kind: "blob", message: "Photos are stored in object storage (Vercel Blob)." };
    return { ok: false, kind: "missing", message: new StorageNotConfiguredError().message };
  }
  return { ok: true, kind: "local", message: "Development mode: photos are stored on this computer's disk." };
}

export const LOCAL_DIR = path.join(process.cwd(), ".uploads");

const localAdapter: StorageAdapter = {
  async put(key, data) {
    const file = path.join(LOCAL_DIR, key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, data);
    return `/uploads/${key}`;
  },
  async remove(url) {
    if (!url.startsWith("/uploads/")) return;
    const file = path.join(LOCAL_DIR, url.slice("/uploads/".length));
    if (!file.startsWith(LOCAL_DIR)) return;
    await fs.rm(file, { force: true });
  },
};

const blobAdapter: StorageAdapter = {
  async put(key, data, contentType) {
    const { put } = await import("@vercel/blob");
    const res = await put(key, data, { access: "public", contentType, addRandomSuffix: true });
    return res.url;
  },
  async remove(url) {
    const { del } = await import("@vercel/blob");
    await del(url);
  },
};

export function getStorage(): StorageAdapter {
  if (isDeployed()) {
    if (!process.env.BLOB_READ_WRITE_TOKEN) throw new StorageNotConfiguredError();
    return blobAdapter;
  }
  return localAdapter;
}
