import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { count, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { productImages, products } from "@/db/schema";
import { isOwner } from "@/lib/auth";
import { getStorage, StorageNotConfiguredError } from "@/lib/storage";
import { ImageError, MAX_BYTES, MAX_PHOTOS, SIZE_MESSAGE, processImage, TYPE_MESSAGE, ALLOWED_TYPES } from "@/lib/images";

export const maxDuration = 60;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isOwner())) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Work not found." }, { status: 404 });
  const [work] = await db.select().from(products).where(eq(products.id, id));
  if (!work) return NextResponse.json({ error: "Work not found." }, { status: 404 });

  let storage;
  try {
    storage = getStorage();
  } catch (e) {
    if (e instanceof StorageNotConfiguredError) return NextResponse.json({ error: e.message }, { status: 503 });
    throw e;
  }

  const [{ n }] = await db.select({ n: count() }).from(productImages).where(eq(productImages.productId, id));
  if (n >= MAX_PHOTOS)
    return NextResponse.json({ error: `A work can have ${MAX_PHOTOS} photos at most. Remove one before adding another.` }, { status: 400 });

  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json({ error: "The upload could not be read. Please try again." }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: "No file was received." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: `${file.name}: ${SIZE_MESSAGE}` }, { status: 413 });
  if (!ALLOWED_TYPES.includes(file.type)) return NextResponse.json({ error: `${file.name}: ${TYPE_MESSAGE}` }, { status: 415 });

  try {
    const img = await processImage(Buffer.from(await file.arrayBuffer()), file.type);
    const base = `works/${id}/${crypto.randomUUID()}`;
    let originalUrl: string;
    let url: string;
    if (img.resized) {
      originalUrl = await storage.put(`${base}-original.${img.ext}`, img.original, img.contentType);
      url = await storage.put(`${base}.${img.ext}`, img.web, img.contentType);
    } else {
      url = await storage.put(`${base}.${img.ext}`, img.web, img.contentType);
      originalUrl = url;
    }
    const [{ m }] = await db
      .select({ m: sql<number>`coalesce(max(${productImages.position}), -1)::int` })
      .from(productImages)
      .where(eq(productImages.productId, id));
    const [row] = await db
      .insert(productImages)
      .values({ productId: id, url, originalUrl, alt: work.name, position: m + 1, width: img.width, height: img.height })
      .returning();
    const warnings: string[] = [];
    if (img.soft) warnings.push(`This photo is only ${img.originalWidth} pixels wide, so it may look soft on large screens.`);
    if (img.resized) warnings.push("This photo was resized for the web. The original is kept.");
    return NextResponse.json({ image: row, warnings });
  } catch (e) {
    if (e instanceof ImageError) return NextResponse.json({ error: `${file.name}: ${e.message}` }, { status: 415 });
    console.error("[upload]", e);
    return NextResponse.json({ error: "The upload failed. Please try again." }, { status: 500 });
  }
}
