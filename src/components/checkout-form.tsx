"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { clearCart, refreshLines, removeLine, setQuantity, useCart, type CartLine } from "@/lib/cart";
import { computeTotals } from "@/lib/pricing";
import { CUSTOMER_FIELDS, validateCustomer } from "@/lib/checkout-schema";
import { formatMoney } from "@/lib/utils";
import { store } from "@/config/store";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Field = (typeof CUSTOMER_FIELDS)[number];
type Values = Record<Field, string>;
type Errors = Partial<Record<Field, string>>;
type LineResult = {
  key: string;
  name: string;
  unitPriceCents: number;
  maxQuantity: number;
  imageUrl: string | null;
  slug: string;
  issue: { code: string; message: string; maxQuantity?: number } | null;
};

const LABELS: Record<Field, string> = {
  name: "Full name",
  email: "Email address",
  address: "Street address",
  city: "City",
  region: "State, province or region",
  postalCode: "Postal code",
  country: "Country",
};
const AUTOCOMPLETE: Record<Field, string> = {
  name: "name",
  email: "email",
  address: "street-address",
  city: "address-level2",
  region: "address-level1",
  postalCode: "postal-code",
  country: "country-name",
};

export function CheckoutForm() {
  const router = useRouter();
  const cart = useCart();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [values, setValues] = useState<Values>({
    name: "",
    email: "",
    address: "",
    city: "",
    region: "",
    postalCode: "",
    country: store.countries[0],
  });
  const [errors, setErrors] = useState<Errors>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [lineIssues, setLineIssues] = useState<Record<string, { message: string; maxQuantity?: number }>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const submittingRef = useRef(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  const totals = computeTotals(cart.lines);

  useEffect(() => {
    if ((Object.keys(errors).length > 0 || banner) && summaryRef.current) summaryRef.current.focus();
  }, [errors, banner]);

  if (!mounted) return <p className="py-16 text-muted-foreground" aria-busy="true">Loading checkout…</p>;

  if (cart.lines.length === 0 && !done) {
    return (
      <div className="py-12 text-center" data-testid="checkout-empty">
        <p className="font-serif text-2xl">There&apos;s nothing to check out yet</p>
        <p className="mt-2 text-muted-foreground">Your bag is empty. Find a work you love and add it first.</p>
        <Link href="/" className={buttonVariants({ className: "mt-6" })}>Browse the work</Link>
      </div>
    );
  }

  function applyLines(lines: LineResult[], keepIssues: boolean) {
    const patch: Record<string, Partial<CartLine>> = {};
    const issues: Record<string, { message: string; maxQuantity?: number }> = {};
    for (const l of lines) {
      if (l.issue) {
        if (keepIssues) issues[l.key] = { message: l.issue.message, maxQuantity: l.issue.code === "stock" ? l.issue.maxQuantity : undefined };
        continue;
      }
      patch[l.key] = { unitPriceCents: l.unitPriceCents, maxQuantity: l.maxQuantity, name: l.name, slug: l.slug, imageUrl: l.imageUrl };
    }
    refreshLines(patch);
    setLineIssues(issues);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current) return;
    setBanner(null);
    const v = validateCustomer(values);
    if (!v.ok) {
      setErrors(v.errors);
      return;
    }
    setErrors({});
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: cart.token,
          customer: values,
          lines: cart.lines.map((l) => ({
            key: l.key,
            productId: l.productId,
            valueIds: l.options.map((o) => o.valueId),
            personalization: l.personalization,
            quantity: l.quantity,
            expectedUnitPriceCents: l.unitPriceCents,
          })),
        }),
      });
      const data = await res.json();
      if (data.status === "created") {
        setDone(true);
        router.push(`/order/${data.reference}`);
        // Clear after navigation starts so this page never shows an empty-bag state.
        setTimeout(() => clearCart(), 50);
        return;
      }
      if (data.status === "invalid") {
        setErrors(data.fieldErrors ?? {});
      } else if (data.status === "issues") {
        applyLines(data.lines, true);
        setBanner("Some items in your bag changed. No order was placed. See below for what to do.");
      } else if (data.status === "price_changed") {
        applyLines(data.lines, false);
        setBanner("A price changed since you added an item, so your summary has been updated. Please review it and place your order again. No order was placed.");
      } else {
        setBanner(data.message ?? "Something went wrong placing your demo order. Nothing was charged. Please try again.");
      }
    } catch {
      setBanner("Something went wrong placing your demo order. Nothing was charged. Please try again.");
    }
    submittingRef.current = false;
    setSubmitting(false);
  }

  const errorEntries = Object.entries(errors) as [Field, string][];
  const hasIssues = Object.keys(lineIssues).length > 0;

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <form onSubmit={onSubmit} noValidate aria-label="Checkout details" data-testid="checkout-form">
        <p className="mb-6 border-l-4 border-accent bg-muted p-3 text-sm" data-testid="demo-notice">
          <strong>This checkout is simulated.</strong> No payment is collected, no card details are asked for, and nothing will ship. Submitting creates a demo order only.
        </p>

        <div ref={summaryRef} tabIndex={-1} className="outline-none">
          {errorEntries.length > 0 && (
            <div role="alert" className="mb-6 border-l-4 border-destructive bg-destructive/5 p-3 text-sm" data-testid="error-summary">
              <p className="font-medium text-destructive">Please fix {errorEntries.length === 1 ? "this problem" : "these problems"} to place your order:</p>
              <ul className="mt-1 list-disc pl-5">
                {errorEntries.map(([f, m]) => (
                  <li key={f}>
                    <a
                      href={`#field-${f}`}
                      className="underline"
                      onClick={(ev) => {
                        ev.preventDefault();
                        document.getElementById(`field-${f}`)?.focus();
                      }}
                    >
                      {LABELS[f]}: {m}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {banner && (
            <div role="alert" className="mb-6 border-l-4 border-destructive bg-destructive/5 p-3 text-sm text-destructive" data-testid="checkout-banner">
              {banner}
            </div>
          )}
        </div>

        <fieldset className="space-y-4">
          <legend className="mb-3 font-serif text-xl">Contact and shipping</legend>
          {CUSTOMER_FIELDS.map((f) => (
            <div key={f}>
              <Label htmlFor={`field-${f}`}>{LABELS[f]}</Label>
              {f === "country" ? (
                <Select
                  id={`field-${f}`}
                  name={f}
                  className="mt-1"
                  autoComplete={AUTOCOMPLETE[f]}
                  value={values[f]}
                  aria-invalid={errors[f] ? true : undefined}
                  aria-describedby={errors[f] ? `err-${f}` : undefined}
                  onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value }))}
                >
                  {store.countries.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </Select>
              ) : (
                <Input
                  id={`field-${f}`}
                  name={f}
                  className="mt-1"
                  type={f === "email" ? "email" : "text"}
                  autoComplete={AUTOCOMPLETE[f]}
                  value={values[f]}
                  aria-invalid={errors[f] ? true : undefined}
                  aria-describedby={errors[f] ? `err-${f}` : undefined}
                  onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value }))}
                />
              )}
              {errors[f] && (
                <p id={`err-${f}`} className="mt-1 text-sm text-destructive">{errors[f]}</p>
              )}
            </div>
          ))}
        </fieldset>

        <Button type="submit" className="mt-8 w-full sm:w-auto" disabled={submitting || hasIssues} data-testid="place-order">
          {submitting ? "Placing demo order…" : "Place demo order"}
        </Button>
        <p className="mt-3 text-sm text-muted-foreground">
          By placing this demo order you agree to nothing real. See the <Link href="/returns" className="underline underline-offset-2">returns &amp; refunds policy</Link>.
        </p>
      </form>

      <aside aria-labelledby="order-summary-heading" className="h-fit border border-border bg-muted/40 p-5" data-testid="order-summary">
        <h2 id="order-summary-heading" className="font-serif text-xl">Order summary</h2>
        <ul className="mt-4 divide-y divide-border text-sm">
          {cart.lines.map((l) => (
            <li key={l.key} className="py-3" data-testid="summary-line">
              <div className="flex justify-between gap-3">
                <span>
                  {l.name} <span className="text-muted-foreground">× {l.quantity}</span>
                </span>
                <span>{formatMoney(l.unitPriceCents * l.quantity)}</span>
              </div>
              {l.options.length > 0 && (
                <p className="text-xs text-muted-foreground">{l.options.map((o) => `${o.optionName}: ${o.valueLabel}`).join(", ")}</p>
              )}
              {l.personalization && <p className="text-xs text-muted-foreground">Personalization: “{l.personalization}”</p>}
              {lineIssues[l.key] && (
                <div role="alert" className="mt-2 text-sm text-destructive" data-testid="line-issue">
                  <p>{lineIssues[l.key].message}</p>
                  <div className="mt-1 flex gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        removeLine(l.key);
                        setLineIssues((i) => {
                          const { [l.key]: _g, ...rest } = i;
                          void _g;
                          return rest;
                        });
                        setBanner(null);
                      }}
                    >
                      Remove {l.name} and continue
                    </Button>
                    {lineIssues[l.key].maxQuantity ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setQuantity(l.key, lineIssues[l.key].maxQuantity!);
                          setLineIssues((i) => {
                            const { [l.key]: _g, ...rest } = i;
                            void _g;
                            return rest;
                          });
                          setBanner(null);
                        }}
                      >
                        Change quantity to {lineIssues[l.key].maxQuantity}
                      </Button>
                    ) : null}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between"><dt>Subtotal</dt><dd data-testid="subtotal">{formatMoney(totals.subtotalCents)}</dd></div>
          <div className="flex justify-between">
            <dt>{store.shipping.label}</dt>
            <dd data-testid="shipping">{totals.shippingCents === 0 ? "Free" : formatMoney(totals.shippingCents)}</dd>
          </div>
          <div className="flex justify-between border-t border-border pt-2 text-base font-medium">
            <dt>Total (demo)</dt><dd data-testid="total">{formatMoney(totals.totalCents)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">
          Shipping is a demo estimate. No tax is calculated. <Link href="/cart" className="underline underline-offset-2">Edit your bag</Link>
        </p>
      </aside>
    </div>
  );
}
