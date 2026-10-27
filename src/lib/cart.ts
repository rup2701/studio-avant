"use client";
import { useSyncExternalStore } from "react";
import { store as storeConfig } from "../config/store";

export type CartOption = { optionId: string; optionName: string; valueId: string; valueLabel: string };

export type CartLine = {
  key: string;
  productId: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  options: CartOption[];
  personalization: string | null;
  quantity: number;
  unitPriceCents: number;
  /** Most the shopper can hold for this line (min of the per-line maximum and stock when last seen). */
  maxQuantity: number;
};

export type CartState = { lines: CartLine[]; token: string; storageBlocked: boolean };

const KEY = "sa_cart_v1";
const EMPTY: CartState = { lines: [], token: "", storageBlocked: false };

let state: CartState = EMPTY;
let loaded = false;
let blocked = false;
const listeners = new Set<() => void>();

export function lineKey(productId: string, options: CartOption[], personalization: string | null) {
  const o = [...options]
    .sort((a, b) => a.optionId.localeCompare(b.optionId))
    .map((x) => `${x.optionId}:${x.valueId}`)
    .join("|");
  return `${productId}__${o}__${(personalization ?? "").toLowerCase()}`;
}

function newToken() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `t-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function readStorage(): CartState | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CartState;
    if (!Array.isArray(parsed.lines)) return null;
    return { lines: parsed.lines, token: parsed.token || newToken(), storageBlocked: false };
  } catch (e) {
    return null;
  }
}

function probeStorage() {
  try {
    window.localStorage.setItem("sa_probe", "1");
    window.localStorage.removeItem("sa_probe");
    return true;
  } catch {
    return false;
  }
}

function ensureLoaded() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  blocked = !probeStorage();
  const fromStore = blocked ? null : readStorage();
  state = fromStore ?? { lines: [], token: newToken(), storageBlocked: blocked };
  state = { ...state, storageBlocked: blocked };
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    const next = readStorage() ?? { lines: [], token: newToken(), storageBlocked: blocked };
    state = { ...next, storageBlocked: blocked };
    emit();
  });
}

function emit() {
  listeners.forEach((l) => l());
}

function commit(next: Omit<CartState, "storageBlocked">) {
  state = { ...next, storageBlocked: blocked };
  if (!blocked) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ lines: state.lines, token: state.token }));
    } catch {
      blocked = true;
      state = { ...state, storageBlocked: true };
    }
  }
  emit();
}

function subscribe(l: () => void) {
  ensureLoaded();
  listeners.add(l);
  return () => listeners.delete(l);
}
function getSnapshot() {
  ensureLoaded();
  return state;
}
function getServerSnapshot() {
  return EMPTY;
}

export function useCart() {
  const s = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const count = s.lines.reduce((n, l) => n + l.quantity, 0);
  const subtotalCents = s.lines.reduce((n, l) => n + l.quantity * l.unitPriceCents, 0);
  return { ...s, count, subtotalCents };
}

export type AddResult = { ok: true; quantity: number } | { ok: false; message: string };

export function addToCart(line: Omit<CartLine, "key" | "quantity">, quantity: number): AddResult {
  ensureLoaded();
  const max = Math.min(storeMax(), line.maxQuantity);
  const key = lineKey(line.productId, line.options, line.personalization);
  const existing = state.lines.find((l) => l.key === key);
  const have = existing?.quantity ?? 0;
  if (have + quantity > max) {
    const room = max - have;
    if (max === 1) {
      return { ok: false, message: "This work is one of a kind and is already in your bag." };
    }
    return {
      ok: false,
      message:
        room <= 0
          ? `You already have ${have} of this in your bag, which is the most you can buy at once (${max}). Change the quantity in your bag if you need to.`
          : `You already have ${have} of this in your bag. You can add ${room} more (the most per item is ${max}).`,
    };
  }
  const lines = existing
    ? state.lines.map((l) =>
        l.key === key ? { ...l, quantity: l.quantity + quantity, unitPriceCents: line.unitPriceCents, maxQuantity: line.maxQuantity } : l,
      )
    : [...state.lines, { ...line, key, quantity }];
  commit({ lines, token: state.token || newToken() });
  return { ok: true, quantity: have + quantity };
}

function storeMax() {
  return storeConfig.maxQuantityPerLine;
}

export function setQuantity(key: string, quantity: number) {
  ensureLoaded();
  commit({
    token: state.token,
    lines: state.lines.map((l) =>
      l.key === key ? { ...l, quantity: Math.max(1, Math.min(quantity, Math.min(storeMax(), l.maxQuantity))) } : l,
    ),
  });
}

export function removeLine(key: string) {
  ensureLoaded();
  commit({ token: state.token, lines: state.lines.filter((l) => l.key !== key) });
}

/** Replace line details with fresh server data (price, name, stock limits). */
export function refreshLines(patch: Record<string, Partial<CartLine>>) {
  ensureLoaded();
  commit({
    token: state.token,
    lines: state.lines.map((l) => {
      const p = patch[l.key];
      if (!p) return l;
      const merged = { ...l, ...p };
      merged.quantity = Math.max(1, Math.min(merged.quantity, Math.min(storeMax(), merged.maxQuantity)));
      return merged;
    }),
  });
}

/** After a successful order: empty the cart and start a fresh one-time token. */
export function clearCart() {
  ensureLoaded();
  commit({ lines: [], token: newToken() });
}
