// Backward compatibility — rewrites structured compare requests into natural-language
// queries and forwards to the unified /api/research/query route.

import { POST as queryPost } from "@/app/api/research/query/route";

export async function POST(request: Request) {
  const body = await request.json();
  const { tickers, query } = body;

  const naturalQuery =
    query || `Compare ${(tickers as string[]).join(" vs ")} on key financial metrics.`;

  const forwarded = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify({ query: naturalQuery, history: [] }),
  });

  return queryPost(forwarded);
}
