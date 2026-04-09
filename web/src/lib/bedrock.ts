import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

const client = new BedrockRuntimeClient({
  region: process.env.APP_REGION || process.env.AWS_REGION || "us-east-1",
});

const MODEL_ID =
  process.env.BEDROCK_MODEL_ID ||
  "us.anthropic.claude-haiku-4-5-20251001-v1:0";

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
      modelId: MODEL_ID,
      contentType: "application/json",
      accept: "application/json",
      body: new TextEncoder().encode(body),
    })
  );

  const result = JSON.parse(new TextDecoder().decode(response.body));
  return result.content?.[0]?.text || "";
}
