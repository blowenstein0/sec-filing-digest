import { PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";
import { ddbClient as client } from "@/lib/dynamodb";
import type { AgentStep } from "@/types";
import type { Citation, ComparisonData } from "@/types";
const TABLE = process.env.RESEARCH_LOGS_TABLE || "sec-research-logs";

export interface ResearchLogEntry {
  id: string;
  email: string;
  query: string;
  answer: string;
  sources: Citation[];
  comparison?: ComparisonData;
  steps: AgentStep[];
  history_length: number;
  created_at: string;
  duration_ms: number;
  feedback?: "up" | "down";
  feedback_at?: string;
}

export async function saveResearchLog(params: {
  email: string;
  query: string;
  answer: string;
  sources: Citation[];
  comparison?: ComparisonData;
  steps: AgentStep[];
  historyLength: number;
  durationMs: number;
}): Promise<string> {
  const id = randomUUID();

  const item: ResearchLogEntry = {
    id,
    email: params.email,
    query: params.query,
    answer: params.answer,
    sources: params.sources,
    comparison: params.comparison,
    steps: params.steps,
    history_length: params.historyLength,
    created_at: new Date().toISOString(),
    duration_ms: params.durationMs,
  };

  try {
    await client.send(new PutCommand({ TableName: TABLE, Item: item }));
  } catch (err) {
    // Don't fail the request if logging fails
    console.error("Failed to save research log:", err);
  }

  return id;
}

export async function saveFeedback(
  logId: string,
  feedback: "up" | "down"
): Promise<boolean> {
  try {
    await client.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { id: logId },
        UpdateExpression: "SET feedback = :fb, feedback_at = :at",
        ExpressionAttributeValues: {
          ":fb": feedback,
          ":at": new Date().toISOString(),
        },
      })
    );
    return true;
  } catch (err) {
    console.error("Failed to save feedback:", err);
    return false;
  }
}
