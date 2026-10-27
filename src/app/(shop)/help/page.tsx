import Link from "next/link";
import type { Metadata } from "next";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { formatMoney } from "@/lib/utils";
import { store } from "@/config/store";

export const metadata: Metadata = { title: "Help & FAQ" };

const groups: { id: string; title: string; items: { q: string; a: React.ReactNode }[] }[] = [
  {
    id: "orders",
    title: "Orders and shipping",
    items: [
      {
        q: "How much does shipping cost?",
        a: `Shipping is a demo estimate: a flat ${formatMoney(store.shipping.flatCents)}, and free when your subtotal is over ${formatMoney(store.shipping.freeOverCents)}. No tax is calculated.`,
      },
      { q: "Where do you ship?", a: `The demo checkout accepts addresses in ${store.countries.join(", ")}.` },
      { q: "Can I buy an original painting more than once?", a: "No. An original is one of a kind. Once it is bought it shows as Sold everywhere and cannot be bought again, even by two people at the same moment." },
      { q: "What are the quantity limits?", a: `You can buy up to ${store.maxQuantityPerLine} of a print at once. An original is limited to one.` },
    ],
  },
  {
    id: "returns",
    title: "Returns",
    items: [
      {
        q: "Can I return a work?",
        a: (
          <>
            Yes, within {store.returnsWindowDays} days of delivery, in the condition you received it. Read the full{" "}
            <Link href="/returns" className="underline underline-offset-2">returns &amp; refunds policy</Link>.
          </>
        ),
      },
      { q: "How are originals and prints treated differently?", a: "Originals are packed and insured, and should be returned the same way. Prints must come back flat and undamaged in a rigid mailer." },
    ],
  },
  {
    id: "personalization",
    title: "Personalization",
    items: [
      { q: "Can I personalize a painting or print?", a: "Paintings and prints are not personalized. If an item offers an optional text field, it says so on its page, with a character limit. Personalized pieces are final sale unless they arrive damaged or incorrect." },
      { q: "Can I ask for something made just for me?", a: <>Yes, see <Link href="/commissions" className="underline underline-offset-2">Commissions</Link>.</> },
    ],
  },
  {
    id: "care",
    title: "Care",
    items: [
      { q: "How should I look after an original painting?", a: "Hang it out of direct sunlight and away from heat and damp. Dust with a soft dry brush. Do not use water or cleaning products." },
      { q: "How should I look after a print?", a: "Frame it behind glass or acrylic with an acid-free mount. Keep it out of direct sunlight." },
    ],
  },
  {
    id: "demo",
    title: "This demo",
    items: [
      { q: "Is this a real store?", a: "No. Studio Avant is a demo. The artist, works and prices are fictional samples." },
      { q: "Will I be charged?", a: "No. Checkout is simulated. No payment details are asked for or collected, no email is sent and nothing ships." },
      { q: "Why do you list payment methods?", a: "They are the methods planned for launch, shown as text for demonstration only." },
    ],
  },
];

export default function HelpPage() {
  return (
    <div className="reading page-x pt-8 md:pt-12">
      <h1 className="font-serif text-3xl md:text-4xl">Help &amp; FAQ</h1>
      <p className="mt-2 text-muted-foreground">Answers to common questions. Select a question to read the answer.</p>
      {groups.map((g) => (
        <section key={g.id} aria-labelledby={`faq-${g.id}`} className="mt-10">
          <h2 id={`faq-${g.id}`} className="font-serif text-xl">{g.title}</h2>
          <Accordion type="single" collapsible className="mt-2 border-t border-border">
            {g.items.map((it, i) => (
              <AccordionItem key={i} value={`${g.id}-${i}`}>
                <AccordionTrigger>{it.q}</AccordionTrigger>
                <AccordionContent>{it.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </section>
      ))}
      <p className="mt-12">
        Still stuck? <Link href="/contact" className="underline underline-offset-4">Contact the studio</Link>.
      </p>
    </div>
  );
}
