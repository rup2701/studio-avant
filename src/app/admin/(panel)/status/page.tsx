import type { Metadata } from "next";
import { getStatus } from "@/lib/status";

export const metadata: Metadata = { title: "Status" };

export default async function StatusPage() {
  const s = await getStatus();
  const row = (ok: boolean, label: string, msg: string) => (
    <li className="flex gap-3 py-3">
      <span className={`mt-0.5 inline-block min-w-14 text-sm font-medium ${ok ? "" : "text-destructive"}`}>{ok ? "OK" : "Problem"}</span>
      <span><strong>{label}.</strong> {msg}</span>
    </li>
  );
  return (
    <div className="max-w-3xl">
      <h1 className="font-serif text-3xl">Status</h1>
      <p className="mt-1 text-sm text-muted-foreground">A quick check you can open any time to see whether the store is healthy.</p>
      <ul className="mt-6 divide-y divide-border border-y border-border" data-testid="status-list">
        {row(s.database.ok, "Database", s.database.message)}
        {row(s.storage.ok, "Photo storage", s.storage.message)}
      </ul>
      <h2 className="mt-8 font-serif text-xl">Recent problems</h2>
      {s.events.length === 0 ? (
        <p className="mt-2 text-muted-foreground">Nothing has gone wrong in the last 14 days.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border border-y border-border" data-testid="events">
          {s.events.map((e) => (
            <li key={e.id} className="py-2 text-sm">
              <span className="text-muted-foreground">{e.createdAt.toLocaleString("en-US")}</span> — {e.message}
              <span className="block text-muted-foreground">What to try: check the Database line above, then try a test order. If it keeps failing, contact whoever hosts the store.</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-8 text-xs text-muted-foreground">Template: {s.template}</p>
    </div>
  );
}
