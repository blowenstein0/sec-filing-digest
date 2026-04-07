import { NextResponse } from "next/server";
import { consumeMagicLink, activateUser, createSessionWithLookup } from "@/lib/dynamodb";
import { setSessionCookie } from "@/lib/auth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/signup?error=missing-token", request.url));
  }

  const link = await consumeMagicLink(token);
  if (!link) {
    return NextResponse.redirect(new URL("/signup?error=invalid-or-expired", request.url));
  }

  if (link.type === "signup") {
    await activateUser(link.email);
  }

  const sessionToken = await createSessionWithLookup(link.email);
  await setSessionCookie(sessionToken);

  return NextResponse.redirect(new URL("/dashboard", request.url));
}
