import type { Message, ContentBlock as BedrockContentBlock } from "@aws-sdk/client-bedrock-runtime";
import { converse, SONNET_MODEL_ID, OPUS_MODEL_ID } from "@/lib/bedrock";
import { TOOL_CONFIG, executeTool, getToolLabel, resetRateLimit } from "./tools";
import { RESEARCH_AGENT_SYSTEM, SYNTHESIZE_NOW } from "./prompts";
import type { AgentStep, AgentResult } from "./types";
import type { Citation, ComparisonData } from "@/types";

const MAX_ROUNDS = 4;
const TIMEOUT_MS = 25_000; // Force synthesis at 25s to stay within Amplify's timeout

export async function runResearchAgent(
  query: string,
  chatHistory: { role: string; content: string }[],
  onProgress: (step: AgentStep) => void
): Promise<AgentResult> {
  resetRateLimit();

  const startTime = Date.now();
  const allSources: Citation[] = [];
  const allSteps: AgentStep[] = [];
  const comparisonMeta: Map<string, { label: string; value: number; year: number }[]> = new Map();
  let stepCounter = 0;
  let sourceCounter = 0;

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

  // Initialize conversation with prior chat history for context
  const messages: Message[] = [];

  // Add prior turns as simple text messages (no tool use history)
  for (const turn of chatHistory) {
    const role = turn.role === "assistant" ? "assistant" : "user";
    messages.push({ role, content: [{ text: turn.content }] });
  }

  // Add the current query
  messages.push({ role: "user", content: [{ text: query }] });

  emitStep("Analyzing question", "running");
  console.log(`\n[AGENT] Query: "${query}" | History: ${chatHistory.length} turns`);

  for (let round = 0; round < MAX_ROUNDS; round++) {
    // Check timeout — if close, force synthesis
    const elapsed = Date.now() - startTime;
    console.log(`[AGENT] Round ${round + 1}/${MAX_ROUNDS} | Elapsed: ${elapsed}ms`);
    if (elapsed > TIMEOUT_MS) {
      emitStep("Deep analysis (Opus, time limit)", "running");
      // Force a text response by removing tools — use Opus for quality
      messages.push({
        role: "user",
        content: [{ text: SYNTHESIZE_NOW }],
      });
      const finalResponse = await converse({
        modelId: OPUS_MODEL_ID,
        system: RESEARCH_AGENT_SYSTEM,
        messages,
        maxTokens: 4096,
        toolConfig: TOOL_CONFIG, // Required when history contains tool blocks
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
    console.log(`[AGENT] Sonnet stopReason: ${response.stopReason} | Usage: ${JSON.stringify(response.usage)}`);

    // If model returned text (end_turn), synthesize final answer with Opus
    if (response.stopReason === "end_turn" || response.stopReason === "max_tokens") {
      // Sonnet produced an initial answer — now hand off to Opus for deeper synthesis
      const sonnetAnswer = extractText(response.output);
      console.log(`[AGENT] Sonnet answer (${sonnetAnswer.length} chars): ${sonnetAnswer.slice(0, 200)}...`);
      console.log(`[AGENT] Handing off to Opus for final synthesis...`);
      messages.push({ role: "assistant", content: response.output });

      emitStep("Deep analysis (Opus)", "running");
      messages.push({
        role: "user",
        content: [{ text: "Provide your final analysis now. Do NOT call any tools — just analyze the data already gathered. Verify all numbers against the data and ensure every claim has a citation." }],
      });
      const opusResponse = await converse({
        modelId: OPUS_MODEL_ID,
        system: RESEARCH_AGENT_SYSTEM,
        messages,
        toolConfig: TOOL_CONFIG,
        maxTokens: 4096,
      });
      let answer = extractText(opusResponse.output);
      console.log(`[AGENT] Opus stopReason: ${opusResponse.stopReason} | Usage: ${JSON.stringify(opusResponse.usage)}`);

      // If Opus tried to call tools instead of answering, fall back to Sonnet's answer
      if (!answer || opusResponse.stopReason === "tool_use") {
        console.log(`[AGENT] Opus returned tool_use or empty — falling back to Sonnet answer`);
        answer = sonnetAnswer;
      }
      console.log(`[AGENT] Final answer (${answer.length} chars): ${answer.slice(0, 200)}...`);
      markLastRunningComplete(allSteps);
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
        console.log(`[AGENT] Tool call: ${name}(${JSON.stringify(toolInput)})`);
        emitStep(stepLabel, "running");

        try {
          const result = await executeTool(name, toolInput);
          console.log(`[AGENT] Tool result: ${result.text.slice(0, 200)}...`);

          // Assign source numbers and collect
          let resultText = result.text;
          if (result.sources.length > 0) {
            const sourceNums: string[] = [];
            for (const source of result.sources) {
              sourceCounter++;
              allSources.push(source);
              sourceNums.push(`[${sourceCounter}]`);
            }
            resultText += `\n\n(Cite this data as source ${sourceNums.join(", ")} in your answer.)`;
          }

          // Collect comparison meta
          if (result.meta?.ticker && result.meta?.financials) {
            const existing = comparisonMeta.get(result.meta.ticker) || [];
            existing.push(...result.meta.financials);
            comparisonMeta.set(result.meta.ticker, existing);
          }

          toolResults.push({
            toolResult: {
              toolUseId,
              content: [{ text: resultText }],
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

  // Max rounds reached — force synthesis with Opus
  emitStep("Deep analysis (Opus, max rounds)", "running");
  messages.push({
    role: "user",
    content: [{ text: SYNTHESIZE_NOW }],
  });
  const finalResponse = await converse({
    modelId: OPUS_MODEL_ID,
    system: RESEARCH_AGENT_SYSTEM,
    messages,
    toolConfig: TOOL_CONFIG,
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
