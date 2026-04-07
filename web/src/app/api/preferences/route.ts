import { getAuthenticatedEmail } from "@/lib/auth";
import { getUser, updateUserPreferences } from "@/lib/dynamodb";
import type { Cadence } from "@/types";

export async function GET() {
  const email = await getAuthenticatedEmail();
  if (!email) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const user = await getUser(email);
  if (!user) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  return Response.json({
    cadence: user.cadence,
    tier: user.tier,
  });
}

export async function PUT(request: Request) {
  const email = await getAuthenticatedEmail();
  if (!email) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { cadence } = await request.json();
  const validCadences: Cadence[] = ["daily", "weekly"];
  if (!validCadences.includes(cadence)) {
    return Response.json({ error: "Invalid cadence" }, { status: 400 });
  }

  await updateUserPreferences(email, cadence);
  return Response.json({ ok: true });
}
