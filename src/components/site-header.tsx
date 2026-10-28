"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useCart } from "@/lib/cart";
import { store } from "@/config/store";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/work", label: "Work" },
  { href: "/about", label: "About" },
  { href: "/exhibitions", label: "Exhibitions" },
  { href: "/commissions", label: "Commissions" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { count } = useCart();

  const isActive = (href: string) =>
    href === "/work" ? pathname.startsWith("/work") || pathname.startsWith("/series/") || pathname.startsWith("/category/") : pathname.startsWith(href);

  return (
    <header className="border-b border-border bg-background">
      <div className="wide page-x flex min-h-16 items-center justify-between gap-4">
        <Link href="/" className="font-serif text-xl tracking-wide" onClick={() => setOpen(false)}>
          {store.name}
        </Link>

        <nav aria-label="Main" className="hidden md:block">
          <ul className="flex items-center gap-8">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link
                  href={n.href}
                  aria-current={isActive(n.href) ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center border-b-2 text-sm tracking-wide hover:text-accent",
                    isActive(n.href) ? "border-foreground" : "border-transparent",
                  )}
                >
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/cart"
            aria-label={`Bag, ${count} ${count === 1 ? "item" : "items"}`}
            className="inline-flex min-h-11 items-center gap-1.5 text-sm tracking-wide hover:text-accent"
            data-testid="bag-link"
          >
            Bag
            <span
              aria-hidden="true"
              data-testid="bag-count"
              className="inline-flex min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs leading-6 text-primary-foreground"
            >
              {count}
            </span>
          </Link>
          <button
            type="button"
            className="inline-flex min-h-11 items-center px-2 text-sm tracking-wide md:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? "Close" : "Menu"}
          </button>
        </div>
      </div>
      {open && (
        <nav id="mobile-menu" aria-label="Main" className="border-t border-border md:hidden">
          <ul className="page-x py-2">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link
                  href={n.href}
                  onClick={() => setOpen(false)}
                  aria-current={isActive(n.href) ? "page" : undefined}
                  className={cn("flex min-h-12 items-center text-base", isActive(n.href) && "font-medium underline underline-offset-4")}
                >
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
