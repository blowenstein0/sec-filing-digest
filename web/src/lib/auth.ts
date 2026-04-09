import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/lib/constants";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.APP_REGION || process.env.AWS_REGION || "us-east-1" })
);
const SESSIONS_TABLE = process.env.SESSIONS_TABLE || "sec-filing-sessions";

export async function getSessionToken(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value || null;
}

export async function getAuthenticatedEmail(): Promise<string | null> {
  // Skip auth in dev mode
  if (process.env.NODE_ENV === "development") return "dev@localhost";

  const token = await getSessionToken();
  if (!token) return null;

  const result = await client.send(
    new GetCommand({ TableName: SESSIONS_TABLE, Key: { token } })
  );

  if (!result.Item) return null;
  if (result.Item.expiresAt * 1000 < Date.now()) return null;

  return result.Item.email as string;
}

export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
