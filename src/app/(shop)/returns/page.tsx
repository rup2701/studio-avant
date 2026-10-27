import Link from "next/link";
import type { Metadata } from "next";
import { store } from "@/config/store";

export const metadata: Metadata = { title: "Returns & refunds" };

export default function ReturnsPage() {
  const d = store.returnsWindowDays;
  return (
    <div className="reading page-x pt-8 md:pt-12">
      <h1 className="font-serif text-3xl md:text-4xl">Returns &amp; refunds</h1>
      <p className="mt-4 border-l-4 border-accent bg-muted p-3 text-sm" data-testid="returns-demo-notice">
        <strong>Sample policy for a demo store.</strong> No real returns or refunds are processed, because no real orders are taken.
      </p>

      <section aria-labelledby="glance" className="prose-quiet mt-8">
        <h2 id="glance">At a glance</h2>
        <ul>
          <li><strong>{d} days</strong> from delivery to ask for a return.</li>
          <li>Refunds go back to the original payment method within <strong>7 working days</strong> of the work arriving back.</li>
          <li>Personalized items are <strong>final sale</strong> unless they arrive damaged or incorrect.</li>
        </ul>

        <h2>Return window and condition</h2>
        <p>
          You can return a painting or print within {d} days of delivery. It must be in the condition you received it:
          unframed prints flat and unmarked, originals undamaged and in their original protective packing.
        </p>

        <h2>Originals and prints</h2>
        <p>
          <strong>Original paintings</strong> are one of a kind. They must be returned insured and tracked, in the packing they
          arrived in. Once the original is back and checked, it returns to the studio and is shown as Available again.
        </p>
        <p>
          <strong>Limited prints</strong> must be returned flat in a rigid mailer. Prints that have been framed, trimmed or
          marked cannot be returned.
        </p>

        <h2>How to start a return</h2>
        <p>
          Email the studio at <a href={`mailto:${store.email}`}>{store.email}</a> with your order reference and the work you are returning.
          We will reply with the return address and what to do next. See also <Link href="/contact">Contact</Link>.
        </p>

        <h2>Refund method and timing</h2>
        <p>Refunds are made to the original payment method within 7 working days of the work arriving back and passing a condition check. The original shipping charge is not refunded unless the work arrived damaged or incorrect.</p>

        <h2>Return shipping costs</h2>
        <p>You pay to return a work, unless it arrived damaged or incorrect, in which case the studio pays.</p>

        <h2>Personalized and final-sale items</h2>
        <p>
          A personalized item is made for you and is <strong>final sale</strong>. It cannot be returned unless it arrives
          damaged or incorrect. Works that are not personalized keep the normal {d}-day window.
        </p>

        <h2>Damaged or incorrect items</h2>
        <p>
          If something arrives damaged or is not what you ordered, email us within 3 days of delivery with a photo. We will
          replace it or refund you in full, including shipping.
        </p>

        <h2>Questions?</h2>
        <p>
          Read the <Link href="/help">Help &amp; FAQ</Link> or <Link href="/contact">contact the studio</Link>.
        </p>
      </section>
    </div>
  );
}
