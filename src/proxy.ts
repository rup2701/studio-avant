import { NextResponse, type NextRequest } from "next/server";

/**
 * First gate for the owner area: no session cookie, no admin pages.
 * This only checks the cookie exists; every admin page, server action and API route
 * verifies the session against the database (see lib/auth.ts requireOwner / isOwner).
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/admin/login") return NextResponse.next();
  if (!req.cookies.get("sa_owner")?.value) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*"] };
