import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import {
  categories,
  categorySlugHistory,
  optionValues,
  productImages,
  productOptions,
  products,
  series,
} from "../db/schema";

export type Availability =
  | "available"
  | "sold_out"
  | "sold"
  | "private_collection"
  | "not_for_sale";

type ProductRow = typeof products.$inferSelect;

export function availabilityOf(p: Pick<ProductRow, "saleStatus" | "stock" | "priceCents" | "published">): Availability {
  if (p.saleStatus === "sold") return "sold";
  if (p.saleStatus === "private_collection") return "private_collection";
  if (p.saleStatus === "not_for_sale") return "not_for_sale";
  if (p.stock <= 0) return "sold_out";
  if (p.priceCents == null) return "not_for_sale";
  return "available";
}

export function isBuyable(p: Pick<ProductRow, "saleStatus" | "stock" | "priceCents" | "published">) {
  return p.published && availabilityOf(p) === "available";
}

export type WorkCard = {
  id: string;
  slug: string;
  name: string;
  year: number | null;
  priceCents: number | null;
  fromPrice: boolean;
  availability: Availability;
  seriesId: string | null;
  seriesSlug: string | null;
  categoryId: string;
  coverUrl: string | null;
  coverAlt: string;
  coverWidth: number;
  coverHeight: number;
  /** Size text such as "30 × 40 in"; used to shape the placeholder until a photo exists. */
  sizeInches: string;
  featureOnHome: boolean;
  /** "About this work" text; only the work page and the home page use it. */
  description: string;
};

async function coversFor(ids: string[]) {
  if (ids.length === 0) return new Map<string, typeof productImages.$inferSelect>();
  const imgs = await db
    .select()
    .from(productImages)
    .where(inArray(productImages.productId, ids))
    .orderBy(asc(productImages.position));
  const m = new Map<string, typeof productImages.$inferSelect>();
  for (const i of imgs) if (!m.has(i.productId)) m.set(i.productId, i);
  return m;
}

async function toCards(rows: ProductRow[]): Promise<WorkCard[]> {
  const ids = rows.map((r) => r.id);
  const covers = await coversFor(ids);
  const seriesRows = await db.select().from(series);
  const seriesById = new Map(seriesRows.map((s) => [s.id, s]));
  let deltas = new Set<string>();
  if (ids.length) {
    const opts = await db
      .select({ productId: productOptions.productId, delta: optionValues.priceDeltaCents })
      .from(optionValues)
      .innerJoin(productOptions, eq(optionValues.optionId, productOptions.id))
      .where(inArray(productOptions.productId, ids));
    deltas = new Set(opts.filter((o) => o.delta !== 0).map((o) => o.productId));
  }
  return rows.map((r) => {
    const c = covers.get(r.id);
    return {
      id: r.id,
      slug: r.slug,
      name: r.name,
      year: r.year,
      priceCents: r.priceCents,
      fromPrice: deltas.has(r.id),
      availability: availabilityOf(r),
      seriesId: r.seriesId,
      seriesSlug: r.seriesId ? (seriesById.get(r.seriesId)?.slug ?? null) : null,
      categoryId: r.categoryId,
      coverUrl: c?.url ?? null,
      coverAlt: c?.alt ?? r.name,
      coverWidth: c?.width || 4,
      coverHeight: c?.height || 5,
      sizeInches: r.sizeInches,
      featureOnHome: r.featureOnHome,
      description: r.description,
    };
  });
}

export async function listPublishedWorks(filter?: { categoryId?: string; seriesId?: string }) {
  const conds = [eq(products.published, true)];
  if (filter?.categoryId) conds.push(eq(products.categoryId, filter.categoryId));
  if (filter?.seriesId) conds.push(eq(products.seriesId, filter.seriesId));
  const rows = await db
    .select()
    .from(products)
    .where(and(...conds))
    .orderBy(asc(products.position), asc(products.createdAt));
  return toCards(rows);
}

/** Published works the owner marked "show on home", in the owner's home order. */
export async function listHomeWorks() {
  const rows = await db
    .select()
    .from(products)
    .where(and(eq(products.published, true), eq(products.showOnHome, true)))
    .orderBy(asc(products.homePosition), asc(products.position), asc(products.createdAt));
  return toCards(rows);
}

/** Series that have at least one published work, in the owner's order. */
export async function visibleSeries() {
  const rows = await db.select().from(series).orderBy(asc(series.position), asc(series.title));
  const counts = await db
    .select({ seriesId: products.seriesId, n: sql<number>`count(*)::int` })
    .from(products)
    .where(eq(products.published, true))
    .groupBy(products.seriesId);
  const withWorks = new Set(counts.filter((c) => c.seriesId && c.n > 0).map((c) => c.seriesId));
  return rows.filter((s) => withWorks.has(s.id));
}

