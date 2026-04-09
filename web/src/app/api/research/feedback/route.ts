import { getAuthenticatedEmail } from "@/lib/auth";
import { getResearchAuth } from "@/lib/research-auth";
import { saveFeedback } from "@/lib/research-log";

export async function POST(request: Request) {
  let email: string | null = null;
  try { email = await getAuthenticatedEmail(); } catch { /* */ }
  if (!email) {
    try { email = await getResearchAuth(); } catch { /* */ }
  }
  if (!email) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();
  const { logId, feedback } = body;

  if (!logId || typeof logId !== "string") {
    return Response.json({ error: "logId required" }, { status: 400 });
  }

  if (feedback !== "up" && feedback !== "down") {
    return Response.json({ error: "feedback must be 'up' or 'down'" }, { status: 400 });
  }

  const ok = await saveFeedback(logId, feedback);
  if (!ok) {
    return Response.json({ error: "Failed to save feedback" }, { status: 500 });
  }

  return Response.json({ ok: true });
}
