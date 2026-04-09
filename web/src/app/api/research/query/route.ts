import { getAuthenticatedEmail } from "@/lib/auth";
import { runResearchAgent } from "@/lib/agent/orchestrator";

export async function POST(request: Request) {
  const email = await getAuthenticatedEmail();
  if (!email) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();
  const { query } = body;

  if (!query || typeof query !== "string") {
    return Response.json({ error: "Query required" }, { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function sendEvent(type: string, data: Record<string, unknown>) {
        const payload = JSON.stringify({ type, ...data });
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
      }

      try {
        const result = await runResearchAgent(query, (step) => {
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
