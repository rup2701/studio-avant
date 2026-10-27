import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { isOwner } from "@/lib/auth";
import { store } from "@/config/store";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Owner sign-in", robots: { index: false, follow: false } };

export default async function LoginPage() {
  if (await isOwner()) redirect("/admin");
  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <p className="font-serif text-xl">{store.name}</p>
      <h1 className="mt-6 font-serif text-3xl">Owner sign-in</h1>
      <LoginForm />
      <p className="mt-8 text-sm">
        <Link href="/" className="underline underline-offset-4">Back to the store</Link>
      </p>
    </main>
  );
}
