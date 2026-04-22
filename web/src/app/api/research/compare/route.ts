// Compare queries are now handled by the unified /api/research/query route.
// The agent detects comparison intent and fetches data for multiple companies.
// This route redirects for backward compatibility.

import { runResearchAgent } from "@/lib/agent/orchestrator";
import { checkAndIncrementResearchDaily } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const body = await request.json();
  const { tickers, query } = body;

  // Build a natural language query from the structured input
  const naturalQuery =
    query || `Compare ${(tickers as string[]).join(" vs ")} on key financial metrics.`;

  const cap = await checkAndIncrementResearchDaily();
  if (!cap.ok) {
    return Response.json(
      { error: `Daily research query limit (${cap.limit}) reached. Please try again tomorrow.` },
      { status: 429 }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function sendEvent(type: string, data: Record<string, unknown>) {
        const payload = JSON.stringify({ type, ...data });
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
      }

      try {
        const result = await runResearchAgent(naturalQuery, [], (step) => {
          sendEvent("progress", {
            step: step.label,
            status: step.status,
            detail: step.detail,
          });
        });

        sendEvent("answer", {
          content: result.answer,
          sources: result.sources,
          comparison: result.comparison || null,
          steps: result.steps,
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
