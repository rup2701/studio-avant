import fs from "node:fs/promises";
import path from "node:path";
import { isDeployed, LOCAL_DIR } from "@/lib/storage";

const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

/** Serves locally stored development uploads. Never used on a deployed store. */
export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  if (isDeployed()) return new Response("Not found", { status: 404 });
  const { path: parts } = await ctx.params;
  const file = path.join(LOCAL_DIR, ...parts);
  const type = TYPES[path.extname(file).toLowerCase()];
  if (!file.startsWith(LOCAL_DIR + path.sep) || !type) return new Response("Not found", { status: 404 });
  try {
    const data = await fs.readFile(file);
    return new Response(new Uint8Array(data), {
      headers: { "Content-Type": type, "Cache-Control": "public, max-age=31536000, immutable" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
