import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { gt, count } from "drizzle-orm";
import { isOwner } from "@/lib/auth";
import { signOutAction } from "../actions";
import { storageStatus } from "@/lib/storage";
import { db } from "@/db";
import { systemEvents } from "@/db/schema";
import { store } from "@/config/store";
import { AdminNav } from "./admin-nav";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: { default: "Owner area", template: "%s — Owner area" }, robots: { index: false, follow: false } };

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  if (!(await isOwner())) redirect("/admin/login");
  const storage = storageStatus();
  let failures = 0;
  try {
    const [{ n }] = await db
      .select({ n: count() })
      .from(systemEvents)
      .where(gt(systemEvents.createdAt, new Date(Date.now() - 7 * 24 * 3600 * 1000)));
    failures = n;
  } catch {}
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <p className="font-serif text-lg">
            {store.name} <span className="text-sm text-muted-foreground">· Owner area</span>
          </p>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/" className="underline underline-offset-4" target="_blank">View store</Link>
            <form action={signOutAction}>
              <button type="submit" className="min-h-11 underline underline-offset-4 hover:text-accent">Sign out</button>
            </form>
          </div>
        </div>
        <AdminNav />
      </header>
      <div className="mx-auto max-w-7xl px-4 py-6">
        {!storage.ok && (
          <p role="alert" className="mb-4 border-l-4 border-destructive bg-destructive/5 p-3 text-sm" data-testid="storage-warning">
            <strong>Photo storage is not set up.</strong> {storage.message} Uploads are refused until it is.
          </p>
        )}
        {failures > 0 && (
          <p role="alert" className="mb-4 border-l-4 border-accent bg-muted p-3 text-sm" data-testid="failure-alert">
            A shopper&apos;s checkout failed {failures === 1 ? "once" : `${failures} times`} in the last 7 days and no order was created.{" "}
            <Link href="/admin/status" className="underline">See what happened</Link>.
          </p>
        )}
        {children}
      </div>
    </div>
  );
}
