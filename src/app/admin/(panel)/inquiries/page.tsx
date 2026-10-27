import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { commissionInquiries } from "@/db/schema";
import { Flash } from "@/components/flash";
import { Button } from "@/components/ui/button";
import { deleteInquiry } from "../../actions";

export const metadata: Metadata = { title: "Commission inquiries" };

export default async function InquiriesPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const sp = await searchParams;
  const rows = await db.select().from(commissionInquiries).orderBy(desc(commissionInquiries.createdAt));
  return (
    <div className="max-w-3xl">
      <h1 className="font-serif text-3xl">Commission inquiries <span className="text-lg text-muted-foreground">({rows.length})</span></h1>
      <p className="mt-1 text-sm text-muted-foreground">Sent from the Commissions page. Nothing is emailed; reply to the address given.</p>
      <div className="mt-4"><Flash msg={sp.msg} err={sp.err} /></div>
      {rows.length === 0 ? (
        <p className="mt-6 text-muted-foreground" data-testid="inquiries-empty">No inquiries yet. They appear here when a visitor uses the Commissions page.</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {rows.map((r) => (
            <li key={r.id} className="border border-border p-4" data-testid="inquiry-row">
              <p className="font-medium">{r.name} · <a href={`mailto:${r.email}`} className="underline">{r.email}</a></p>
              <p className="text-xs text-muted-foreground">{r.createdAt.toLocaleString("en-US")}</p>
              <p className="mt-2 whitespace-pre-line">{r.idea}</p>
              <p className="mt-2 text-sm text-muted-foreground">Rough size: {r.roughSize || "not given"} · Budget: {r.budget || "not given"}</p>
              <form action={deleteInquiry} className="mt-2">
                <input type="hidden" name="id" value={r.id} />
                <Button type="submit" variant="ghost" size="sm">Remove</Button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
