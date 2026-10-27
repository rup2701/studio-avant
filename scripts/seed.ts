import "dotenv/config";
import { count } from "drizzle-orm";
import { db, pool } from "../src/db";
import {
  categories,
  exhibitions,
  optionValues,
  productOptions,
  products,
  series,
} from "../src/db/schema";
import { slugify } from "../src/lib/utils";

/**
 * Seeds the sample catalog (fictional work by a fictional painter). Photos are never invented:
 * every work starts without images and shows a neutral placeholder.
 *
 * E-024: refuses to run on a store that already has products unless --confirm is passed.
 */
async function main() {
  const confirm = process.argv.includes("--confirm") || process.env.SEED_CONFIRM === "yes";
  const [{ n }] = await db.select({ n: count() }).from(products);
  const [{ c }] = await db.select({ c: count() }).from(categories);
  if ((n > 0 || c > 0) && !confirm) {
    console.error(
      `Refusing to seed: this store already has ${n} product(s) and ${c} categor${c === 1 ? "y" : "ies"}.\n` +
        "Seeding wipes the catalog (past orders survive). Re-run with --confirm if that is what you want:\n" +
        "  npm run seed -- --confirm",
    );
    process.exitCode = 1;
    await pool.end();
    return;
  }

  // Wipe the catalog only (orders keep their own snapshot; sign-ups and inquiries are kept).
  await db.delete(products);
  await db.delete(series);
  await db.delete(categories);
  await db.delete(exhibitions);

  const [cOrig, cPrints] = await db
    .insert(categories)
    .values([
      { name: "Original paintings", slug: "original-paintings", position: 0 },
      { name: "Prints", slug: "prints", position: 1 },
    ])
    .returning();

  const [sLow, sOrchard] = await db
    .insert(series)
    .values([
      {
        title: "Low Tide",
        slug: "low-tide",
        position: 0,
        text: "Paintings made on the flats at the turn of the tide, when the water has gone and the light has not yet decided what to do. Sample text for a fictional series.",
      },
      {
        title: "Orchard Light",
        slug: "orchard-light",
        position: 1,
        text: "A slow study of one old orchard through a single autumn: late sun, long shadow, fruit left on the ground. Sample text for a fictional series.",
      },
    ])
    .returning();

  type Orig = {
    name: string;
    year: number;
    medium: string;
    size: string;
    series?: string;
    status: "available" | "sold" | "private_collection" | "not_for_sale";
    priceCents: number;
    note: string;
  };
  const originals: Orig[] = [
    { name: "Low Tide, Morning", year: 2024, medium: "Oil on linen", size: "30 × 40 in", series: sLow.id, status: "available", priceCents: 240000, note: "The first light on wet sand, painted over three weeks. A sample work." },
    { name: "Salt Flats at Dusk", year: 2023, medium: "Oil on canvas", size: "24 × 36 in", series: sLow.id, status: "sold", priceCents: 180000, note: "Sold. A sample work." },
    { name: "Orchard Light I", year: 2025, medium: "Oil on linen", size: "36 × 48 in", series: sOrchard.id, status: "available", priceCents: 320000, note: "Late sun through bare branches. A sample work." },
    { name: "Orchard Light II", year: 2025, medium: "Oil on linen", size: "24 × 30 in", series: sOrchard.id, status: "sold", priceCents: 160000, note: "Sold. A sample work." },
    { name: "Windfall", year: 2024, medium: "Oil on panel", size: "12 × 16 in", series: sOrchard.id, status: "sold", priceCents: 95000, note: "Sold. A sample work." },
    { name: "Tide Line", year: 2025, medium: "Oil on panel", size: "8 × 10 in", series: sLow.id, status: "available", priceCents: 40000, note: "A small study of the line the water leaves behind. A sample work." },
    { name: "Grey Room", year: 2022, medium: "Acrylic on canvas", size: "30 × 30 in", status: "private_collection", priceCents: 280000, note: "In a private collection. A sample work." },
    { name: "Study for a Quiet Room", year: 2023, medium: "Oil on paper", size: "16 × 20 in", status: "not_for_sale", priceCents: 120000, note: "Kept by the painter. A sample work." },
  ];

  const origRows: { id: string; name: string }[] = [];
  let position = 0;
  for (const o of originals) {
    const [row] = await db
      .insert(products)
      .values({
        slug: slugify(o.name),
        name: o.name,
        note: o.note,
        priceCents: o.priceCents,
        categoryId: cOrig.id,
        seriesId: o.series ?? null,
        year: o.year,
        medium: o.medium,
        sizeInches: o.size,
        stock: o.status === "sold" ? 0 : 1,
        published: true,
        saleStatus: o.status,
        position: position++,
        isSample: true,
      })
      .returning();
    origRows.push({ id: row.id, name: row.name });
  }
  const byName = (n: string) => origRows.find((o) => o.name === n)!;

  type Print = {
    name: string;
    year: number;
    basePrice: number;
    from?: string;
    series?: string;
    sizes: [string, number][];
    papers: [string, number][];
    note: string;
  };
  const prints: Print[] = [
    {
      name: "Low Tide, Morning (print)",
      year: 2024,
      basePrice: 6000,
      from: "Low Tide, Morning",
      series: sLow.id,
      sizes: [["12 × 16 in", 0], ["18 × 24 in", 4500]],
      papers: [["Fine art matte", 0], ["Textured cotton rag", 2000]],
      note: "A limited-edition giclée print of the original painting. A sample work.",
    },
    {
      name: "Orchard Light I (print)",
      year: 2025,
      basePrice: 7500,
      from: "Orchard Light I",
      series: sOrchard.id,
      sizes: [["12 × 16 in", 0], ["18 × 24 in", 8500]],
      papers: [["Fine art matte", 0], ["Textured cotton rag", 2000]],
      note: "A limited-edition giclée print of the original painting. A sample work.",
    },
    {
      name: "Grey Room (print)",
      year: 2022,
      basePrice: 4500,
      from: "Grey Room",
      sizes: [["12 × 16 in", 0], ["18 × 24 in", 4000]],
      papers: [["Fine art matte", 0], ["Textured cotton rag", 2000]],
      note: "A print of a painting that now lives in a private collection. A sample work.",
    },
    {
      name: "Orchard Path (print)",
      year: 2024,
      basePrice: 3500,
      series: sOrchard.id,
      sizes: [["8 × 10 in", 0], ["12 × 16 in", 2500]],
      papers: [["Fine art matte", 0], ["Textured cotton rag", 1500]],
      note: "A print made only as a print; there is no original. A sample work.",
    },
  ];

  for (const p of prints) {
    const [row] = await db
      .insert(products)
      .values({
        slug: slugify(p.name),
        name: p.name,
        note: p.note,
        priceCents: p.basePrice,
        categoryId: cPrints.id,
        seriesId: p.series ?? null,
        originalProductId: p.from ? byName(p.from).id : null,
        year: p.year,
        medium: "Giclée print",
        sizeInches: "See sizes below",
        stock: 50,
        published: true,
        saleStatus: "available",
        position: position++,
        isSample: true,
      })
      .returning();
    const [oSize, oPaper] = await db
      .insert(productOptions)
      .values([
        { productId: row.id, name: "Size", required: true, position: 0 },
        { productId: row.id, name: "Paper", required: true, position: 1 },
      ])
      .returning();
    await db.insert(optionValues).values([
      ...p.sizes.map(([label, delta], i) => ({ optionId: oSize.id, label, priceDeltaCents: delta, isDefault: i === 0, position: i })),
      ...p.papers.map(([label, delta], i) => ({ optionId: oPaper.id, label, priceDeltaCents: delta, isDefault: i === 0, position: i })),
    ]);
  }

  await db.insert(exhibitions).values([
    { year: 2025, kind: "exhibition", text: "Quiet Hours, solo exhibition, Harbour Street Gallery (fictional)" },
    { year: 2025, kind: "press", text: "“Painters to watch”, Sample Art Review (fictional)" },
    { year: 2024, kind: "award", text: "Emerging Painter Prize, shortlisted (fictional)" },
    { year: 2024, kind: "exhibition", text: "Coastal Light, group exhibition, Northlight Arts Centre (fictional)" },
    { year: 2023, kind: "exhibition", text: "Low Tide, two-person exhibition, The Salt Room (fictional)" },
    { year: 2022, kind: "press", text: "Studio visit, Quarterly Paint Journal (fictional)" },
  ]);

  console.log(`Seeded ${originals.length} original paintings, ${prints.length} prints, 2 categories, 2 series.`);
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  process.exitCode = 1;
  await pool.end().catch(() => {});
});
