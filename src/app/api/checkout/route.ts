import { NextResponse } from "next/server";
import { placeOrder } from "@/lib/checkout";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const result = await placeOrder(body);
  return NextResponse.json(result, { status: result.status === "error" ? 500 : 200 });
}
