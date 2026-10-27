import { listPublishedWorks, visibleSeries } from "@/lib/queries";
import { getSettings } from "@/lib/settings";
import { FilterableWorkGrid } from "@/components/work-grid";
import { EmailSignup } from "@/components/email-signup";

export default async function HomePage() {
  const [works, series, settings] = await Promise.all([listPublishedWorks(), visibleSeries(), getSettings()]);
  return (
    <>
      <div className="wide page-x pt-8 md:pt-12">
        <h1 className="mb-6 max-w-4xl font-serif text-2xl leading-snug md:mb-8 md:text-3xl" data-testid="intro">
          <span>{settings.artistName}</span>
          <span className="text-muted-foreground"> — {settings.introLine}</span>
        </h1>
        {works.length === 0 ? (
          <p className="py-16 text-muted-foreground">New work is on its way. Please come back soon.</p>
        ) : (
          <FilterableWorkGrid works={works} series={series.map((s) => ({ id: s.id, title: s.title }))} />
        )}
      </div>
      <EmailSignup />
    </>
  );
}
