import type { Citation, ComparisonData } from "@/types";

export interface AgentStep {
  id: string;
  label: string;
  detail?: string;
  status: "running" | "complete" | "error";
  timestamp: string;
}

export interface AgentResult {
  answer: string;
  sources: Citation[];
  comparison?: ComparisonData;
  steps: AgentStep[];
}

// Bedrock Converse API types (subset we use)

export interface ConverseMessage {
  role: "user" | "assistant";
  content: ContentBlock[];
}

export type ContentBlock =
  | { text: string }
  | { toolUse: ToolUseBlock }
  | { toolResult: ToolResultBlock };

export interface ToolUseBlock {
  toolUseId: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  toolUseId: string;
  content: { text: string }[];
  status?: "success" | "error";
}

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: {
    json: Record<string, unknown>;
  };
}

export interface ToolExecutor {
  spec: ToolSpec;
  execute: (input: Record<string, unknown>) => Promise<{
    text: string;
    sources?: Citation[];
    tickerData?: { ticker: string; financials?: unknown[] };
  }>;
}
