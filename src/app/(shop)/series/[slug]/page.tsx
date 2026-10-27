import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getSeriesBySlug, listPublishedWorks } from "@/lib/queries";
import { WorkGridList } from "@/components/work-card";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const s = await getSeriesBySlug(slug);
  return { title: s ? s.title : "Series not found" };
}

export default async function SeriesPage({ params }: Params) {
  const { slug } = await params;
  const s = await getSeriesBySlug(slug);
  if (!s) notFound();
  const works = await listPublishedWorks({ seriesId: s.id });
  return (
    <div className="wide page-x pt-8 md:pt-12">
      <header className="mb-8 max-w-3xl">
        <p className="text-sm text-muted-foreground">Series</p>
        <h1 className="font-serif text-3xl md:text-4xl">{s.title}</h1>
        {s.text && <p className="mt-3 whitespace-pre-line text-lg text-muted-foreground">{s.text}</p>}
      </header>
      {works.length === 0 ? (
        <p className="text-muted-foreground">There are no works from this series to show right now.</p>
      ) : (
        <WorkGridList works={works} />
      )}
    </div>
  );
}
