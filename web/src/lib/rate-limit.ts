import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.APP_REGION || process.env.AWS_REGION || "us-east-1" })
);

const CACHE_TABLE = process.env.CACHE_TABLE || "sec-filing-cache";
const DAILY_LIMIT = parseInt(process.env.RESEARCH_DAILY_LIMIT || "500", 10);

export interface RateLimitResult {
  ok: boolean;
  count?: number;
  limit: number;
}

export async function checkAndIncrementResearchDaily(): Promise<RateLimitResult> {
  const today = new Date().toISOString().slice(0, 10);
  const key = `ratelimit#research#${today}`;

  try {
    const res = await ddb.send(
      new UpdateCommand({
        TableName: CACHE_TABLE,
        Key: { accession_number: key },
        UpdateExpression: "ADD #c :one",
        ConditionExpression: "attribute_not_exists(#c) OR #c < :limit",
        ExpressionAttributeNames: { "#c": "count" },
        ExpressionAttributeValues: { ":one": 1, ":limit": DAILY_LIMIT },
        ReturnValues: "UPDATED_NEW",
      })
    );
    return { ok: true, count: res.Attributes?.count as number | undefined, limit: DAILY_LIMIT };
  } catch (err) {
    if ((err as { name?: string })?.name === "ConditionalCheckFailedException") {
      return { ok: false, limit: DAILY_LIMIT };
    }
    throw err;
  }
}
