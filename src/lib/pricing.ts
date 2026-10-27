import { store } from "../config/store";

/** The one shared function that computes shipping and totals for cart, checkout and the saved order. */
export function computeTotals(lines: { unitPriceCents: number; quantity: number }[]) {
  const subtotalCents = lines.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0);
  const shippingCents =
    subtotalCents === 0 || subtotalCents > store.shipping.freeOverCents ? 0 : store.shipping.flatCents;
  return { subtotalCents, shippingCents, totalCents: subtotalCents + shippingCents };
}

/** Normalise personalization: trim and collapse whitespace; empty means none. */
export function normalizePersonalization(input: string | null | undefined): string | null {
  const s = (input ?? "").replace(/\s+/g, " ").trim();
  return s ? s : null;
}

const PERSONALIZATION_RE = /^[A-Za-z0-9 &.,'-]+$/;

export function validatePersonalization(text: string | null, maxLength: number): string | null {
  if (!text) return null;
  if (text.length > maxLength) return `Personalization can be at most ${maxLength} characters.`;
  if (!PERSONALIZATION_RE.test(text))
    return "Personalization can use letters, numbers, spaces and & . , ' - only.";
  return null;
}
