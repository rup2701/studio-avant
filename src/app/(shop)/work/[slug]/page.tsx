import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { availabilityOf, getNeighbours, getWorkBySlug } from "@/lib/queries";
import { isOwner } from "@/lib/auth";
import { store, saleStatusLabel } from "@/config/store";
import { WorkPurchase } from "@/components/work-purchase";
import { Placeholder, WorkGridList } from "@/components/work-card";
import { formatMoney } from "@/lib/utils";

type Params = { params: Promise<{ slug: string }>; searchParams?: Promise<{ from?: string | string[] }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const w = await getWorkBySlug(slug, { includeDraft: false });
  return { title: w ? w.product.name : "Work not found" };
}

export default async function WorkPage({ params, searchParams }: Params) {
  const { slug } = await params;
  const fromRaw = (await searchParams)?.from;
  const owner = await isOwner();
  const work = await getWorkBySlug(slug, { includeDraft: owner });
  if (!work) notFound();
  const { product: p, images, options, category, series, original, prints } = work;
  const av = availabilityOf(p);
  // Came from a series page (the link carries ?from=<series slug>): the back link returns there.
  const cameFromSeries = series && typeof fromRaw === "string" && fromRaw === series.slug ? series : null;
  const keep = cameFromSeries ? `?from=${encodeURIComponent(cameFromSeries.slug)}` : "";
  const { prev, next } = p.published ? await getNeighbours({ id: p.id, seriesId: p.seriesId }) : { prev: null, next: null };

  const details: [string, React.ReactNode][] = [];
  if (p.year) details.push(["Year", p.year]);
  if (p.medium) details.push(["Medium", p.medium]);
  if (p.sizeInches) details.push(["Size", p.sizeInches]);
  if (series) details.push(["Series", <Link key="s" className="underline underline-offset-4 hover:text-accent" href={`/series/${series.slug}`}>{series.title}</Link>]);
  details.push(["Category", <Link key="c" className="underline underline-offset-4 hover:text-accent" href={`/category/${category.slug}`}>{category.name}</Link>]);

  return (
    <div className="wide page-x pt-6 md:pt-10">
      {!p.published && (
        <p role="note" className="mb-4 border-l-4 border-accent bg-muted p-3 text-sm">
          Draft preview: only you can see this page while you are signed in as the owner. Shoppers get “not found”.
        </p>
      )}
      <p className="mb-4 text-sm">
        <Link
          href={cameFromSeries ? `/series/${cameFromSeries.slug}` : "/work"}
          className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-accent"
          data-testid="back-to-work"
        >
          {cameFromSeries ? `← ${cameFromSeries.title}` : "← All work"}
        </Link>
      </p>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-12 xl:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
        <div className="space-y-4" data-testid="work-images">
          {images.length === 0 ? (
            <Placeholder aspect="4 / 5" />
          ) : (
            images.map((img, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={img.id}
                src={img.url}
                alt={img.alt}
                width={img.width || undefined}
                height={img.height || undefined}
                loading={i === 0 ? "eager" : "lazy"}
                className="h-auto w-full bg-muted"
              />
            ))
          )}
        </div>

        <div className="lg:sticky lg:top-6 lg:self-start">
          <p className="text-sm text-muted-foreground">
            <Link href={`/category/${category.slug}`} className="hover:text-accent hover:underline">{category.name}</Link>
          </p>
          <h1 className="mt-1 font-serif text-3xl leading-tight md:text-4xl">{p.name}</h1>

          <dl className="mt-5 grid grid-cols-[6rem_1fr] gap-x-4 gap-y-1 text-sm" data-testid="work-details">
            {details.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>

          {p.note && <p className="mt-5 whitespace-pre-line text-base">{p.note}</p>}

          {p.description.trim() && (
            <section aria-labelledby="about-work" className="mt-6" data-testid="about-work">
              <h2 id="about-work" className="font-serif text-xl">About this work</h2>
              <p className="mt-2 whitespace-pre-line text-base leading-relaxed">{p.description}</p>
            </section>
          )}

          {original && (
            <p className="mt-4 text-sm">
              From the original painting{" "}
              <Link href={`/work/${original.slug}`} className="underline underline-offset-4 hover:text-accent">{original.name}</Link>.
            </p>
          )}

          <div className="mt-6 border-t border-border pt-2">
            {av === "available" && p.priceCents != null ? (
              <WorkPurchase
                productId={p.id}
                slug={p.slug}
                name={p.name}
                imageUrl={images[0]?.url ?? null}
                basePriceCents={p.priceCents}
                options={options}
                personalization={{ enabled: p.personalizationEnabled, maxLength: p.personalizationMaxLength }}
                maxQuantity={Math.min(store.maxQuantityPerLine, p.stock)}
              />
            ) : (
              <div className="mt-4" data-testid="work-status">
                <p className="font-serif text-2xl" data-testid="status-text">
                  {av === "sold_out" ? "Sold out" : saleStatusLabel(av)}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {av === "sold" || av === "sold_out"
                    ? "This work has found its home and can no longer be bought."
                    : av === "private_collection"
                      ? "This work is in a private collection and cannot be bought."
                      : "This work is shown for the portfolio and is not for sale."}{" "}
                  <Link href="/commissions" className="underline underline-offset-4">Ask about a commission</Link>.
                </p>
              </div>
            )}
          </div>

          {p.published && (p.priceCents != null && av === "available") && (
            <p className="mt-4 text-sm text-muted-foreground">
              Shipping is a flat {formatMoney(store.shipping.flatCents)} estimate (demo), free over {formatMoney(store.shipping.freeOverCents)}.{" "}
              <Link href="/returns" className="underline underline-offset-4">Returns &amp; refunds</Link>
            </p>
          )}

          {(prev || next) && (
            <nav aria-label={series ? `More from ${series.title}` : "More work"} className="mt-8 flex justify-between gap-4 border-t border-border pt-4 text-sm">
              {prev ? (
                <Link href={`/work/${prev.slug}${keep}`} rel="prev" className="min-h-11 hover:text-accent">← Previous<span className="sr-only">: {prev.name}</span></Link>
              ) : <span />}
              {next ? (
                <Link href={`/work/${next.slug}${keep}`} rel="next" className="min-h-11 text-right hover:text-accent">Next →<span className="sr-only">: {next.name}</span></Link>
              ) : <span />}
            </nav>
          )}
        </div>
      </div>

      {prints.length > 0 && (
        <section aria-labelledby="prints-heading" className="mt-14">
          <h2 id="prints-heading" className="mb-4 font-serif text-2xl">Prints of this painting</h2>
          <WorkGridList works={prints} />
        </section>
      )}
    </div>
  );
}
