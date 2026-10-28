import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { isOwner } from "@/lib/auth";
import { getStorage, StorageNotConfiguredError } from "@/lib/storage";
import { ALLOWED_TYPES, ImageError, MAX_BYTES, SIZE_MESSAGE, TYPE_MESSAGE, processImage } from "@/lib/images";
import { setSetting } from "@/lib/settings";

/** Upload the optional image beside the home page words block. */
export async function POST(req: Request) {
  if (!(await isOwner())) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  let storage;
  try {
    storage = getStorage();
  } catch (e) {
    if (e instanceof StorageNotConfiguredError) return NextResponse.json({ error: e.message }, { status: 503 });
    throw e;
  }
  const form = await req.formData().catch(() => null);
  const f = form?.get("file");
  if (!(f instanceof File)) return NextResponse.json({ error: "No file was received." }, { status: 400 });
  if (f.size > MAX_BYTES) return NextResponse.json({ error: `${f.name}: ${SIZE_MESSAGE}` }, { status: 413 });
  if (!ALLOWED_TYPES.includes(f.type)) return NextResponse.json({ error: `${f.name}: ${TYPE_MESSAGE}` }, { status: 415 });
  try {
    const img = await processImage(Buffer.from(await f.arrayBuffer()), f.type);
    const url = await storage.put(`home/${crypto.randomUUID()}.${img.ext}`, img.web, img.contentType);
    await setSetting("wordsImageUrl", url);
    return NextResponse.json({ url, warning: img.soft ? `This photo is only ${img.originalWidth} pixels wide and may look soft.` : null });
  } catch (e) {
    if (e instanceof ImageError) return NextResponse.json({ error: `${f.name}: ${e.message}` }, { status: 415 });
    return NextResponse.json({ error: "The upload failed. Please try again." }, { status: 500 });
  }
}
