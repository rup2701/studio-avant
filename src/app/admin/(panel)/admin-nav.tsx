"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/admin", label: "Works" },
  { href: "/admin/series", label: "Series" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/home", label: "Home & links" },
  { href: "/admin/about", label: "About page" },
  { href: "/admin/exhibitions", label: "Exhibitions & press" },
  { href: "/admin/inquiries", label: "Commission inquiries" },
  { href: "/admin/signups", label: "Newsletter" },
  { href: "/admin/status", label: "Status" },
];

export function AdminNav() {
  const path = usePathname();
  const active = (href: string) => (href === "/admin" ? path === "/admin" || path.startsWith("/admin/works") : path.startsWith(href));
  return (
    <nav aria-label="Owner area" className="mx-auto max-w-7xl overflow-x-auto px-4">
      <ul className="flex gap-5 whitespace-nowrap text-sm">
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              aria-current={active(l.href) ? "page" : undefined}
              className={cn("inline-flex min-h-11 items-center border-b-2 hover:text-accent", active(l.href) ? "border-foreground font-medium" : "border-transparent")}
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
