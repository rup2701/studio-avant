import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { optionValues, productImages, productOptions, products } from "../db/schema";
import { store } from "../config/store";
import { availabilityOf } from "./queries";
import { normalizePersonalization, validatePersonalization } from "./pricing";

export type InputLine = {
  key: string;
  productId: string;
  valueIds: string[];
  personalization: string | null;
  quantity: number;
  expectedUnitPriceCents?: number;
};

export type LineIssue = {
  code: "unavailable" | "stock" | "invalid";
  message: string;
  /** For stock issues: how many can be bought. */
  maxQuantity?: number;
};

export type PricedLine = {
  key: string;
  productId: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  options: { optionId: string; optionName: string; valueId: string; valueLabel: string }[];
  personalization: string | null;
  quantity: number;
  unitPriceCents: number;
  maxQuantity: number;
  issue: LineIssue | null;
};

/** Prices every line from the database. The browser cart is never trusted. */
export async function priceLines(input: InputLine[]): Promise<PricedLine[]> {
  const ids = [...new Set(input.map((l) => l.productId))].filter((id) =>
    /^[0-9a-f-]{36}$/i.test(id),
  );
  const prods = ids.length ? await db.select().from(products).where(inArray(products.id, ids)) : [];
  const byId = new Map(prods.map((p) => [p.id, p]));
  const opts = ids.length
    ? await db.select().from(productOptions).where(inArray(productOptions.productId, ids)).orderBy(asc(productOptions.position))
    : [];
  const vals = opts.length
    ? await db.select().from(optionValues).where(inArray(optionValues.optionId, opts.map((o) => o.id)))
    : [];
  const imgs = ids.length
    ? await db.select().from(productImages).where(inArray(productImages.productId, ids)).orderBy(asc(productImages.position))
    : [];
  const cover = new Map<string, string>();
  for (const i of imgs) if (!cover.has(i.productId)) cover.set(i.productId, i.url);

  const out: PricedLine[] = input.map((l) => {
    const p = byId.get(l.productId);
    const base: PricedLine = {
      key: l.key,
      productId: l.productId,
      slug: p?.slug ?? "",
      name: p?.name ?? "Unknown work",
      imageUrl: p ? (cover.get(p.id) ?? null) : null,
      options: [],
      personalization: null,
      quantity: l.quantity,
      unitPriceCents: 0,
      maxQuantity: 0,
      issue: null,
    };
    if (!p || !p.published) {
      return { ...base, issue: { code: "unavailable", message: `“${base.name}” is no longer available.` } };
    }
    const av = availabilityOf(p);
    if (av !== "available") {
      const why =
        av === "sold" || av === "sold_out"
          ? "has been sold"
          : av === "private_collection"
            ? "is in a private collection"
            : "is not for sale";
      return { ...base, issue: { code: "unavailable", message: `“${p.name}” ${why} and can no longer be bought.` } };
    }
    const pOpts = opts.filter((o) => o.productId === p.id);
    const chosen: PricedLine["options"] = [];
    let price = p.priceCents ?? 0;
    for (const o of pOpts) {
      const oVals = vals.filter((v) => v.optionId === o.id);
      const picked = oVals.filter((v) => l.valueIds.includes(v.id));
      if (picked.length > 1) {
        return { ...base, issue: { code: "invalid", message: `Please choose one ${o.name.toLowerCase()} for “${p.name}”.` } };
      }
      if (picked.length === 0) {
        if (o.required) {
          return { ...base, issue: { code: "invalid", message: `Please choose a ${o.name.toLowerCase()} for “${p.name}”.` } };
        }
        continue;
      }
      const v = picked[0];
      if (v.soldOut) {
        return {
          ...base,
          issue: { code: "unavailable", message: `“${p.name}” in ${o.name.toLowerCase()} “${v.label}” is sold out.` },
        };
      }
      price += v.priceDeltaCents;
      chosen.push({ optionId: o.id, optionName: o.name, valueId: v.id, valueLabel: v.label });
    }
    const knownIds = new Set(vals.filter((v) => pOpts.some((o) => o.id === v.optionId)).map((v) => v.id));
    if (l.valueIds.some((id) => !knownIds.has(id))) {
      return { ...base, issue: { code: "invalid", message: `The options chosen for “${p.name}” are no longer valid.` } };
    }
    let personalization: string | null = null;
    if (l.personalization) {
      const norm = normalizePersonalization(l.personalization);
      if (norm) {
        if (!p.personalizationEnabled) {
          return { ...base, issue: { code: "invalid", message: `“${p.name}” cannot be personalized.` } };
        }
        const err = validatePersonalization(norm, p.personalizationMaxLength);
        if (err) return { ...base, issue: { code: "invalid", message: err } };
        personalization = norm;
      }
    }
    const max = Math.max(0, Math.min(store.maxQuantityPerLine, p.stock));
    const priced: PricedLine = {
      ...base,
      options: chosen,
      personalization,
      unitPriceCents: price,
      maxQuantity: max,
    };
    if (!Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > store.maxQuantityPerLine) {
      return { ...priced, issue: { code: "invalid", message: `Quantity for “${p.name}” must be between 1 and ${store.maxQuantityPerLine}.` } };
    }
    if (l.quantity > p.stock) {
      return {
        ...priced,
        issue: {
          code: "stock",
          maxQuantity: p.stock,
          message:
            p.stock === 1
              ? `Only 1 of “${p.name}” is available.`
              : `Only ${p.stock} of “${p.name}” are available.`,
        },
      };
    }
    return priced;
  });

  // Several lines of one product share its stock.
  const used = new Map<string, number>();
  for (const l of out) {
    if (l.issue) continue;
    const p = byId.get(l.productId)!;
    const total = (used.get(p.id) ?? 0) + l.quantity;
    used.set(p.id, total);
    if (total > p.stock) {
      l.issue = {
        code: "stock",
        maxQuantity: Math.max(0, p.stock - (total - l.quantity)),
        message: `There is not enough stock of “${p.name}” for all the lines in your cart.`,
      };
    }
  }
  return out;
}
