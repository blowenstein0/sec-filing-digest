import {
  BedrockRuntimeClient,
  InvokeModelCommand,
  ConverseCommand,
  type Message,
  type SystemContentBlock,
  type ToolConfiguration,
  type ContentBlock as BedrockContentBlock,
} from "@aws-sdk/client-bedrock-runtime";

const client = new BedrockRuntimeClient({
  region: process.env.APP_REGION || process.env.AWS_REGION || "us-east-1",
});

export const HAIKU_MODEL_ID =
  process.env.BEDROCK_MODEL_ID ||
  "us.anthropic.claude-haiku-4-5-20251001-v1:0";

export const SONNET_MODEL_ID =
  process.env.BEDROCK_SONNET_MODEL_ID ||
  "us.anthropic.claude-sonnet-4-20250514-v1:0";

export const OPUS_MODEL_ID =
  process.env.BEDROCK_OPUS_MODEL_ID ||
  "us.anthropic.claude-opus-4-6-20250620-v1:0";

// --- Legacy InvokeModel (kept for backward compat) ---

export async function invokeBedrockChat(
  system: string,
  userMessage: string,
  maxTokens: number = 2000
): Promise<string> {
  const body = JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: userMessage }],
  });

  const response = await client.send(
    new InvokeModelCommand({
      modelId: HAIKU_MODEL_ID,
      contentType: "application/json",
      accept: "application/json",
      body: new TextEncoder().encode(body),
    })
  );

  const result = JSON.parse(new TextDecoder().decode(response.body));
  return result.content?.[0]?.text || "";
}

// --- Converse API (for agentic tool use) ---

export interface ConverseResponse {
  output: BedrockContentBlock[];
  stopReason: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export async function converse(params: {
  modelId: string;
  system: string;
  messages: Message[];
  toolConfig?: ToolConfiguration;
  maxTokens?: number;
}): Promise<ConverseResponse> {
  const systemContent: SystemContentBlock[] = [{ text: params.system }];

  const response = await client.send(
    new ConverseCommand({
      modelId: params.modelId,
      system: systemContent,
      messages: params.messages,
      toolConfig: params.toolConfig,
      inferenceConfig: {
        maxTokens: params.maxTokens || 4096,
      },
    })
  );

  return {
    output: response.output?.message?.content || [],
    stopReason: response.stopReason || "end_turn",
    usage: response.usage
      ? {
          inputTokens: response.usage.inputTokens || 0,
          outputTokens: response.usage.outputTokens || 0,
        }
      : undefined,
  };
}
