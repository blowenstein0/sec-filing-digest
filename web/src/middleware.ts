import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, BASE_URL } from "./lib/constants";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME);

  // Skip auth in dev mode
  if (process.env.NODE_ENV === "development") {
    return NextResponse.next();
  }

  // Research uses its own password gate, not session auth
  const protectedPaths = ["/dashboard"];
  if (protectedPaths.some((p) => pathname.startsWith(p)) && !sessionCookie) {
    return NextResponse.redirect(`${BASE_URL}/signup`);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
