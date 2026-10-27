import type { Metadata } from "next";
import "./globals.css";
import { store } from "@/config/store";

export const metadata: Metadata = {
  title: { default: `${store.name} — ${store.tagline}`, template: `%s — ${store.name}` },
  description: `${store.tagline}. A demo store: checkout is simulated.`,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
