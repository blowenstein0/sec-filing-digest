import { getAuthenticatedEmail } from "@/lib/auth";
import { lookupTicker } from "@/lib/edgar";

export async function GET(request: Request) {
  const email = await getAuthenticatedEmail();
  if (!email) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(request.url);
  const ticker = url.searchParams.get("ticker")?.toUpperCase();

  if (!ticker) {
    return Response.json({ error: "Ticker required" }, { status: 400 });
  }

  const match = await lookupTicker(ticker);

  if (!match) {
    return Response.json({ error: `Ticker "${ticker}" not found` }, { status: 404 });
  }

  return Response.json({ cik: match.cik, company_name: match.name, ticker });
}
