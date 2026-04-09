import type { Message, ContentBlock as BedrockContentBlock } from "@aws-sdk/client-bedrock-runtime";
import { converse, SONNET_MODEL_ID } from "@/lib/bedrock";
import { TOOL_CONFIG, executeTool, getToolLabel, resetRateLimit } from "./tools";
import { RESEARCH_AGENT_SYSTEM, SYNTHESIZE_NOW } from "./prompts";
import type { AgentStep, AgentResult } from "./types";
import type { Citation, ComparisonData } from "@/types";

const MAX_ROUNDS = 6;
const TIMEOUT_MS = 25_000; // Force synthesis at 25s

export async function runResearchAgent(
  query: string,
  onProgress: (step: AgentStep) => void
): Promise<AgentResult> {
  resetRateLimit();

  const startTime = Date.now();
  const allSources: Citation[] = [];
  const allSteps: AgentStep[] = [];
  const comparisonMeta: Map<string, { label: string; value: number; year: number }[]> = new Map();
  let stepCounter = 0;

  function emitStep(label: string, status: AgentStep["status"], detail?: string): AgentStep {
    const step: AgentStep = {
      id: `step-${++stepCounter}`,
      label,
      detail,
      status,
      timestamp: new Date().toISOString(),
    };
    allSteps.push(step);
    onProgress(step);
    return step;
  }

  // Initialize conversation
  const messages: Message[] = [
    { role: "user", content: [{ text: query }] },
  ];

  emitStep("Analyzing question", "running");

  for (let round = 0; round < MAX_ROUNDS; round++) {
    // Check timeout — if close, force synthesis
    const elapsed = Date.now() - startTime;
    if (elapsed > TIMEOUT_MS) {
      emitStep("Synthesizing answer (time limit)", "running");
      // Force a text response by removing tools
      messages.push({
        role: "user",
        content: [{ text: SYNTHESIZE_NOW }],
      });
      const finalResponse = await converse({
        modelId: SONNET_MODEL_ID,
        system: RESEARCH_AGENT_SYSTEM,
        messages,
        maxTokens: 4096,
        // No toolConfig — forces text response
      });
      const answer = extractText(finalResponse.output);
      markLastRunningComplete(allSteps);
      return buildResult(answer, allSources, allSteps, comparisonMeta);
    }

    // Call Converse with tools
    const response = await converse({
      modelId: SONNET_MODEL_ID,
      system: RESEARCH_AGENT_SYSTEM,
      messages,
      toolConfig: TOOL_CONFIG,
      maxTokens: 4096,
    });

    markLastRunningComplete(allSteps);

    // If model returned text (end_turn), we're done
    if (response.stopReason === "end_turn" || response.stopReason === "max_tokens") {
      const answer = extractText(response.output);
      return buildResult(answer, allSources, allSteps, comparisonMeta);
    }

    // Model wants to use tools
    if (response.stopReason === "tool_use") {
      // Add assistant's response to message history
      messages.push({ role: "assistant", content: response.output });

      // Extract tool use blocks and execute them
      const toolUseBlocks = response.output.filter(
        (block): block is BedrockContentBlock.ToolUseMember =>
          "toolUse" in block
      );

      const toolResults: BedrockContentBlock[] = [];

      for (const block of toolUseBlocks) {
        const toolUse = block.toolUse!;
        const toolUseId = toolUse.toolUseId || "unknown";
        const name = toolUse.name || "unknown";
        const toolInput = (toolUse.input || {}) as Record<string, unknown>;

        const stepLabel = getToolLabel(name, toolInput);
        emitStep(stepLabel, "running");

        try {
          const result = await executeTool(name, toolInput);

          // Collect sources
          allSources.push(...result.sources);

          // Collect comparison meta
          if (result.meta?.ticker && result.meta?.financials) {
            const existing = comparisonMeta.get(result.meta.ticker) || [];
            existing.push(...result.meta.financials);
            comparisonMeta.set(result.meta.ticker, existing);
          }

          toolResults.push({
            toolResult: {
              toolUseId,
              content: [{ text: result.text }],
              status: "success",
            },
          });

          markLastRunningComplete(allSteps);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : "Tool execution failed";

          toolResults.push({
            toolResult: {
              toolUseId,
              content: [{ text: `Error: ${errorMsg}` }],
              status: "error",
            },
          });

          markLastRunningError(allSteps, errorMsg);
        }
      }

      // Send tool results back to the model
      messages.push({ role: "user", content: toolResults });

      emitStep("Analyzing results", "running");
    }
  }

  // Max rounds reached — force synthesis
  emitStep("Synthesizing answer (max rounds)", "running");
  messages.push({
    role: "user",
    content: [{ text: SYNTHESIZE_NOW }],
  });
  const finalResponse = await converse({
    modelId: SONNET_MODEL_ID,
    system: RESEARCH_AGENT_SYSTEM,
    messages,
    maxTokens: 4096,
  });
  const answer = extractText(finalResponse.output);
  markLastRunningComplete(allSteps);
  return buildResult(answer, allSources, allSteps, comparisonMeta);
}

// --- Helpers ---

function extractText(blocks: BedrockContentBlock[]): string {
  return blocks
    .filter((b): b is BedrockContentBlock.TextMember => "text" in b)
    .map((b) => b.text)
    .join("\n");
}

function markLastRunningComplete(steps: AgentStep[]): void {
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i].status === "running") {
      steps[i].status = "complete";
      return;
    }
  }
}

function markLastRunningError(steps: AgentStep[], detail: string): void {
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i].status === "running") {
      steps[i].status = "error";
      steps[i].detail = detail;
      return;
    }
  }
}

function deduplicateSources(sources: Citation[]): Citation[] {
  const seen = new Set<string>();
  return sources.filter((s) => {
    const key = `${s.type}:${s.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildResult(
  answer: string,
  sources: Citation[],
  steps: AgentStep[],
  comparisonMeta: Map<string, { label: string; value: number; year: number }[]>
): AgentResult {
  const result: AgentResult = {
    answer,
    sources: deduplicateSources(sources),
    steps,
  };

  // Build ComparisonData if we have financials for 2+ companies
  if (comparisonMeta.size >= 2) {
    result.comparison = buildComparisonFromMeta(comparisonMeta);
  }

  return result;
}

function buildComparisonFromMeta(
  meta: Map<string, { label: string; value: number; year: number }[]>
): ComparisonData {
  const companies = Array.from(meta.keys());

  // Find all unique metric labels
  const metricLabels = new Set<string>();
  for (const entries of meta.values()) {
    for (const e of entries) metricLabels.add(e.label);
  }

  // For each metric, use the most recent year's value per company
  const metrics: ComparisonData["metrics"] = [];
  for (const label of metricLabels) {
    const values: Record<string, number | string> = {};
    let hasAny = false;

    for (const ticker of companies) {
      const entries = meta.get(ticker) || [];
      const matching = entries.filter((e) => e.label === label);
      if (matching.length > 0) {
        // Most recent year
        matching.sort((a, b) => b.year - a.year);
        values[ticker] = matching[0].value;
        hasAny = true;
      } else {
        values[ticker] = "N/A";
      }
    }

    if (hasAny) metrics.push({ label, values });
  }

  return { companies, metrics };
}
