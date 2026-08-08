import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  ScanCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";
import type { User, Cadence, WatchlistEntry } from "@/types";

export const ddbClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.APP_REGION || process.env.AWS_REGION || "us-east-1" }),
  { marshallOptions: { removeUndefinedValues: true } }
);

const client = ddbClient;

const USERS_TABLE = process.env.USERS_TABLE || "sec-filing-users";
const SESSIONS_TABLE = process.env.SESSIONS_TABLE || "sec-filing-sessions";
const MAGIC_LINKS_TABLE = process.env.MAGIC_LINKS_TABLE || "sec-filing-magic-links";
const WATCHLISTS_TABLE = process.env.WATCHLISTS_TABLE || "sec-filing-watchlists";

// --- Users ---

export async function getUser(email: string): Promise<User | null> {
  const result = await client.send(
    new GetCommand({ TableName: USERS_TABLE, Key: { email } })
  );
  return (result.Item as User) || null;
}

export async function createUser(email: string): Promise<void> {
  await client.send(
    new PutCommand({
      TableName: USERS_TABLE,
      Item: {
        email,
        status: "pending",
        cadence: "daily",
        tier: "free",
        createdAt: new Date().toISOString(),
        unsubscribeToken: randomUUID(),
      },
      ConditionExpression: "attribute_not_exists(email)",
    })
  );
}

export async function activateUser(email: string): Promise<void> {
  await client.send(
    new UpdateCommand({
      TableName: USERS_TABLE,
      Key: { email },
      UpdateExpression: "SET #s = :status, verifiedAt = :now",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: {
        ":status": "active",
        ":now": new Date().toISOString(),
      },
    })
  );
}

export async function updateUserPreferences(
  email: string,
  cadence: Cadence
): Promise<void> {
  await client.send(
    new UpdateCommand({
      TableName: USERS_TABLE,
      Key: { email },
      UpdateExpression: "SET cadence = :cadence",
      ExpressionAttributeValues: { ":cadence": cadence },
    })
  );
}

export async function unsubscribeByToken(token: string): Promise<boolean> {
  const result = await client.send(
    new ScanCommand({
      TableName: USERS_TABLE,
      FilterExpression: "unsubscribeToken = :token",
      ExpressionAttributeValues: { ":token": token },
      Limit: 1,
    })
  );

  if (!result.Items || result.Items.length === 0) return false;

  const email = result.Items[0].email as string;
  await client.send(
    new UpdateCommand({
      TableName: USERS_TABLE,
      Key: { email },
      UpdateExpression: "SET #s = :status",
      ExpressionAttributeNames: { "#s": "status" },
      ExpressionAttributeValues: { ":status": "unsubscribed" },
    })
  );

  return true;
}

// --- Watchlist ---

export async function getWatchlist(email: string): Promise<WatchlistEntry[]> {
  const result = await client.send(
    new QueryCommand({
      TableName: WATCHLISTS_TABLE,
      KeyConditionExpression: "email = :email",
      ExpressionAttributeValues: { ":email": email },
    })
  );
  return (result.Items as WatchlistEntry[]) || [];
}

export async function addToWatchlist(entry: WatchlistEntry): Promise<void> {
  await client.send(
    new PutCommand({
      TableName: WATCHLISTS_TABLE,
      Item: entry,
    })
  );
}

export async function removeFromWatchlist(email: string, cik: string): Promise<void> {
  await client.send(
    new DeleteCommand({
      TableName: WATCHLISTS_TABLE,
      Key: { email, cik },
    })
  );
}

export async function updateWatchlistEntry(
  email: string,
  cik: string,
  form_types: string[],
  keywords: string[]
): Promise<void> {
  await client.send(
    new UpdateCommand({
      TableName: WATCHLISTS_TABLE,
      Key: { email, cik },
      UpdateExpression: "SET form_types = :ft, keywords = :kw",
      ExpressionAttributeValues: {
        ":ft": form_types,
        ":kw": keywords,
      },
    })
  );
}

// --- Magic Links ---

export async function createMagicLink(
  email: string,
  type: "signup" | "login"
): Promise<string> {
  const token = randomUUID();
  const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour

  await client.send(
    new PutCommand({
      TableName: MAGIC_LINKS_TABLE,
      Item: {
        token,
        email,
        type,
        expiresAt: Math.floor(expiresAt / 1000),
        createdAt: new Date().toISOString(),
      },
    })
  );

  return token;
}

export async function consumeMagicLink(
  token: string
): Promise<{ email: string; type: "signup" | "login" } | null> {
  const result = await client.send(
    new GetCommand({ TableName: MAGIC_LINKS_TABLE, Key: { token } })
  );

  if (!result.Item) return null;
  if (result.Item.expiresAt * 1000 < Date.now()) return null;

  await client.send(
    new DeleteCommand({ TableName: MAGIC_LINKS_TABLE, Key: { token } })
  );

  return {
    email: result.Item.email as string,
    type: result.Item.type as "signup" | "login",
  };
}

// --- Sessions ---

export async function createSessionWithLookup(email: string): Promise<string> {
  const token = randomUUID();
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days

  await client.send(
    new PutCommand({
      TableName: SESSIONS_TABLE,
      Item: {
        token,
        email,
        expiresAt: Math.floor(expiresAt / 1000),
      },
    })
  );

  return token;
}

export async function deleteSession(token: string): Promise<void> {
  await client.send(
    new DeleteCommand({ TableName: SESSIONS_TABLE, Key: { token } })
  );
}
