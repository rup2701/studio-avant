import Link from "next/link";
import type { Availability, WorkCard as Work } from "@/lib/queries";
import { formatMoney } from "@/lib/utils";
import { saleStatusLabel } from "@/config/store";

export function Placeholder({ aspect = "4 / 5", label = "No image yet" }: { aspect?: string; label?: string }) {
  return (
    <div
      role="img"
      aria-label={label}
      className="flex w-full items-center justify-center bg-muted text-xs tracking-wide text-muted-foreground"
      style={{ aspectRatio: aspect }}
    >
      <span aria-hidden="true">{label}</span>
    </div>
  );
}

export function statusMark(a: Availability, priceCents: number | null, fromPrice = false) {
  if (a === "available") {
    return priceCents != null ? `Available · ${fromPrice ? "from " : ""}${formatMoney(priceCents)}` : "Available";
  }
  if (a === "sold_out") return "Sold out";
  return saleStatusLabel(a);
}

export function WorkCardItem({ work, priority = false, fromSeries }: { work: Work; priority?: boolean; fromSeries?: string }) {
  const mark = statusMark(work.availability, work.priceCents, work.fromPrice);
  return (
    <li className="min-w-0">
      <Link href={fromSeries ? `/work/${work.slug}?from=${encodeURIComponent(fromSeries)}` : `/work/${work.slug}`} className="group block" data-testid="work-card">
        {work.coverUrl ? (
          <div className="w-full overflow-hidden bg-muted" style={{ aspectRatio: `${work.coverWidth} / ${work.coverHeight}` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={work.coverUrl}
              alt={work.coverAlt}
              width={work.coverWidth}
              height={work.coverHeight}
              loading={priority ? "eager" : "lazy"}
              className="h-full w-full object-contain transition-opacity group-hover:opacity-90"
            />
          </div>
        ) : (
          <Placeholder aspect="4 / 5" />
        )}
        <div className="pt-2 pb-1 leading-snug">
          <p className="truncate font-serif text-[0.95rem] group-hover:underline underline-offset-4">
            {work.name}
            {work.year ? <span className="text-muted-foreground">, {work.year}</span> : null}
          </p>
          <p
            className={
              "truncate text-xs " + (work.availability === "available" ? "text-accent" : "text-muted-foreground")
            }
            data-testid="status-mark"
          >
            {mark}
          </p>
        </div>
      </Link>
    </li>
  );
}

export function WorkGridList({ works, contained = false, fromSeries }: { works: Work[]; contained?: boolean; fromSeries?: string }) {
  return (
    <ul
      className={
        contained
          ? "grid grid-cols-2 items-start gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4"
          : "grid grid-cols-2 items-start gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
      }
      data-testid="work-grid"
    >
      {works.map((w, i) => (
        <WorkCardItem key={w.id} work={w} priority={i < 4} fromSeries={fromSeries} />
      ))}
    </ul>
  );
}
