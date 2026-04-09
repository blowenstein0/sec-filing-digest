import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.APP_REGION || process.env.AWS_REGION || "us-east-1" })
);
const METRICS_TABLE = process.env.METRICS_TABLE || "sec-financial-metrics";

export async function GET() {
  const result = await client.send(
    new ScanCommand({
      TableName: METRICS_TABLE,
      ProjectionExpression: "ticker, company_name, updated_at, metrics",
    })
  );

  const tickers = (result.Items || []).map((item) => ({
    ticker: item.ticker as string,
    name: item.company_name as string,
    metrics: Object.keys(item.metrics as Record<string, unknown>),
    updatedAt: item.updated_at as string,
  }));

  tickers.sort((a, b) => a.ticker.localeCompare(b.ticker));

  return Response.json({ tickers });
}
