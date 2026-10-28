import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { categories, products, series } from "@/db/schema";
import { WorkForm, type WorkValues } from "../work-form";

export const metadata: Metadata = { title: "New work" };

export default async function NewWorkPage() {
  const [cats, ser, allWorks] = await Promise.all([
    db.select().from(categories).orderBy(asc(categories.position)),
    db.select().from(series).orderBy(asc(series.position)),
    db.select({ id: products.id, name: products.name }).from(products).orderBy(asc(products.name)),
  ]);
  const initial: WorkValues = {
    name: "",
    slug: "",
    note: "",
    description: "",
    price: "",
    categoryId: cats[0]?.id ?? "",
    seriesId: "",
    originalProductId: "",
    year: String(new Date().getFullYear()),
    medium: "",
    sizeInches: "",
    stock: "1",
    saleStatus: "available",
    personalizationEnabled: false,
    personalizationMaxLength: "40",
    showOnHome: false,
    featureOnHome: false,
    options: [],
  };
  return (
    <WorkForm
      id={null}
      published={false}
      initial={initial}
      categories={cats.map((c) => ({ id: c.id, name: c.name }))}
      series={ser.map((s) => ({ id: s.id, title: s.title }))}
      originals={allWorks}
      photoCount={0}
      created={false}
      isSample={false}
      slugForView={null}
    />
  );
}
