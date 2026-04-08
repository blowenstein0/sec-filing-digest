import { NextResponse } from "next/server";
import { consumeMagicLink, activateUser, createSessionWithLookup } from "@/lib/dynamodb";
import { setSessionCookie } from "@/lib/auth";
import { BASE_URL } from "@/lib/constants";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(`${BASE_URL}/signup?error=missing-token`);
  }

  const link = await consumeMagicLink(token);
  if (!link) {
    return NextResponse.redirect(`${BASE_URL}/signup?error=invalid-or-expired`);
  }

  if (link.type === "signup") {
    await activateUser(link.email);
  }

  const sessionToken = await createSessionWithLookup(link.email);
  await setSessionCookie(sessionToken);

  return NextResponse.redirect(`${BASE_URL}/dashboard`);
}
