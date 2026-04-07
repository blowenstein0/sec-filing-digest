import { unsubscribeByToken } from "@/lib/dynamodb";

export async function POST(request: Request) {
  const { token } = await request.json();

  if (!token) {
    return Response.json({ error: "Token required" }, { status: 400 });
  }

  const success = await unsubscribeByToken(token);
  if (!success) {
    return Response.json({ error: "Invalid token" }, { status: 404 });
  }

  return Response.json({ ok: true });
}
