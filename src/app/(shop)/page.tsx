import Link from "next/link";
import { listHomeWorks } from "@/lib/queries";
import { getSettings } from "@/lib/settings";
import { store } from "@/config/store";
import { HomeImages } from "@/components/home-images";
import { EmailSignup } from "@/components/email-signup";

export default async function HomePage() {
  const [works, s] = await Promise.all([listHomeWorks(), getSettings()]);
  const paragraphs = s.wordsText.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return (
    <div className="wide page-x">
      <div className="contained">
        <section aria-label="Introduction" className="pt-12 pb-14 md:pt-20 md:pb-24" data-testid="intro">
          <h1 className="font-serif text-5xl leading-none tracking-wide md:text-7xl">{store.name}</h1>
          <p className="mt-3 font-serif text-xl text-muted-foreground md:text-2xl" data-testid="intro-by">
            by {s.artistName}
          </p>
          <p className="mt-8 max-w-2xl text-lg leading-relaxed" data-testid="intro-line">{s.introLine}</p>
        </section>

        <section aria-label="Selected work" data-testid="home-work-section">
          {works.length === 0 ? (
            <p className="py-16 text-muted-foreground">New work is on its way. Please come back soon.</p>
          ) : (
            <HomeImages works={works} />
          )}
          <p className="mt-14 md:mt-20">
            <Link href="/work" className="underline underline-offset-4 hover:text-accent" data-testid="see-all-work">
              See all work
            </Link>
          </p>
        </section>

        {paragraphs.length > 0 && (
          <section
            aria-label="About the work"
            className={`mt-24 grid gap-10 md:mt-32 ${s.wordsImageUrl ? "md:grid-cols-12 md:items-start" : ""}`}
            data-testid="home-words"
          >
            <div className={`space-y-5 text-lg leading-relaxed ${s.wordsImageUrl ? "md:col-span-7" : "max-w-2xl"}`}>
              {paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
            {s.wordsImageUrl && (
              <div className="md:col-span-4 md:col-start-9">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.wordsImageUrl} alt={s.wordsImageAlt} className="h-auto w-full bg-muted" data-testid="words-image" />
              </div>
            )}
          </section>
        )}

        <div className="mt-24 mb-4 md:mt-32">
          <EmailSignup />
        </div>
      </div>
    </div>
  );
}
