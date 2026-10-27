import type { Metadata } from "next";
import { CheckoutForm } from "@/components/checkout-form";

export const metadata: Metadata = { title: "Checkout (demo)" };

export default function CheckoutPage() {
  return (
    <div className="reading-wide page-x pt-8 md:pt-12">
      <h1 className="mb-6 font-serif text-3xl">Checkout</h1>
      <CheckoutForm />
    </div>
  );
}
