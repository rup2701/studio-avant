import type { Metadata } from "next";
import { getSettings } from "@/lib/settings";
import { Placeholder } from "@/components/work-card";

export const metadata: Metadata = { title: "About" };

export default async function AboutPage() {
  const s = await getSettings();
  return (
    <div className="reading page-x pt-8 md:pt-12">
      <h1 className="font-serif text-3xl md:text-4xl">About {s.artistName}</h1>
      <div className="mt-8 max-w-sm">
        {s.portraitUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.portraitUrl} alt={s.portraitAlt} className="h-auto w-full bg-muted" data-testid="portrait" />
        ) : (
          <Placeholder aspect="4 / 5" label="Portrait placeholder" />
        )}
      </div>
      <section aria-labelledby="statement-h" className="mt-8">
        <h2 id="statement-h" className="font-serif text-xl">Artist&apos;s statement</h2>
        <p className="mt-2 whitespace-pre-line text-lg leading-relaxed">{s.statement}</p>
      </section>
      <section aria-labelledby="bio-h" className="mt-8">
        <h2 id="bio-h" className="font-serif text-xl">Bio</h2>
        <p className="mt-2 whitespace-pre-line leading-relaxed text-muted-foreground">{s.bio}</p>
      </section>
    </div>
  );
}
