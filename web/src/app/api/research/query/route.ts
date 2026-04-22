import { runResearchAgent } from "@/lib/agent/orchestrator";
import { saveResearchLog } from "@/lib/research-log";
import { checkAndIncrementResearchDaily } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const email = "guest@research";

  const body = await request.json();
  const { query, history } = body;

  if (!query || typeof query !== "string") {
    return Response.json({ error: "Query required" }, { status: 400 });
  }

  const cap = await checkAndIncrementResearchDaily();
  if (!cap.ok) {
    return Response.json(
      { error: `Daily research query limit (${cap.limit}) reached. Please try again tomorrow.` },
      { status: 429 }
    );
  }

  const chatHistory: { role: string; content: string }[] =
    Array.isArray(history) ? history.slice(-20) : [];

  const encoder = new TextEncoder();
  const startTime = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      function sendEvent(type: string, data: Record<string, unknown>) {
        const payload = JSON.stringify({ type, ...data });
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
      }

      try {
        const result = await runResearchAgent(query, chatHistory, (step) => {
          sendEvent("progress", {
            step: step.label,
            status: step.status,
            detail: step.detail,
          });
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

        sendEvent("answer", {
          content: result.answer,
          sources: result.sources,
          comparison: result.comparison || null,
          steps: result.steps,
          logId,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Research failed";
        sendEvent("error", { message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
