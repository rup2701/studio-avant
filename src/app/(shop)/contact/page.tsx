import Link from "next/link";
import type { Metadata } from "next";
import { store } from "@/config/store";

export const metadata: Metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <div className="reading page-x pt-8 md:pt-12">
      <h1 className="font-serif text-3xl md:text-4xl">Contact the studio</h1>
      <dl className="mt-8 space-y-6">
        <div>
          <dt className="text-sm text-muted-foreground">Email</dt>
          <dd className="text-xl">
            <a href={`mailto:${store.email}`} className="underline underline-offset-4 select-all" data-testid="contact-email">{store.email}</a>
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Response time</dt>
          <dd>We reply {store.responseTime}.</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Studio hours</dt>
          <dd>{store.hours}</dd>
        </div>
      </dl>
      <p className="mt-8">
        Looking for quick answers? See <Link href="/help" className="underline underline-offset-4">Help &amp; FAQ</Link> or the{" "}
        <Link href="/returns" className="underline underline-offset-4">returns &amp; refunds policy</Link>. To ask about a
        painting made for you, use <Link href="/commissions" className="underline underline-offset-4">Commissions</Link>.
      </p>
      <p className="mt-8 border-l-4 border-accent bg-muted p-3 text-sm">
        This is a demo store. The email address is a placeholder and messages are not monitored. This page has no form and
        sends nothing.
      </p>
    </div>
  );
}
