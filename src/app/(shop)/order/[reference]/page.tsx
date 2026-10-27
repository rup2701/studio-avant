import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orderItems, orders } from "@/db/schema";
import { formatMoney } from "@/lib/utils";
import { store } from "@/config/store";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Order confirmation" };

type Params = { params: Promise<{ reference: string }> };

/** Read-only: viewing or refreshing this page never creates an order. */
export default async function OrderPage({ params }: Params) {
  const { reference } = await params;
  const ref = decodeURIComponent(reference).trim().toUpperCase();
  if (!/^[A-Z0-9-]{3,20}$/.test(ref)) notFound();
  const [order] = await db.select().from(orders).where(eq(orders.reference, ref));
  if (!order) notFound();
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
  return (
    <div className="reading-wide page-x pt-8 md:pt-12">
      <p className="border-l-4 border-accent bg-muted p-3 text-sm" data-testid="demo-order-notice">
        <strong>This is a demo order.</strong> No payment was taken, nothing will ship and no email is sent.
      </p>
      <h1 className="mt-6 font-serif text-3xl">Thank you, your demo order is placed</h1>
      <p className="mt-2 text-lg">
        Order reference: <strong data-testid="order-reference" className="font-mono tracking-wider">{order.reference}</strong>
      </p>
      <p className="text-sm text-muted-foreground">Keep this reference. There is no order lookup page in this version.</p>

      <h2 className="mt-8 font-serif text-xl">What you ordered</h2>
      <ul className="mt-2 divide-y divide-border border-y border-border" data-testid="order-items">
        {items.map((i) => (
          <li key={i.id} className="flex justify-between gap-4 py-3" data-testid="order-item">
            <div>
              <p className="font-serif text-lg">{i.name}</p>
              {i.options.length > 0 && (
                <p className="text-sm text-muted-foreground">{i.options.map((o) => `${o.name}: ${o.value}`).join(", ")}</p>
              )}
              {i.personalization && <p className="text-sm text-muted-foreground">Personalization: “{i.personalization}” (final sale)</p>}
              <p className="text-sm text-muted-foreground">
                {formatMoney(i.unitPriceCents)} × {i.quantity}
              </p>
            </div>
            <p>{formatMoney(i.lineTotalCents)}</p>
          </li>
        ))}
      </ul>

      <dl className="mt-4 max-w-xs space-y-1 text-sm ml-auto">
        <div className="flex justify-between"><dt>Subtotal</dt><dd data-testid="order-subtotal">{formatMoney(order.subtotalCents)}</dd></div>
        <div className="flex justify-between">
          <dt>{store.shipping.label}</dt>
          <dd data-testid="order-shipping">{order.shippingCents === 0 ? "Free" : formatMoney(order.shippingCents)}</dd>
        </div>
        <div className="flex justify-between border-t border-border pt-1 text-base font-medium"><dt>Total (demo)</dt><dd data-testid="order-total">{formatMoney(order.totalCents)}</dd></div>
      </dl>

      <h2 className="mt-8 font-serif text-xl">Shipping to</h2>
      <address className="mt-2 not-italic text-muted-foreground" data-testid="order-address">
        {order.name}<br />
        {order.address}<br />
        {order.city}, {order.region} {order.postalCode}<br />
        {order.country}<br />
        {order.email}
      </address>

      <Link href="/" className={buttonVariants({ className: "mt-10" })}>Back to the work</Link>
    </div>
  );
}
