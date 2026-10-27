import Link from "next/link";
import type { Metadata } from "next";
import { and, asc, eq, ilike, inArray } from "drizzle-orm";
import { db } from "@/db";
import { categories, productImages, products } from "@/db/schema";
import { Flash } from "@/components/flash";
import { buttonVariants } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/utils";
import { SALE_STATUSES, saleStatusLabel } from "@/config/store";
import { moveWork } from "../actions";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Works" };

type SP = Promise<{ q?: string; category?: string; status?: string; msg?: string; err?: string }>;

export default async function AdminWorks({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const category = sp.category ?? "";
  const status = sp.status ?? "";
  const filtered = !!(q || category || status);

  const conds = [];
  if (q) conds.push(ilike(products.name, `%${q.replace(/[%_]/g, "\\$&")}%`));
  if (/^[0-9a-f-]{36}$/i.test(category)) conds.push(eq(products.categoryId, category));
  if (status === "published") conds.push(eq(products.published, true));
  else if (status === "draft") conds.push(eq(products.published, false));
  else if (SALE_STATUSES.some((s) => s.value === status)) conds.push(eq(products.saleStatus, status));

  const [rows, cats, [{ total }]] = await Promise.all([
    db.select().from(products).where(conds.length ? and(...conds) : undefined).orderBy(asc(products.position), asc(products.createdAt)),
    db.select().from(categories).orderBy(asc(categories.position), asc(categories.name)),
    db.select({ total: products.id }).from(products).limit(1).then(async (r) => [{ total: r.length }]),
  ]);
  const catName = new Map(cats.map((c) => [c.id, c.name]));
  const covers = new Map<string, { url: string; alt: string }>();
  const photoCount = new Map<string, number>();
  if (rows.length) {
    const imgs = await db
      .select()
      .from(productImages)
      .where(inArray(productImages.productId, rows.map((r) => r.id)))
      .orderBy(asc(productImages.position));
    for (const i of imgs) {
      if (!covers.has(i.productId)) covers.set(i.productId, { url: i.url, alt: i.alt });
      photoCount.set(i.productId, (photoCount.get(i.productId) ?? 0) + 1);
    }
  }

  return (
    <div>
      <Flash msg={sp.msg} err={sp.err} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-3xl" data-testid="works-heading">
          Works <span className="text-lg text-muted-foreground">({rows.length}{filtered ? " shown" : ""})</span>
        </h1>
        <Link href="/admin/works/new" className={buttonVariants()} data-testid="add-work">Add work</Link>
      </div>

      <form method="get" className="mt-5 grid gap-3 sm:grid-cols-[1fr_12rem_12rem_auto] sm:items-end" role="search" aria-label="Find works">
        <div>
          <Label htmlFor="q">Search by title</Label>
          <Input id="q" name="q" defaultValue={q} className="mt-1" />
        </div>
        <div>
          <Label htmlFor="category">Category</Label>
          <Select id="category" name="category" defaultValue={category} className="mt-1">
            <option value="">All categories</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <div>
          <Label htmlFor="status">Status</Label>
          <Select id="status" name="status" defaultValue={status} className="mt-1">
            <option value="">All statuses</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            {SALE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
        </div>
        <div className="flex gap-2">
          <Button type="submit">Filter</Button>
          {filtered && <Link href="/admin" className={buttonVariants({ variant: "outline" })}>Clear</Link>}
        </div>
      </form>

      {total === 0 ? (
        <div className="mt-10 border border-dashed border-border p-10 text-center" data-testid="empty-store">
          <p className="font-serif text-2xl">Your store has no works yet</p>
          <p className="mt-2 text-muted-foreground">First step: add your first work. You can add photos and publish it afterwards.</p>
          <Link href="/admin/works/new" className={buttonVariants({ className: "mt-5" })}>Add your first work</Link>
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-10 text-muted-foreground" data-testid="no-results">No works match those filters. <Link href="/admin" className="underline">Clear the filters</Link>.</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm" data-testid="works-table">
            <caption className="sr-only">All works, including drafts</caption>
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th scope="col" className="py-2 pr-3 font-medium">Photo</th>
                <th scope="col" className="py-2 pr-3 font-medium">Title</th>
                <th scope="col" className="py-2 pr-3 font-medium">Category</th>
                <th scope="col" className="py-2 pr-3 font-medium">Price</th>
                <th scope="col" className="py-2 pr-3 font-medium">Stock</th>
                <th scope="col" className="py-2 pr-3 font-medium">Status</th>
                {!filtered && <th scope="col" className="py-2 font-medium">Order</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const cover = covers.get(r.id);
                const hints: string[] = [];
                if (!r.published) hints.push((photoCount.get(r.id) ?? 0) === 0 ? "Draft: add a photo, then publish." : "Draft: ready to publish.");
                else if (r.saleStatus === "available" && r.stock <= 0) hints.push("Sold out: add stock or change the status.");
                if (r.published && (photoCount.get(r.id) ?? 0) === 0) hints.push("No photo yet: shoppers see a placeholder.");
                return (
                  <tr key={r.id} className="border-b border-border align-middle" data-testid="work-row">
                    <td className="py-2 pr-3">
                      {cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={cover.url} alt={cover.alt} className="h-14 w-14 bg-muted object-cover" />
                      ) : (
                        <span className="flex h-14 w-14 items-center justify-center bg-muted text-[10px] text-muted-foreground">No photo</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <Link href={`/admin/works/${r.id}`} className="font-medium underline-offset-4 hover:underline" data-testid="work-link">{r.name}</Link>
                      {r.isSample && <span className="ml-2 border border-border px-1.5 py-0.5 text-xs text-muted-foreground">Sample</span>}
                      {hints.map((h) => <p key={h} className="text-xs text-accent">{h}</p>)}
                    </td>
                    <td className="py-2 pr-3">{catName.get(r.categoryId) ?? "—"}</td>
                    <td className="py-2 pr-3">{r.priceCents != null ? formatMoney(r.priceCents) : "—"}</td>
                    <td className="py-2 pr-3">{r.stock}</td>
                    <td className="py-2 pr-3">
                      <span className={r.published ? "font-medium" : "text-muted-foreground"}>{r.published ? "Published" : "Draft"}</span>
                      <span className="block text-xs text-muted-foreground">{saleStatusLabel(r.saleStatus)}</span>
                    </td>
                    {!filtered && (
                      <td className="py-2">
                        <div className="flex gap-1">
                          <form action={moveWork.bind(null, r.id, "up")}>
                            <button type="submit" className="min-h-9 min-w-9 border border-border hover:bg-muted disabled:opacity-30" disabled={i === 0} aria-label={`Move ${r.name} up`}>↑</button>
                          </form>
                          <form action={moveWork.bind(null, r.id, "down")}>
                            <button type="submit" className="min-h-9 min-w-9 border border-border hover:bg-muted disabled:opacity-30" disabled={i === rows.length - 1} aria-label={`Move ${r.name} down`}>↓</button>
                          </form>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
