import type { Metadata } from "next";
import { asc, sql } from "drizzle-orm";
import { db } from "@/db";
import { series } from "@/db/schema";
import { Flash } from "@/components/flash";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addSeries, deleteSeries, moveSeries, updateSeries } from "../../actions";

export const metadata: Metadata = { title: "Series" };

export default async function SeriesAdminPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string; title?: string; text?: string }> }) {
  const sp = await searchParams;
  const rows = await db
    .select({
      id: series.id,
      title: series.title,
      slug: series.slug,
      text: series.text,
      n: sql<number>`(select count(*)::int from "products" as p where p."series_id" = "series"."id")`,
    })
    .from(series)
    .orderBy(asc(series.position), asc(series.title));
  return (
    <div className="max-w-3xl">
      <h1 className="font-serif text-3xl">Series</h1>
      <p className="mt-1 text-sm text-muted-foreground">A series groups works. It is the same thing as a collection and has its own page listing its works.</p>
      <div className="mt-4"><Flash msg={sp.msg} err={sp.err} /></div>
      {rows.length === 0 && <p className="mt-6 text-muted-foreground">No series yet. Add one below.</p>}
      <ul className="mt-6 space-y-6">
        {rows.map((s, i) => (
          <li key={s.id} className="border border-border p-4" data-testid="series-row">
            <form action={updateSeries} className="space-y-3">
              <input type="hidden" name="id" value={s.id} />
              <div>
                <Label htmlFor={`st-${s.id}`}>Title</Label>
                <Input id={`st-${s.id}`} name="title" defaultValue={s.title} className="mt-1" />
              </div>
              <div>
                <Label htmlFor={`sx-${s.id}`}>Short text</Label>
                <Textarea id={`sx-${s.id}`} name="text" defaultValue={s.text} rows={3} className="mt-1" />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" size="sm">Save</Button>
                <span className="text-sm text-muted-foreground">{s.n} {s.n === 1 ? "work" : "works"} · /series/{s.slug}</span>
              </div>
            </form>
            <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
              <form action={moveSeries.bind(null, s.id, "up")}>
                <button className="min-h-9 min-w-9 border border-border hover:bg-muted disabled:opacity-30" disabled={i === 0} aria-label={`Move ${s.title} up`}>↑</button>
              </form>
              <form action={moveSeries.bind(null, s.id, "down")}>
                <button className="min-h-9 min-w-9 border border-border hover:bg-muted disabled:opacity-30" disabled={i === rows.length - 1} aria-label={`Move ${s.title} down`}>↓</button>
              </form>
              <form action={deleteSeries}>
                <input type="hidden" name="id" value={s.id} />
                <Button type="submit" variant="ghost" size="sm" aria-label={`Delete ${s.title}`}>Delete</Button>
              </form>
            </div>
          </li>
        ))}
      </ul>
      <form action={addSeries} className="mt-8 space-y-3 border-t border-border pt-6" aria-label="Add a series">
        <h2 className="font-serif text-xl">Add a series</h2>
        <div>
          <Label htmlFor="new-series-title">Title</Label>
          <Input id="new-series-title" name="title" defaultValue={sp.title ?? ""} className="mt-1" />
        </div>
        <div>
          <Label htmlFor="new-series-text">Short text</Label>
          <Textarea id="new-series-text" name="text" defaultValue={sp.text ?? ""} rows={3} className="mt-1" />
        </div>
        <Button type="submit">Add series</Button>
      </form>
    </div>
  );
}
