import { NextResponse } from "next/server";
import { z } from "zod";
import { priceLines } from "@/lib/cart-server";

const schema = z.object({
  lines: z
    .array(
      z.object({
        key: z.string().max(400),
        productId: z.string().max(60),
        valueIds: z.array(z.string().max(60)).max(20),
        personalization: z.string().max(200).nullable().optional(),
        quantity: z.number().int(),
      }),
    )
    .max(50),
});

/** Re-prices the browser cart from the database (current price, availability, stock limits). */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  try {
    const lines = await priceLines(
      parsed.data.lines.map((l) => ({ ...l, personalization: l.personalization ?? null })),
    );
    return NextResponse.json({ lines });
  } catch (e) {
    console.error("[cart/validate]", e);
    return NextResponse.json({ error: "Could not check your bag right now." }, { status: 503 });
  }
}
