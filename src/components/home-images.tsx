import Link from "next/link";
import type { WorkCard } from "@/lib/queries";
import { formatMoney, excerpt } from "@/lib/utils";
import { Placeholder } from "./work-card";

/**
 * Placement slots for the asymmetric arrangement on the home page. Slots repeat in order; a work
 * marked "feature on home" always takes the full width of the column. Classes are written out in
 * full so Tailwind can see them. Mobile uses a 12-column grid too, with a few narrower, indented items.
 */
const SLOTS = [
  "col-span-12 md:col-span-8 md:col-start-1",
  "col-span-9 col-start-4 md:col-span-4 md:col-start-9 md:self-end",
  "col-span-12 md:col-span-4 md:col-start-2",
  "col-span-10 md:col-span-6 md:col-start-7 md:mt-20",
  "col-span-12 md:col-span-6 md:col-start-1",
  "col-span-9 col-start-4 md:col-span-4 md:col-start-9 md:mt-28",
];
const FEATURED = "col-span-12";

/** "30 × 40 in" → "30 / 40"; anything else falls back to a portrait-ish placeholder. */
function placeholderAspect(size: string) {
  const m = size.match(/(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)/);
  return m ? `${m[1]} / ${m[2]}` : "4 / 5";
}

/** Home mark: the price when the work is for sale, "Sold" when sold, nothing otherwise. */
function homeMark(w: WorkCard) {
  if (w.availability === "available" && w.priceCents != null) return `${w.fromPrice ? "from " : ""}${formatMoney(w.priceCents)}`;
  if (w.availability === "sold" || w.availability === "sold_out") return "Sold";
  return null;
}

export function HomeImages({ works }: { works: WorkCard[] }) {
  let slot = 0;
  return (
    <ul className="grid grid-cols-12 items-start gap-x-4 gap-y-14 md:gap-x-6 md:gap-y-24" data-testid="home-images">
      {works.map((w, i) => {
        const featured = w.featureOnHome;
        const mark = homeMark(w);
        const blurb = excerpt(w.description);
        const cls = featured ? FEATURED : SLOTS[slot++ % SLOTS.length];
        return (
          <li key={w.id} className={`min-w-0 ${cls}`} data-featured={featured ? "true" : "false"}>
            <Link href={`/work/${w.slug}`} className="group block" data-testid="home-work">
              {w.coverUrl ? (
                <div className="w-full bg-muted" style={{ aspectRatio: `${w.coverWidth} / ${w.coverHeight}` }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={w.coverUrl}
                    alt={w.coverAlt}
                    width={w.coverWidth}
                    height={w.coverHeight}
                    loading={i < 2 ? "eager" : "lazy"}
                    className="h-full w-full object-contain transition-opacity group-hover:opacity-90"
                  />
                </div>
              ) : (
                <Placeholder aspect={placeholderAspect(w.sizeInches)} />
              )}
              <p className="pt-2 font-serif text-sm leading-snug text-muted-foreground group-hover:text-foreground group-hover:underline underline-offset-4">
                {w.name}
                {w.year ? `, ${w.year}` : ""}
                {mark && (
                  <span className={`ml-2 font-sans text-xs ${w.availability === "available" ? "text-accent" : "text-muted-foreground"}`} data-testid="home-mark">
                    {mark}
                  </span>
                )}
              </p>
              {blurb && (
                <p className="pt-1 text-sm leading-snug text-muted-foreground" data-testid="home-excerpt">
                  {blurb}
                </p>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
