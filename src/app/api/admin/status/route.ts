import { NextResponse } from "next/server";
import { isOwner } from "@/lib/auth";
import { getStatus } from "@/lib/status";

export async function GET() {
  if (!(await isOwner())) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  return NextResponse.json(await getStatus());
}
