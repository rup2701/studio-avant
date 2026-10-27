"use client";
import Link from "next/link";
import { useId, useMemo, useRef, useState } from "react";
import { addToCart, type CartOption } from "@/lib/cart";
import { normalizePersonalization, validatePersonalization } from "@/lib/pricing";
import { formatMoney, cn } from "@/lib/utils";
import { store } from "@/config/store";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type PurchaseOption = {
  id: string;
  name: string;
  required: boolean;
  values: { id: string; label: string; priceDeltaCents: number; soldOut: boolean; isDefault: boolean }[];
};

type Props = {
  productId: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  basePriceCents: number;
  options: PurchaseOption[];
  personalization: { enabled: boolean; maxLength: number };
  maxQuantity: number;
};

type Msg = { kind: "error" | "success"; text: string } | null;

export function WorkPurchase(p: Props) {
  const uid = useId();
  const [selected, setSelected] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const o of p.options) {
      const d = o.values.find((v) => v.isDefault && !v.soldOut);
      if (d) init[o.id] = d.id;
    }
    return init;
  });
  const [qty, setQty] = useState(1);
  const [personal, setPersonal] = useState("");
  const [personalError, setPersonalError] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const groupRefs = useRef<Record<string, HTMLFieldSetElement | null>>({});
  const personalRef = useRef<HTMLInputElement>(null);

  const unitPrice = useMemo(() => {
    let price = p.basePriceCents;
    for (const o of p.options) {
      const v = o.values.find((x) => x.id === selected[o.id]);
      if (v) price += v.priceDeltaCents;
    }
    return price;
  }, [p.options, p.basePriceCents, selected]);

  const oneOfAKind = p.maxQuantity === 1;

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    // Required options first.
    for (const o of p.options) {
      if (o.required && !selected[o.id]) {
        setMsg({ kind: "error", text: `Please choose a ${o.name.toLowerCase()} before adding to your cart.` });
        groupRefs.current[o.id]?.querySelector<HTMLInputElement>("input:not(:disabled)")?.focus();
        return;
      }
    }
    const norm = normalizePersonalization(personal);
    const perr = p.personalization.enabled ? validatePersonalization(norm, p.personalization.maxLength) : null;
    setPersonalError(perr);
    if (perr) {
      setMsg({ kind: "error", text: perr });
      personalRef.current?.focus();
      return;
    }
    const options: CartOption[] = [];
    for (const o of p.options) {
      const v = o.values.find((x) => x.id === selected[o.id]);
      if (v) options.push({ optionId: o.id, optionName: o.name, valueId: v.id, valueLabel: v.label });
    }
    const personalization = p.personalization.enabled ? norm : null;
    // Check against the database so a stale page cannot put an unavailable configuration in the cart.
    setBusy(true);
    let unit = unitPrice;
    let max = p.maxQuantity;
    try {
      const res = await fetch("/api/cart/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: [{ key: "x", productId: p.productId, valueIds: options.map((o) => o.valueId), personalization, quantity: 1 }],
        }),
      });
      if (res.ok) {
        const { lines } = await res.json();
        const l = lines[0];
        if (l?.issue) {
          setMsg({ kind: "error", text: `${l.issue.message} Your other choices have been kept.` });
          setBusy(false);
          return;
        }
        if (l) {
          unit = l.unitPriceCents;
          max = l.maxQuantity;
        }
      }
    } catch {
      /* offline: fall through with page values; checkout re-checks everything */
    }
    setBusy(false);
    const res = addToCart(
      {
        productId: p.productId,
        slug: p.slug,
        name: p.name,
        imageUrl: p.imageUrl,
        options,
        personalization,
        unitPriceCents: unit,
        maxQuantity: max,
      },
      qty,
    );
    if (!res.ok) {
      setMsg({ kind: "error", text: res.message });
      return;
    }
    setMsg({
      kind: "success",
      text: `Added to your cart: ${p.name}${options.length ? " (" + options.map((o) => o.valueLabel).join(", ") + ")" : ""}${qty > 1 ? ` × ${qty}` : ""}.`,
    });
  }

  const maxQty = Math.min(store.maxQuantityPerLine, p.maxQuantity);

  return (
    <form onSubmit={onAdd} noValidate className="mt-6 space-y-5" data-testid="purchase-form">
      <p className="font-serif text-2xl" data-testid="price" aria-live="polite">
        {formatMoney(unitPrice)}
        <span className="ml-2 text-sm font-sans text-muted-foreground">USD</span>
      </p>

      {p.options.map((o) => {
        const missing = msg?.kind === "error" && o.required && !selected[o.id];
        return (
          <fieldset
            key={o.id}
            ref={(el) => {
              groupRefs.current[o.id] = el;
            }}
            aria-describedby={missing ? `${uid}-${o.id}-err` : undefined}
            data-testid={`option-${o.name.toLowerCase()}`}
          >
            <legend className="mb-2 text-sm font-medium">
              {o.name}
              {o.required ? <span className="text-muted-foreground"> (required)</span> : <span className="text-muted-foreground"> (optional)</span>}
            </legend>
            <div className="flex flex-wrap gap-2">
              {o.values.map((v) => {
                const checked = selected[o.id] === v.id;
                return (
                  <label
                    key={v.id}
                    className={cn(
                      "relative inline-flex min-h-11 cursor-pointer items-center border px-4 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                      checked ? "border-foreground bg-foreground text-background" : "border-foreground/40 hover:border-foreground",
                      v.soldOut && "cursor-not-allowed border-dashed text-muted-foreground line-through hover:border-foreground/40",
                    )}
                  >
                    <input
                      type="radio"
                      name={`${uid}-${o.id}`}
                      className="sr-only"
                      value={v.id}
                      checked={checked}
                      disabled={v.soldOut}
                      onChange={() => {
                        setSelected((s) => ({ ...s, [o.id]: v.id }));
                        setMsg(null);
                      }}
                    />
                    <span>
                      {v.label}
                      {v.priceDeltaCents !== 0 && (
                        <span className="ml-1 opacity-80">
                          ({v.priceDeltaCents > 0 ? "+" : "−"}
                          {formatMoney(Math.abs(v.priceDeltaCents))})
                        </span>
                      )}
                      {v.soldOut && <span className="ml-1 no-underline">— Sold out</span>}
                    </span>
                  </label>
                );
              })}
            </div>
            {missing && (
              <p id={`${uid}-${o.id}-err`} className="mt-1 text-sm text-destructive">
                Please choose a {o.name.toLowerCase()}.
              </p>
            )}
          </fieldset>
        );
      })}

      {p.personalization.enabled && (
        <div>
          <Label htmlFor={`${uid}-personal`}>Personalization (optional)</Label>
          <Input
            id={`${uid}-personal`}
            ref={personalRef}
            className="mt-1"
            value={personal}
            maxLength={p.personalization.maxLength}
            onChange={(e) => {
              setPersonal(e.target.value);
              setPersonalError(null);
            }}
            aria-invalid={personalError ? true : undefined}
            aria-describedby={`${uid}-personal-help`}
          />
          <p id={`${uid}-personal-help`} className="mt-1 text-sm text-muted-foreground">
            <span data-testid="personal-count">{personal.length} / {p.personalization.maxLength}</span> characters. {store.personalizationCharset}.
            Personalized pieces are final sale unless they arrive damaged or incorrect.{" "}
            <Link href="/returns" className="underline underline-offset-2">Returns policy</Link>
          </p>
          {personalError && <p className="mt-1 text-sm text-destructive">{personalError}</p>}
        </div>
      )}

      {!oneOfAKind && (
        <div>
          <Label htmlFor={`${uid}-qty`}>Quantity</Label>
          <Input
            id={`${uid}-qty`}
            type="number"
            inputMode="numeric"
            min={1}
            max={maxQty}
            value={qty}
            className="mt-1 w-28"
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              setQty(Number.isFinite(n) ? Math.max(1, Math.min(maxQty, n)) : 1);
            }}
          />
          <p className="mt-1 text-xs text-muted-foreground">Up to {maxQty} at a time.</p>
        </div>
      )}
      {oneOfAKind && <p className="text-sm text-muted-foreground">One of a kind: only one can be bought.</p>}

      <Button type="submit" disabled={busy} className="w-full sm:w-auto" data-testid="add-to-cart">
        {busy ? "Checking…" : "Add to cart"}
      </Button>

      <div role="status" aria-live="polite" data-testid="purchase-message">
        {msg && (
          <div
            className={cn(
              "border-l-4 p-3 text-sm",
              msg.kind === "error" ? "border-destructive bg-destructive/5 text-destructive" : "border-accent bg-muted text-foreground",
            )}
            data-kind={msg.kind}
          >
            <p>{msg.text}</p>
            {msg.kind === "success" && (
              <p className="mt-2 flex flex-wrap gap-4">
                <Link href="/cart" className={buttonVariants({ size: "sm" })}>View your bag</Link>
                <Link href="/" className={buttonVariants({ size: "sm", variant: "outline" })}>Continue browsing</Link>
              </p>
            )}
          </div>
        )}
      </div>
    </form>
  );
}
