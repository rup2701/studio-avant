import "dotenv/config";
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { db } from "../src/db";
import { categories, optionValues, orderItems, orders, productOptions, products } from "../src/db/schema";

export const OWNER_EMAIL = process.env.OWNER_EMAIL!;
export const OWNER_PASSWORD = process.env.E2E_OWNER_PASSWORD!;

let counter = 0;
export const uniq = (p = "e2e") => `${p}-${Date.now().toString(36)}${(counter++).toString(36)}`;

export async function categoryId(slug: "original-paintings" | "prints") {
  const [c] = await db.select().from(categories).where(eq(categories.slug, slug));
  return c.id;
}

export type OptionSpec = {
  name: string;
  required?: boolean;
  values: { label: string; delta?: number; soldOut?: boolean; isDefault?: boolean }[];
};

export async function createWork(opts: {
  name?: string;
  priceCents?: number | null;
  stock?: number;
  published?: boolean;
  saleStatus?: string;
  category?: "original-paintings" | "prints";
  options?: OptionSpec[];
  personalization?: { maxLength: number };
}) {
  const name = opts.name ?? `E2E Work ${uniq("w")}`;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const [p] = await db
    .insert(products)
    .values({
      slug,
      name,
      note: "A test work.",
      priceCents: opts.priceCents === undefined ? 10000 : opts.priceCents,
      categoryId: await categoryId(opts.category ?? "original-paintings"),
      stock: opts.stock ?? 5,
      published: opts.published ?? true,
      saleStatus: opts.saleStatus ?? "available",
      year: 2025,
      medium: "Oil",
      sizeInches: "10 × 10 in",
      position: 9999,
      personalizationEnabled: !!opts.personalization,
      personalizationMaxLength: opts.personalization?.maxLength ?? 40,
    })
    .returning();
  const optionIds: Record<string, { id: string; values: Record<string, string> }> = {};
  for (const [oi, o] of (opts.options ?? []).entries()) {
    const [row] = await db.insert(productOptions).values({ productId: p.id, name: o.name, required: o.required ?? false, position: oi }).returning();
    const vals = await db
      .insert(optionValues)
      .values(o.values.map((v, vi) => ({ optionId: row.id, label: v.label, priceDeltaCents: v.delta ?? 0, soldOut: v.soldOut ?? false, isDefault: v.isDefault ?? false, position: vi })))
      .returning();
    optionIds[o.name] = { id: row.id, values: Object.fromEntries(vals.map((v) => [v.label, v.id])) };
  }
  return { id: p.id, slug, name, optionIds };
}

export async function deleteE2EWorks() {
  const rows = await db.select().from(products);
  for (const r of rows) if (r.name.startsWith("E2E ")) await db.delete(products).where(eq(products.id, r.id));
}

export async function getWorkBySlugDb(slug: string) {
  const [p] = await db.select().from(products).where(eq(products.slug, slug));
  return p;
}

export async function ordersByEmail(email: string) {
  return db.select().from(orders).where(eq(orders.email, email));
}
export async function orderItemsFor(orderId: string) {
  return db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
}

export async function image(width: number, height: number, format: "jpeg" | "png" | "webp" = "jpeg") {
  const base = sharp({ create: { width, height, channels: 3, background: { r: 120 + (width % 100), g: 130, b: 140 } } });
  const buffer = format === "jpeg" ? await base.jpeg().toBuffer() : format === "png" ? await base.png().toBuffer() : await base.webp().toBuffer();
  return { name: `test-${width}x${height}.${format === "jpeg" ? "jpg" : format}`, mimeType: `image/${format}`, buffer };
}

export async function adminLogin(page: Page, headers?: Record<string, string>) {
  if (headers) await page.setExtraHTTPHeaders(headers);
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(OWNER_EMAIL);
  await page.getByLabel("Password").fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByTestId("works-heading")).toBeVisible();
}

export async function addToCart(page: Page, slug: string, opts?: { qty?: number }) {
  await page.goto(`/work/${slug}`);
  if (opts?.qty) await page.getByLabel("Quantity").fill(String(opts.qty));
  await page.getByTestId("add-to-cart").click();
  await expect(page.getByTestId("purchase-message")).toContainText("Added to your cart");
}

export const CUSTOMER = {
  name: "Ada Shopper",
  email: "ada@example.com",
  address: "12 Harbour Road",
  city: "Portland",
  region: "Maine",
  postalCode: "04101",
  country: "United States",
};

export async function fillCheckout(page: Page, c: Partial<typeof CUSTOMER> = {}) {
  const v = { ...CUSTOMER, ...c };
  await page.getByLabel("Full name").fill(v.name);
  await page.getByLabel("Email address").fill(v.email);
  await page.getByLabel("Street address").fill(v.address);
  await page.getByLabel("City", { exact: true }).fill(v.city);
  await page.getByLabel("State, province or region").fill(v.region);
  await page.getByLabel("Postal code").fill(v.postalCode);
  await page.getByLabel("Country").selectOption(v.country);
}

export function checkoutBody(token: string, lines: { key?: string; productId: string; valueIds?: string[]; quantity?: number; personalization?: string | null; expectedUnitPriceCents?: number }[], customer = CUSTOMER) {
  return {
    token,
    customer,
    lines: lines.map((l, i) => ({ key: l.key ?? `k${i}`, productId: l.productId, valueIds: l.valueIds ?? [], personalization: l.personalization ?? null, quantity: l.quantity ?? 1, expectedUnitPriceCents: l.expectedUnitPriceCents })),
  };
}

export async function postCheckout(request: APIRequestContext, body: unknown) {
  const res = await request.post("/api/checkout", { data: body });
  return { status: res.status(), json: await res.json() };
}
