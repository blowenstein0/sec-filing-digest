import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, BASE_URL } from "./lib/constants";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME);

  const protectedPaths = ["/dashboard", "/research"];
  if (protectedPaths.some((p) => pathname.startsWith(p)) && !sessionCookie) {
    return NextResponse.redirect(`${BASE_URL}/signup`);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/research/:path*"],
};
