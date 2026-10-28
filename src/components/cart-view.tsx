"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { removeLine, refreshLines, setQuantity, useCart, type CartLine } from "@/lib/cart";
import { computeTotals } from "@/lib/pricing";
import { formatMoney } from "@/lib/utils";
import { store } from "@/config/store";
import { Button, buttonVariants } from "@/components/ui/button";
import { Placeholder } from "@/components/work-card";

type ServerLine = {
  key: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  unitPriceCents: number;
  maxQuantity: number;
  issue: { code: string; message: string; maxQuantity?: number } | null;
};

export function CartView() {
  const cart = useCart();
  const [notices, setNotices] = useState<Record<string, string>>({});
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [announce, setAnnounce] = useState("");
  const ran = useRef(false);
  const ready = useRef(false);

  // Hydration: the first client render still shows the empty server snapshot; wait for the real one.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted || ran.current || cart.lines.length === 0) return;
    ran.current = true;
    const lines = cart.lines;
    (async () => {
      try {
        const res = await fetch("/api/cart/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lines: lines.map((l) => ({
              key: l.key,
              productId: l.productId,
              valueIds: l.options.map((o) => o.valueId),
              personalization: l.personalization,
              quantity: l.quantity,
            })),
          }),
        });
        if (!res.ok) return;
        const { lines: fresh } = (await res.json()) as { lines: ServerLine[] };
        const patch: Record<string, Partial<CartLine>> = {};
        const nextNotices: Record<string, string> = {};
        const nextIssues: Record<string, string> = {};
        for (const f of fresh) {
          const old = lines.find((l) => l.key === f.key);
          if (!old) continue;
          if (f.issue) {
            nextIssues[f.key] = f.issue.message;
            if (f.issue.code === "stock" && f.issue.maxQuantity) patch[f.key] = { maxQuantity: f.issue.maxQuantity };
            continue;
          }
          if (f.unitPriceCents !== old.unitPriceCents) {
            nextNotices[f.key] = `The price changed from ${formatMoney(old.unitPriceCents)} to ${formatMoney(f.unitPriceCents)} since you added this.`;
          }
          patch[f.key] = { unitPriceCents: f.unitPriceCents, maxQuantity: f.maxQuantity, name: f.name, slug: f.slug, imageUrl: f.imageUrl };
        }
        refreshLines(patch);
        setNotices(nextNotices);
        setIssues(nextIssues);
        ready.current = true;
      } catch {
        /* offline: keep showing what we have; checkout re-checks */
      }
    })();
  }, [mounted, cart.lines]);

  const totals = computeTotals(cart.lines);
  const itemCount = cart.count;

  if (!mounted) {
    return <p className="py-16 text-muted-foreground" aria-busy="true">Loading your bag…</p>;
  }

  if (cart.lines.length === 0) {
    return (
      <div className="py-12 text-center" data-testid="empty-cart">
        <p className="font-serif text-2xl">Your bag is empty</p>
        <p className="mt-2 text-muted-foreground">When you find a painting or print you love, it will wait for you here.</p>
        <Link href="/work" className={buttonVariants({ className: "mt-6" })}>Browse the work</Link>
      </div>
    );
  }

  const blocked = Object.keys(issues).length > 0;

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div>
        {cart.storageBlocked && (
          <p role="note" className="mb-4 border-l-4 border-accent bg-muted p-3 text-sm" data-testid="storage-notice">
            Your cart won&apos;t be saved if you close this tab.
          </p>
        )}
        <p className="sr-only" role="status" aria-live="polite">{announce}</p>
        <ul className="divide-y divide-border border-y border-border" data-testid="cart-lines">
          {cart.lines.map((l) => (
            <li key={l.key} className="grid grid-cols-[5rem_1fr] gap-x-4 gap-y-2 py-5 sm:grid-cols-[6rem_1fr_auto]" data-testid="cart-line">
              <Link href={`/work/${l.slug}`} className="block" aria-hidden="true" tabIndex={-1}>
                {l.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={l.imageUrl} alt="" className="h-auto w-full bg-muted" />
                ) : (
                  <Placeholder aspect="4 / 5" label="" />
                )}
              </Link>
              <div className="min-w-0">
                <Link href={`/work/${l.slug}`} className="font-serif text-lg hover:underline" data-testid="line-name">{l.name}</Link>
                {l.options.length > 0 && (
                  <ul className="text-sm text-muted-foreground" data-testid="line-options">
                    {l.options.map((o) => (
                      <li key={o.optionId}>{o.optionName}: {o.valueLabel}</li>
                    ))}
                  </ul>
                )}
                {l.personalization && (
                  <p className="text-sm text-muted-foreground" data-testid="line-personalization">Personalization: “{l.personalization}” (final sale)</p>
                )}
                <p className="mt-1 text-sm" data-testid="line-unit">{formatMoney(l.unitPriceCents)} each</p>
                {notices[l.key] && <p role="status" className="mt-2 text-sm text-accent" data-testid="price-notice">{notices[l.key]}</p>}
                {issues[l.key] && (
                  <p role="alert" className="mt-2 text-sm text-destructive" data-testid="line-issue">
                    {issues[l.key]} Remove it to continue.
                  </p>
                )}
              </div>
              <div className="col-span-2 flex items-center justify-between gap-4 sm:col-span-1 sm:flex-col sm:items-end sm:justify-start">
                <div className="flex items-center border border-foreground/40" role="group" aria-label={`Quantity for ${l.name}`}>
                  <button
                    type="button"
                    className="min-h-11 min-w-11 text-lg hover:bg-muted disabled:opacity-40"
                    aria-label={`Decrease quantity of ${l.name}`}
                    disabled={l.quantity <= 1}
                    onClick={() => {
                      setQuantity(l.key, l.quantity - 1);
                      setAnnounce(`Quantity of ${l.name} is now ${l.quantity - 1}.`);
                    }}
                  >
                    −
                  </button>
                  <output className="min-w-10 text-center" data-testid="line-qty" aria-label={`Quantity of ${l.name}`}>{l.quantity}</output>
                  <button
                    type="button"
                    className="min-h-11 min-w-11 text-lg hover:bg-muted disabled:opacity-40"
                    aria-label={`Increase quantity of ${l.name}`}
                    disabled={l.quantity >= Math.min(store.maxQuantityPerLine, l.maxQuantity)}
                    onClick={() => {
                      setQuantity(l.key, l.quantity + 1);
                      setAnnounce(`Quantity of ${l.name} is now ${l.quantity + 1}.`);
                    }}
                  >
                    +
                  </button>
                </div>
                {l.quantity >= Math.min(store.maxQuantityPerLine, l.maxQuantity) && (
                  <p className="text-xs text-muted-foreground" data-testid="max-note">
                    {l.maxQuantity === 1 ? "One of a kind" : `Most you can buy: ${Math.min(store.maxQuantityPerLine, l.maxQuantity)}`}
                  </p>
                )}
                <p className="font-medium" data-testid="line-total">{formatMoney(l.unitPriceCents * l.quantity)}</p>
                <Button
                  variant="link"
                  size="sm"
                  aria-label={`Remove ${l.name} from your bag`}
                  onClick={() => {
                    removeLine(l.key);
                    setIssues((i) => {
                      const { [l.key]: _gone, ...rest } = i;
                      void _gone;
                      return rest;
                    });
                    setAnnounce(`${l.name} removed from your bag.`);
                  }}
                >
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm"><Link href="/work" className="underline underline-offset-4 hover:text-accent">Continue browsing</Link></p>
      </div>

      <aside aria-labelledby="summary-heading" className="h-fit border border-border bg-muted/40 p-5">
        <h2 id="summary-heading" className="font-serif text-xl">Summary</h2>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between"><dt>Items</dt><dd data-testid="item-count">{itemCount}</dd></div>
          <div className="flex justify-between"><dt>Subtotal</dt><dd data-testid="subtotal">{formatMoney(totals.subtotalCents)}</dd></div>
          <div className="flex justify-between">
            <dt>{store.shipping.label}</dt>
            <dd data-testid="shipping">{totals.shippingCents === 0 ? "Free" : formatMoney(totals.shippingCents)}</dd>
          </div>
          <div className="flex justify-between border-t border-border pt-2 text-base font-medium">
            <dt>Estimated total</dt><dd data-testid="total">{formatMoney(totals.totalCents)}</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-muted-foreground">
          Shipping is a demo estimate: a flat {formatMoney(store.shipping.flatCents)}, free over {formatMoney(store.shipping.freeOverCents)}.
        </p>
        {blocked ? (
          <p className="mt-4 text-sm text-destructive" role="alert">Remove the unavailable item to continue to checkout.</p>
        ) : (
          <Link href="/checkout" className={buttonVariants({ className: "mt-4 w-full" })} data-testid="to-checkout">Proceed to checkout</Link>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          This is a demo store: checkout is simulated and no payment is taken.{" "}
          <Link href="/returns" className="underline underline-offset-2">Returns &amp; refunds</Link>
        </p>
      </aside>
    </div>
  );
}
