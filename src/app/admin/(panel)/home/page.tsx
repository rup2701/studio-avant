import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { getSettings } from "@/lib/settings";
import { Flash } from "@/components/flash";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { removeWordsImage, saveFollowLinks, saveHome, saveHomeWork, saveWords } from "../../actions";
import { WordsImageUpload } from "./words-image-upload";

export const metadata: Metadata = { title: "Home & links" };

export default async function HomeAdminPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string; introLine?: string }> }) {
  const sp = await searchParams;
  const s = await getSettings();
  const links = [...s.followLinks];
  while (links.length < 6) links.push({ label: "", url: "" });
  const all = await db.select().from(products).orderBy(asc(products.homePosition), asc(products.position), asc(products.createdAt));
  const shown = all.filter((w) => w.showOnHome);
  const hidden = all.filter((w) => !w.showOnHome);
  const rows = [...shown, ...hidden];
  return (
    <div className="max-w-2xl">
      <h1 className="font-serif text-3xl">Home page &amp; footer links</h1>
      <div className="mt-4"><Flash msg={sp.msg} err={sp.err} /></div>
      <form action={saveHome} className="space-y-3">
        <h2 className="font-serif text-xl">Intro lines</h2>
        <p className="text-sm text-muted-foreground">
          The home page opens with the wordmark “Studio Avant”, “by {s.artistName}” (change the name on the About page), then these one or two lines about the work.
        </p>
        <div>
          <Label htmlFor="introLine">Intro line (200 characters at most)</Label>
          <Textarea id="introLine" name="introLine" rows={3} defaultValue={sp.introLine ?? s.introLine} className="mt-1" />
        </div>
        <Button type="submit">Save intro line</Button>
      </form>

      <section id="home-images" className="mt-10 space-y-3" aria-labelledby="home-images-h">
        <h2 id="home-images-h" className="font-serif text-xl">Images on the home page</h2>
        <p className="text-sm text-muted-foreground">
          Tick “Show on home” for the works to show (about six to nine works looks best). A featured work is shown at the full width of the column. Only published works appear. Use the arrows to change the order in which they flow down the page.
        </p>
        {rows.length === 0 ? (
          <p className="text-muted-foreground">There are no works yet.</p>
        ) : (
          <ul className="divide-y divide-border border-y border-border" data-testid="home-works-list">
            {rows.map((w, i) => (
              <li key={w.id} data-testid="home-work-row" data-shown={w.showOnHome ? "true" : "false"}>
                <form action={saveHomeWork} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                  <input type="hidden" name="id" value={w.id} />
                  <span className="min-w-48 flex-1">
                    <span className="font-medium">{w.name}</span>
                    {!w.published && <span className="ml-2 text-xs text-muted-foreground">Draft: not shown until published</span>}
                  </span>
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <input type="checkbox" name="showOnHome" defaultChecked={w.showOnHome} className="h-5 w-5" />
                    Show on home<span className="sr-only">: {w.name}</span>
                  </label>
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <input type="checkbox" name="featureOnHome" defaultChecked={w.featureOnHome && w.showOnHome} className="h-5 w-5" />
                    Feature full width<span className="sr-only">: {w.name}</span>
                  </label>
                  <Button type="submit" name="intent" value="save" size="sm" variant="outline" aria-label={`Save ${w.name}`}>Save</Button>
                  {w.showOnHome && (
                    <span className="flex gap-1">
                      <button type="submit" name="intent" value="up" className="min-h-9 min-w-9 border border-border hover:bg-muted disabled:opacity-30" disabled={i === 0} aria-label={`Move ${w.name} earlier on home`}>↑</button>
                      <button type="submit" name="intent" value="down" className="min-h-9 min-w-9 border border-border hover:bg-muted disabled:opacity-30" disabled={i === shown.length - 1} aria-label={`Move ${w.name} later on home`}>↓</button>
                    </span>
                  )}
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10 space-y-3" aria-labelledby="words-h">
        <h2 id="words-h" className="font-serif text-xl">Words</h2>
        <p className="text-sm text-muted-foreground">A few paragraphs about the kind of work you make and what inspires it. Leave a blank line between paragraphs. It sits below the images on the home page.</p>
        <form action={saveWords} className="space-y-3">
          <div>
            <Label htmlFor="wordsText">Words (5000 characters at most)</Label>
            <Textarea id="wordsText" name="wordsText" rows={12} defaultValue={s.wordsText} className="mt-1" />
          </div>
          <div>
            <Label htmlFor="wordsImageAlt">Description of the image beside the words (for screen readers)</Label>
            <Input id="wordsImageAlt" name="wordsImageAlt" defaultValue={s.wordsImageAlt} className="mt-1" />
          </div>
          <Button type="submit">Save words</Button>
        </form>
        <div className="space-y-3 border-t border-border pt-4">
          <p className="text-sm font-medium">Optional image beside the words</p>
          {s.wordsImageUrl ? (
            <div className="max-w-xs">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.wordsImageUrl} alt={s.wordsImageAlt} className="h-auto w-full bg-muted" data-testid="words-image-preview" />
              <form action={removeWordsImage} className="mt-2">
                <Button type="submit" variant="outline" size="sm">Remove the image</Button>
              </form>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No image. The words use the full text column.</p>
          )}
          <WordsImageUpload />
        </div>
      </section>

      <form action={saveFollowLinks} className="mt-10 space-y-3">
        <h2 className="font-serif text-xl">Follow links in the footer</h2>
        <p className="text-sm text-muted-foreground">Placeholder links until you add your own. Leave a row empty to remove it.</p>
        {links.map((l, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[12rem_1fr]">
            <div>
              <Label htmlFor={`label${i}`} className="text-xs">Label {i + 1}</Label>
              <Input id={`label${i}`} name={`label${i}`} defaultValue={l.label} className="mt-1" />
            </div>
            <div>
              <Label htmlFor={`url${i}`} className="text-xs">Web address {i + 1}</Label>
              <Input id={`url${i}`} name={`url${i}`} defaultValue={l.url} className="mt-1" placeholder="https://" />
            </div>
          </div>
        ))}
        <Button type="submit">Save links</Button>
      </form>
    </div>
  );
}
