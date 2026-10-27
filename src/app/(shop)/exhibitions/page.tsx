import type { Metadata } from "next";
import { desc, asc } from "drizzle-orm";
import { db } from "@/db";
import { exhibitions } from "@/db/schema";

export const metadata: Metadata = { title: "Exhibitions and press" };

const KIND: Record<string, string> = { exhibition: "Exhibition", award: "Award", press: "Press" };

export default async function ExhibitionsPage() {
  const rows = await db.select().from(exhibitions).orderBy(desc(exhibitions.year), asc(exhibitions.createdAt));
  const years = [...new Set(rows.map((r) => r.year))];
  return (
    <div className="reading page-x pt-8 md:pt-12">
      <h1 className="font-serif text-3xl md:text-4xl">Exhibitions &amp; press</h1>
      <p className="mt-2 text-muted-foreground">Exhibitions, awards and press, by year. (Fictional sample entries.)</p>
      {rows.length === 0 ? (
        <p className="mt-10 text-muted-foreground">Nothing is listed yet.</p>
      ) : (
        <div className="mt-10 space-y-8">
          {years.map((y) => (
            <section key={y} aria-labelledby={`y-${y}`}>
              <h2 id={`y-${y}`} className="font-serif text-xl">{y}</h2>
              <ul className="mt-2 divide-y divide-border border-y border-border">
                {rows.filter((r) => r.year === y).map((r) => (
                  <li key={r.id} className="py-2">
                    <span className="mr-3 inline-block w-24 text-sm text-muted-foreground">{KIND[r.kind] ?? r.kind}</span>
                    {r.text}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
