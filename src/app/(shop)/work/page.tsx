import type { Metadata } from "next";
import { listPublishedWorks, visibleSeries } from "@/lib/queries";
import { FilterableWorkGrid } from "@/components/work-grid";

export const metadata: Metadata = { title: "Work" };

export default async function WorkIndexPage() {
  const [works, series] = await Promise.all([listPublishedWorks(), visibleSeries()]);
  return (
    <div className="wide page-x pt-8 md:pt-12">
      <div className="contained">
        <h1 className="mb-6 font-serif text-3xl md:mb-8 md:text-4xl">Work</h1>
        {works.length === 0 ? (
          <p className="py-16 text-muted-foreground">New work is on its way. Please come back soon.</p>
        ) : (
          <FilterableWorkGrid works={works} series={series.map((s) => ({ id: s.id, title: s.title }))} />
        )}
      </div>
    </div>
  );
}
