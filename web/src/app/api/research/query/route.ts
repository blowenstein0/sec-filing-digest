import { getAuthenticatedEmail } from "@/lib/auth";
import { getResearchAuth } from "@/lib/research-auth";
import { runResearchAgent } from "@/lib/agent/orchestrator";
import { saveResearchLog } from "@/lib/research-log";

export const maxDuration = 60;

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
  const { query, history } = body;

  if (!query || typeof query !== "string") {
    return Response.json({ error: "Query required" }, { status: 400 });
  }

  const chatHistory: { role: string; content: string }[] =
    Array.isArray(history) ? history.slice(-20) : [];

  const startTime = Date.now();

  try {
    const result = await runResearchAgent(query, chatHistory, () => {
      // Progress callbacks ignored for now — JSON response, not SSE
    });

    const durationMs = Date.now() - startTime;

    const logId = await saveResearchLog({
      email,
      query,
      answer: result.answer,
      sources: result.sources,
      comparison: result.comparison,
      steps: result.steps,
      historyLength: chatHistory.length,
      durationMs,
    });

    return Response.json({
      answer: result.answer,
      sources: result.sources,
      comparison: result.comparison || null,
      steps: result.steps,
      logId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Research failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
