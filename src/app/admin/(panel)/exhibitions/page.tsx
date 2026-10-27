import type { Metadata } from "next";
import { asc, desc } from "drizzle-orm";
import { db } from "@/db";
import { exhibitions } from "@/db/schema";
import { Flash } from "@/components/flash";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addEntry, deleteEntry, updateEntry } from "../../actions";

export const metadata: Metadata = { title: "Exhibitions & press" };

function EntryFields({ id, year, kind, text }: { id: string; year: number | string; kind: string; text: string }) {
  return (
    <>
      <div className="w-24">
        <Label htmlFor={`y-${id}`} className="text-xs">Year</Label>
        <Input id={`y-${id}`} name="year" inputMode="numeric" defaultValue={year} className="mt-1" />
      </div>
      <div className="w-36">
        <Label htmlFor={`k-${id}`} className="text-xs">Type</Label>
        <Select id={`k-${id}`} name="kind" defaultValue={kind} className="mt-1">
          <option value="exhibition">Exhibition</option>
          <option value="award">Award</option>
          <option value="press">Press</option>
        </Select>
      </div>
      <div className="min-w-56 flex-1">
        <Label htmlFor={`t-${id}`} className="text-xs">Entry</Label>
        <Input id={`t-${id}`} name="text" defaultValue={text} className="mt-1" />
      </div>
    </>
  );
}

export default async function ExhibitionsAdminPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const sp = await searchParams;
  const rows = await db.select().from(exhibitions).orderBy(desc(exhibitions.year), asc(exhibitions.createdAt));
  return (
    <div className="max-w-4xl">
      <h1 className="font-serif text-3xl">Exhibitions &amp; press</h1>
      <p className="mt-1 text-sm text-muted-foreground">A plain list by year. Add, edit and remove entries.</p>
      <div className="mt-4"><Flash msg={sp.msg} err={sp.err} /></div>
      {rows.length === 0 && <p className="mt-4 text-muted-foreground">No entries yet. Add the first one below.</p>}
      <ul className="mt-4 space-y-3">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-end gap-2" data-testid="entry-row">
            <form action={updateEntry} className="flex flex-1 flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={r.id} />
              <EntryFields id={r.id} year={r.year} kind={r.kind} text={r.text} />
              <Button type="submit" variant="outline" size="sm">Save</Button>
            </form>
            <form action={deleteEntry}>
              <input type="hidden" name="id" value={r.id} />
              <Button type="submit" variant="ghost" size="sm" aria-label={`Remove entry: ${r.text}`}>Remove</Button>
            </form>
          </li>
        ))}
      </ul>
      <form action={addEntry} className="mt-8 flex flex-wrap items-end gap-2 border-t border-border pt-6" aria-label="Add an entry">
        <EntryFields id="new" year={new Date().getFullYear()} kind="exhibition" text="" />
        <Button type="submit">Add entry</Button>
      </form>
    </div>
  );
}
