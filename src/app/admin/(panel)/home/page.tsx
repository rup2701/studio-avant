import type { Metadata } from "next";
import { getSettings } from "@/lib/settings";
import { Flash } from "@/components/flash";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveFollowLinks, saveHome } from "../../actions";

export const metadata: Metadata = { title: "Home & links" };

export default async function HomeAdminPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string; introLine?: string }> }) {
  const sp = await searchParams;
  const s = await getSettings();
  const links = [...s.followLinks];
  while (links.length < 6) links.push({ label: "", url: "" });
  return (
    <div className="max-w-2xl">
      <h1 className="font-serif text-3xl">Home page &amp; footer links</h1>
      <div className="mt-4"><Flash msg={sp.msg} err={sp.err} /></div>
      <form action={saveHome} className="space-y-3">
        <h2 className="font-serif text-xl">Intro line</h2>
        <p className="text-sm text-muted-foreground">Shown after the artist&apos;s name at the top of the home page. Which works are published and their order are set on the Works page.</p>
        <div>
          <Label htmlFor="introLine">Intro line (200 characters at most)</Label>
          <Textarea id="introLine" name="introLine" rows={2} defaultValue={sp.introLine ?? s.introLine} className="mt-1" />
        </div>
        <Button type="submit">Save intro line</Button>
      </form>
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
