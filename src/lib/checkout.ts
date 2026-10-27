import "server-only";
import crypto from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { orderItems, orders, productOptions, products, systemEvents } from "../db/schema";
import { computeTotals } from "./pricing";
import { priceLines, type PricedLine } from "./cart-server";
import { checkoutRequestSchema, validateCustomer, CUSTOMER_FIELDS } from "./checkout-schema";

export type PlaceOrderResult =
  | { status: "created"; reference: string }
  | { status: "invalid"; fieldErrors: Partial<Record<(typeof CUSTOMER_FIELDS)[number], string>> }
  | { status: "issues"; lines: PricedLine[] }
  | { status: "price_changed"; lines: PricedLine[] }
  | { status: "error"; message: string };

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export function makeReference() {
  const bytes = crypto.randomBytes(8);
  let s = "";
  for (let i = 0; i < 8; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return `SA-${s}`;
}

class StockConflict extends Error {}

export const GENERIC_FAILURE =
  "Something went wrong placing your demo order. Nothing was charged. Please try again.";

export async function placeOrder(raw: unknown): Promise<PlaceOrderResult> {
  const parsed = checkoutRequestSchema.safeParse(raw);
  if (!parsed.success) return { status: "error", message: "We couldn't read your cart. Please go back to your bag and try again." };
  const { token, lines: inputLines } = parsed.data;
  if (inputLines.length === 0)
    return { status: "error", message: "There's nothing to check out yet. Your bag is empty." };

  const cust = validateCustomer(parsed.data.customer);
  if (!cust.ok) return { status: "invalid", fieldErrors: cust.errors };

  try {
    // Same token always returns the same order.
    const [existing] = await db.select({ reference: orders.reference }).from(orders).where(eq(orders.token, token));
    if (existing) return { status: "created", reference: existing.reference };

    const priced = await priceLines(
      inputLines.map((l) => ({
        key: l.key,
        productId: l.productId,
        valueIds: l.valueIds,
        personalization: l.personalization ?? null,
        quantity: l.quantity,
        expectedUnitPriceCents: l.expectedUnitPriceCents,
      })),
    );
    if (priced.some((l) => l.issue)) return { status: "issues", lines: priced };
    const changed = priced.some((l, i) => {
      const exp = inputLines[i].expectedUnitPriceCents;
      return exp !== undefined && exp !== l.unitPriceCents;
    });
    if (changed) return { status: "price_changed", lines: priced };

    const totals = computeTotals(priced);
    const c = cust.data;

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const result = await db.transaction(async (tx) => {
          const [again] = await tx.select({ reference: orders.reference }).from(orders).where(eq(orders.token, token));
          if (again) return again.reference;
          const reference = makeReference();
          const inserted = await tx
            .insert(orders)
            .values({
              reference,
              token,
              name: c.name,
              email: c.email,
              address: c.address,
              city: c.city,
              region: c.region,
              postalCode: c.postalCode,
              country: c.country,
              subtotalCents: totals.subtotalCents,
              shippingCents: totals.shippingCents,
              totalCents: totals.totalCents,
            })
            .onConflictDoNothing({ target: orders.token })
            .returning({ id: orders.id, reference: orders.reference });
          if (inserted.length === 0) {
            // Another request with the same token won the race.
            const [won] = await tx.select({ reference: orders.reference }).from(orders).where(eq(orders.token, token));
            if (won) return won.reference;
            throw new Error("reference-collision");
          }
          const orderId = inserted[0].id;
          await tx.insert(orderItems).values(
            priced.map((l) => ({
              orderId,
              productId: l.productId,
              slug: l.slug,
              name: l.name,
              options: l.options.map((o) => ({ name: o.optionName, value: o.valueLabel })),
              personalization: l.personalization,
              unitPriceCents: l.unitPriceCents,
              quantity: l.quantity,
              lineTotalCents: l.unitPriceCents * l.quantity,
              imageUrl: l.imageUrl,
            })),
          );
          // Decrement stock atomically; a concurrent buyer of the last piece loses here and rolls back.
          const perProduct = new Map<string, number>();
          for (const l of priced) perProduct.set(l.productId, (perProduct.get(l.productId) ?? 0) + l.quantity);
          for (const [productId, qty] of [...perProduct.entries()].sort(([a], [b]) => a.localeCompare(b))) {
            const upd = await tx
              .update(products)
              .set({ stock: sql`${products.stock} - ${qty}`, updatedAt: new Date() })
              .where(
                and(
                  eq(products.id, productId),
                  eq(products.published, true),
                  eq(products.saleStatus, "available"),
                  sql`${products.stock} >= ${qty}`,
                ),
              )
              .returning({ id: products.id, stock: products.stock });
            if (upd.length === 0) throw new StockConflict(productId);
            if (upd[0].stock <= 0) {
              // A one-of-a-kind work (no options) becomes Sold everywhere once bought.
              const opt = await tx
                .select({ id: productOptions.id })
                .from(productOptions)
                .where(eq(productOptions.productId, productId))
                .limit(1);
              if (opt.length === 0) {
                await tx.update(products).set({ saleStatus: "sold" }).where(eq(products.id, productId));
              }
            }
          }
          return reference;
        });
        return { status: "created", reference: result };
      } catch (e) {
        if (e instanceof StockConflict) {
          const fresh = await priceLines(
            inputLines.map((l) => ({
              key: l.key,
              productId: l.productId,
              valueIds: l.valueIds,
              personalization: l.personalization ?? null,
              quantity: l.quantity,
            })),
          );
          return { status: "issues", lines: fresh };
        }
        if (e instanceof Error && e.message === "reference-collision") continue;
        throw e;
      }
    }
    throw new Error("Could not allocate an order reference");
  } catch (e) {
    console.error("[checkout] failed", e);
    try {
      await db.insert(systemEvents).values({
        kind: "checkout_failed",
        message: `A shopper's checkout failed and no order was created. (${e instanceof Error ? e.message.slice(0, 160) : "unknown error"})`,
      });
    } catch {}
    return { status: "error", message: GENERIC_FAILURE };
  }
}