/** Categories with at least one published product are visible to shoppers. */
export async function visibleCategories() {
  const rows = await db.select().from(categories).orderBy(asc(categories.position), asc(categories.name));
  const counts = await db
    .select({ categoryId: products.categoryId, n: sql<number>`count(*)::int` })
    .from(products)
    .where(eq(products.published, true))
    .groupBy(products.categoryId);
  const withWorks = new Set(counts.filter((c) => c.n > 0).map((c) => c.categoryId));
  return rows.filter((c) => withWorks.has(c.id));
}

export async function findCategoryBySlug(slug: string) {
  const [c] = await db.select().from(categories).where(eq(categories.slug, slug));
  if (c) return { category: c, redirectedFrom: null as string | null };
  const [h] = await db.select().from(categorySlugHistory).where(eq(categorySlugHistory.oldSlug, slug));
  if (!h) return null;
  const [c2] = await db.select().from(categories).where(eq(categories.id, h.categoryId));
  return c2 ? { category: c2, redirectedFrom: slug } : null;
}

export async function getSeriesBySlug(slug: string) {
  const [s] = await db.select().from(series).where(eq(series.slug, slug));
  return s ?? null;
}

export type WorkDetail = {
  product: ProductRow;
  images: (typeof productImages.$inferSelect)[];
  options: {
    id: string;
    name: string;
    required: boolean;
    values: { id: string; label: string; priceDeltaCents: number; soldOut: boolean; isDefault: boolean }[];
  }[];
  category: typeof categories.$inferSelect;
  series: typeof series.$inferSelect | null;
  original: { slug: string; name: string } | null;
  prints: WorkCard[];
};

export async function getWorkBySlug(slug: string, opts: { includeDraft: boolean }): Promise<WorkDetail | null> {
  const [product] = await db.select().from(products).where(eq(products.slug, slug));
  if (!product) return null;
  if (!product.published && !opts.includeDraft) return null;
  return loadDetail(product);
}

export async function getWorkById(id: string): Promise<WorkDetail | null> {
  const [product] = await db.select().from(products).where(eq(products.id, id));
  return product ? loadDetail(product) : null;
}

async function loadDetail(product: ProductRow): Promise<WorkDetail> {
  const images = await db
    .select()
    .from(productImages)
    .where(eq(productImages.productId, product.id))
    .orderBy(asc(productImages.position));
  const opts = await db
    .select()
    .from(productOptions)
    .where(eq(productOptions.productId, product.id))
    .orderBy(asc(productOptions.position));
  const vals = opts.length
    ? await db
        .select()
        .from(optionValues)
        .where(
          inArray(
            optionValues.optionId,
            opts.map((o) => o.id),
          ),
        )
        .orderBy(asc(optionValues.position))
    : [];
  const [category] = await db.select().from(categories).where(eq(categories.id, product.categoryId));
  const [ser] = product.seriesId ? await db.select().from(series).where(eq(series.id, product.seriesId)) : [null];
  let original: { slug: string; name: string } | null = null;
  if (product.originalProductId) {
    const [o] = await db.select().from(products).where(eq(products.id, product.originalProductId));
    if (o && o.published) original = { slug: o.slug, name: o.name };
  }
  const printRows = await db
    .select()
    .from(products)
    .where(and(eq(products.originalProductId, product.id), eq(products.published, true)))
    .orderBy(asc(products.position));
  return {
    product,
    images,
    options: opts.map((o) => ({
      id: o.id,
      name: o.name,
      required: o.required,
      values: vals
        .filter((v) => v.optionId === o.id)
        .map((v) => ({
          id: v.id,
          label: v.label,
          priceDeltaCents: v.priceDeltaCents,
          soldOut: v.soldOut,
          isDefault: v.isDefault,
        })),
    })),
    category,
    series: ser ?? null,
    original,
    prints: await toCards(printRows),
  };
}

/** Previous and next published works: within the series when there is one, otherwise through all works. */
export async function getNeighbours(p: { id: string; seriesId: string | null }) {
  const all = await listPublishedWorks(p.seriesId ? { seriesId: p.seriesId } : undefined);
  const i = all.findIndex((w) => w.id === p.id);
  if (i === -1) return { prev: null, next: null };
  return { prev: all[i - 1] ?? null, next: all[i + 1] ?? null };
}
