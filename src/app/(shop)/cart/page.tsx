import type { Metadata } from "next";
import { CartView } from "@/components/cart-view";

export const metadata: Metadata = { title: "Your bag" };

export default function CartPage() {
  return (
    <div className="reading-wide page-x pt-8 md:pt-12">
      <h1 className="mb-6 font-serif text-3xl">Your bag</h1>
      <CartView />
    </div>
  );
}
