import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { findCategoryBySlug, listPublishedWorks } from "@/lib/queries";
import { WorkGridList } from "@/components/work-card";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const f = await findCategoryBySlug(slug);
  return { title: f ? f.category.name : "Category not found" };
}

export default async function CategoryPage({ params }: Params) {
  const { slug } = await params;
  const found = await findCategoryBySlug(slug);
  if (!found) notFound();
  // Renamed category: the old URL redirects to the current one.
  if (found.redirectedFrom) permanentRedirect(`/category/${found.category.slug}`);
  const works = await listPublishedWorks({ categoryId: found.category.id });
  // A category with no published works is hidden from shoppers.
  if (works.length === 0) notFound();
  return (
    <div className="wide page-x pt-8 md:pt-12">
      <header className="mb-8">
        <p className="text-sm text-muted-foreground">Category</p>
        <h1 className="font-serif text-3xl md:text-4xl">{found.category.name}</h1>
        <p className="mt-2 text-sm">
          <Link href="/work" className="underline underline-offset-4 hover:text-accent">Show all work</Link>
        </p>
      </header>
      <WorkGridList works={works} />
    </div>
  );
}
