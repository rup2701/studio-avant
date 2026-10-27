import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export function NotFoundContent({
  title = "We couldn't find that page",
  children,
}: {
  title?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="reading page-x py-20 text-center" data-testid="not-found">
      <h1 className="font-serif text-3xl">{title}</h1>
      <div className="mt-4 text-muted-foreground">
        {children ?? <p>The link may be out of date, or the work may have been taken down. The portfolio is the best place to start again.</p>}
      </div>
      <Link href="/" className={buttonVariants({ className: "mt-8" })}>
        Back to the work
      </Link>
    </div>
  );
}
