import type { Metadata } from "next";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, products } from "@/db/schema";
import { Flash } from "@/components/flash";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addCategory, deleteCategory, moveCategory, renameCategory } from "../../actions";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string; name?: string }> }) {
  const sp = await searchParams;
  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      n: sql<number>`(select count(*)::int from ${products} where ${products.categoryId} = ${categories.id})`,
      published: sql<number>`(select count(*)::int from ${products} where ${products.categoryId} = ${categories.id} and ${products.published} = true)`,
    })
    .from(categories)
    .orderBy(asc(categories.position), asc(categories.name));
  void eq;
  return (
    <div className="max-w-3xl">
      <h1 className="font-serif text-3xl">Categories</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Categories group works. A category with no published works is hidden from shoppers. Renaming keeps the old web address working.
      </p>
      <div className="mt-4"><Flash msg={sp.msg} err={sp.err} /></div>

      {rows.length === 0 ? (
        <p className="mt-6 text-muted-foreground" data-testid="categories-empty">No categories yet. Add your first one below.</p>
      ) : (
        <ul className="mt-6 divide-y divide-border border-y border-border" data-testid="category-list">
          {rows.map((c, i) => (
            <li key={c.id} className="flex flex-wrap items-end gap-3 py-3" data-testid="category-row">
              <form action={renameCategory} className="flex flex-1 flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={c.id} />
                <div className="min-w-48 flex-1">
                  <Label htmlFor={`cat-${c.id}`} className="text-xs">Name</Label>
                  <Input id={`cat-${c.id}`} name="name" defaultValue={c.name} className="mt-1" />
                </div>
                <Button type="submit" variant="outline" size="sm">Rename</Button>
              </form>
              <p className="text-sm text-muted-foreground" data-testid="category-count">
                {c.n} {c.n === 1 ? "work" : "works"} ({c.published} published)
              </p>
              <div className="flex gap-1">
                <form action={moveCategory.bind(null, c.id, "up")}>
                  <button className="min-h-9 min-w-9 border border-border hover:bg-muted disabled:opacity-30" disabled={i === 0} aria-label={`Move ${c.name} up`}>↑</button>
                </form>
                <form action={moveCategory.bind(null, c.id, "down")}>
                  <button className="min-h-9 min-w-9 border border-border hover:bg-muted disabled:opacity-30" disabled={i === rows.length - 1} aria-label={`Move ${c.name} down`}>↓</button>
                </form>
              </div>
              <form action={deleteCategory}>
                <input type="hidden" name="id" value={c.id} />
                <Button type="submit" variant="ghost" size="sm" aria-label={`Delete ${c.name}`}>Delete</Button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <form action={addCategory} className="mt-8 flex flex-wrap items-end gap-2" aria-label="Add a category">
        <div className="min-w-48 flex-1">
          <Label htmlFor="new-category">New category name</Label>
          <Input id="new-category" name="name" defaultValue={sp.name ?? ""} className="mt-1" />
        </div>
        <Button type="submit">Add category</Button>
      </form>
    </div>
  );
}
