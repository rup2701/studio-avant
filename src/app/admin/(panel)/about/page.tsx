import type { Metadata } from "next";
import { getSettings } from "@/lib/settings";
import { Flash } from "@/components/flash";
import { Placeholder } from "@/components/work-card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { removePortrait, saveAbout } from "../../actions";
import { PortraitUpload } from "./portrait-upload";

export const metadata: Metadata = { title: "About page" };

export default async function AboutAdminPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const sp = await searchParams;
  const s = await getSettings();
  return (
    <div className="max-w-2xl">
      <h1 className="font-serif text-3xl">About page</h1>
      <div className="mt-4"><Flash msg={sp.msg} err={sp.err} /></div>
      <section aria-labelledby="portrait-h" className="mb-8">
        <h2 id="portrait-h" className="font-serif text-xl">Portrait</h2>
        <div className="mt-2 max-w-[12rem]">
          {s.portraitUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={s.portraitUrl} alt={s.portraitAlt} className="h-auto w-full bg-muted" />
          ) : (
            <Placeholder aspect="4 / 5" label="No portrait yet" />
          )}
        </div>
        <div className="mt-3"><PortraitUpload /></div>
        {s.portraitUrl && (
          <form action={removePortrait} className="mt-2">
            <Button type="submit" variant="ghost" size="sm">Remove portrait</Button>
          </form>
        )}
      </section>
      <form action={saveAbout} className="space-y-4">
        <div>
          <Label htmlFor="artistName">Artist&apos;s name</Label>
          <Input id="artistName" name="artistName" defaultValue={s.artistName} className="mt-1" />
        </div>
        <div>
          <Label htmlFor="statement">Artist&apos;s statement</Label>
          <Textarea id="statement" name="statement" rows={8} defaultValue={s.statement} className="mt-1" />
        </div>
        <div>
          <Label htmlFor="bio">Short bio</Label>
          <Textarea id="bio" name="bio" rows={4} defaultValue={s.bio} className="mt-1" />
        </div>
        <div>
          <Label htmlFor="portraitAlt">Portrait alt text</Label>
          <Input id="portraitAlt" name="portraitAlt" defaultValue={s.portraitAlt} className="mt-1" />
        </div>
        <Button type="submit">Save About page</Button>
      </form>
    </div>
  );
}
