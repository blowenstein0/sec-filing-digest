import { getAuthenticatedEmail, getSessionToken, clearSessionCookie } from "@/lib/auth";
import { deleteSession } from "@/lib/dynamodb";

export async function GET() {
  const email = await getAuthenticatedEmail();
  if (!email) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  return Response.json({ email });
}

export async function DELETE() {
  const token = await getSessionToken();
  if (token) {
    await deleteSession(token);
  }
  await clearSessionCookie();
  return Response.json({ ok: true });
}
