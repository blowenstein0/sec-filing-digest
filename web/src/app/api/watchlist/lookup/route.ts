import { getAuthenticatedEmail } from "@/lib/auth";

const EDGAR_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const EDGAR_HEADERS = {
  "User-Agent": "ZipperDataBrief/1.0 (your-email@example.com)",
};

// Cache the ticker map in memory (refreshed per cold start)
let tickerCache: Map<string, { cik: string; name: string }> | null = null;

async function loadTickerMap(): Promise<Map<string, { cik: string; name: string }>> {
  if (tickerCache) return tickerCache;

  const res = await fetch(EDGAR_TICKERS_URL, { headers: EDGAR_HEADERS });
  const data = await res.json();

  tickerCache = new Map();
  for (const entry of Object.values(data) as Array<{ cik_str: string; ticker: string; title: string }>) {
    tickerCache.set(entry.ticker.toUpperCase(), {
      cik: String(entry.cik_str),
      name: entry.title,
    });
  }

  return tickerCache;
}

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

  const map = await loadTickerMap();
  const match = map.get(ticker);

  if (!match) {
    return Response.json({ error: `Ticker "${ticker}" not found` }, { status: 404 });
  }

  return Response.json({ cik: match.cik, company_name: match.name, ticker });
}
