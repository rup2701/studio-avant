"use client";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";

export default function ShopError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="reading page-x py-20 text-center" role="alert" data-testid="shop-error">
      <h1 className="font-serif text-3xl">The shop is having a moment</h1>
      <p className="mt-4 text-muted-foreground">
        Something on our side did not load. Nothing you did caused this, and your bag is saved in this browser.
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <Button onClick={() => reset()}>Try again</Button>
        <Link href="/cart" className={buttonVariants({ variant: "outline" })}>View your bag</Link>
      </div>
    </div>
  );
}
