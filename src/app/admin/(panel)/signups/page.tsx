import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { emailSignups } from "@/db/schema";
import { Flash } from "@/components/flash";
import { Button } from "@/components/ui/button";
import { deleteSignup } from "../../actions";

export const metadata: Metadata = { title: "Email sign-ups" };

export default async function SignupsPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const sp = await searchParams;
  const rows = await db.select().from(emailSignups).orderBy(desc(emailSignups.createdAt));
  return (
    <div className="max-w-2xl">
      <h1 className="font-serif text-3xl">Email sign-ups <span className="text-lg text-muted-foreground">({rows.length})</span></h1>
      <p className="mt-1 text-sm text-muted-foreground">Addresses left in the home page strip. Nothing is sent from this store.</p>
      <div className="mt-4"><Flash msg={sp.msg} err={sp.err} /></div>
      {rows.length === 0 ? (
        <p className="mt-6 text-muted-foreground" data-testid="signups-empty">No sign-ups yet.</p>
      ) : (
        <ul className="mt-6 divide-y divide-border border-y border-border">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-2" data-testid="signup-row">
              <span><span className="select-all">{r.email}</span> <span className="text-xs text-muted-foreground">{r.createdAt.toLocaleDateString("en-US")}</span></span>
              <form action={deleteSignup}>
                <input type="hidden" name="id" value={r.id} />
                <Button type="submit" variant="ghost" size="sm" aria-label={`Remove ${r.email}`}>Remove</Button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
