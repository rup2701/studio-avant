import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { emailSignups } from "@/db/schema";
import { isOwner } from "@/lib/auth";

/** Newsletter subscribers as a CSV file, newest first. Owner only. */
export async function GET() {
  if (!(await isOwner())) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const rows = await db.select().from(emailSignups).orderBy(desc(emailSignups.createdAt));
  const cell = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v).replace(/"/g, '""');
  const lines = ["email,subscribed_at", ...rows.map((r) => `"${cell(r.email)}","${r.createdAt.toISOString()}"`)];
  return new NextResponse(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="newsletter-subscribers.csv"',
      "Cache-Control": "no-store",
    },
  });
}
