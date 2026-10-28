import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { asc, ne } from "drizzle-orm";
import { db } from "@/db";
import { categories, products, series } from "@/db/schema";
import { getWorkById } from "@/lib/queries";
import { centsToInput } from "@/lib/utils";
import { storageStatus } from "@/lib/storage";
import { WorkForm, type WorkValues } from "../work-form";
import { PhotoManager } from "../photo-manager";

export const metadata: Metadata = { title: "Edit work" };

export default async function EditWorkPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const work = await getWorkById(id);
  if (!work) notFound();
  const { product: p, images, options } = work;
  const [cats, ser, others] = await Promise.all([
    db.select().from(categories).orderBy(asc(categories.position)),
    db.select().from(series).orderBy(asc(series.position)),
    db.select({ id: products.id, name: products.name }).from(products).where(ne(products.id, id)).orderBy(asc(products.name)),
  ]);
  const initial: WorkValues = {
    name: p.name,
    slug: p.slug,
    note: p.note,
    price: centsToInput(p.priceCents),
    categoryId: p.categoryId,
    seriesId: p.seriesId ?? "",
    originalProductId: p.originalProductId ?? "",
    year: p.year ? String(p.year) : "",
    medium: p.medium,
    sizeInches: p.sizeInches,
    stock: String(p.stock),
    saleStatus: p.saleStatus,
    personalizationEnabled: p.personalizationEnabled,
    personalizationMaxLength: String(p.personalizationMaxLength),
    showOnHome: p.showOnHome,
    featureOnHome: p.featureOnHome && p.showOnHome,
    options: options.map((o) => ({
      uid: o.id,
      id: o.id,
      name: o.name,
      required: o.required,
      values: o.values.map((v) => ({
        uid: v.id,
        id: v.id,
        label: v.label,
        priceDelta: v.priceDeltaCents === 0 ? "" : (v.priceDeltaCents / 100).toFixed(2),
        soldOut: v.soldOut,
        isDefault: v.isDefault,
      })),
    })),
  };
  const storage = storageStatus();
  return (
    <>
      <WorkForm
        id={p.id}
        published={p.published}
        initial={initial}
        categories={cats.map((c) => ({ id: c.id, name: c.name }))}
        series={ser.map((s) => ({ id: s.id, title: s.title }))}
        originals={others}
        photoCount={images.length}
        created={sp.created === "1"}
        isSample={p.isSample}
        slugForView={p.slug}
      />
      <PhotoManager
        productId={p.id}
        productName={p.name}
        images={images.map((i) => ({ id: i.id, url: i.url, alt: i.alt, width: i.width, height: i.height }))}
        storageOk={storage.ok}
        storageMessage={storage.message}
      />
    </>
  );
}
