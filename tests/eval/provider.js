/**
 * Custom promptfoo provider that calls our research API.
 * Handles both SSE streaming (Fargate/dev) and JSON (fallback).
 */

const BASE_URL = process.env.EVAL_BASE_URL || "http://localhost:3001";
const COOKIE = process.env.EVAL_COOKIE || "research_access=cheeky";

class ResearchProvider {
  id() {
    return "sec-research-agent";
  }

  async callApi(prompt) {
    const startTime = Date.now();

    try {
      const response = await fetch(`${BASE_URL}/api/research/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: COOKIE,
        },
        body: JSON.stringify({ query: prompt }),
      });

      if (!response.ok) {
        const err = await response.text();
        return { error: `HTTP ${response.status}: ${err}` };
      }

      const contentType = response.headers.get("content-type") || "";

      // JSON response (non-streaming)
      if (contentType.includes("application/json")) {
        const data = await response.json();
        return {
          output: data.answer,
          metadata: {
            sources: data.sources,
            comparison: data.comparison,
            steps: data.steps,
            logId: data.logId,
            durationMs: Date.now() - startTime,
          },
        };
      }

      // SSE response (streaming)
      const text = await response.text();
      const lines = text.split("\n");
      let answer = null;
      let sources = [];
      let comparison = null;
      let steps = [];
      let logId = null;
      let error = null;

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === "answer") {
            answer = event.content;
            sources = event.sources || [];
            comparison = event.comparison;
            steps = event.steps || [];
            logId = event.logId;
          }
          if (event.type === "error") {
            error = event.message;
          }
        } catch {
          // skip malformed events
        }
      }

      if (error) {
        return { error };
      }

      if (!answer) {
        return { error: "No answer received from agent" };
      }

      return {
        output: answer,
        metadata: {
          sources,
          comparison,
          steps,
          logId,
          sourceCount: sources.length,
          stepCount: steps.length,
          durationMs: Date.now() - startTime,
        },
      };
    } catch (err) {
      return { error: `Connection failed: ${err.message}` };
    }
  }
}

module.exports = ResearchProvider;
