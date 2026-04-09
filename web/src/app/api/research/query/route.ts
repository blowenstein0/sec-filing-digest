import { getAuthenticatedEmail } from "@/lib/auth";
import { gatherResearchData, formatFinancialsForLLM } from "@/lib/edgar";
import { invokeBedrockChat } from "@/lib/bedrock";
import type { Citation } from "@/types";

const SYSTEM_PROMPT = `You are a financial research analyst. Answer questions about public companies using only the EDGAR data provided below. Be specific with numbers, dates, and filing references.

Rules:
- Only use data from the provided context. Do not make up numbers.
- When citing financials, note the fiscal year and source (10-K).
- If the data doesn't contain enough information to answer fully, say so clearly.
- Keep answers concise but thorough. Use bullet points for lists.
- Format dollar amounts consistently (e.g., $412.3B, $94.8B).`;

// Simple keyword classification
function classifyQuery(query: string): {
  financials: boolean;
  narrative?: "risk_factors" | "mda" | "business";
} {
  const q = query.toLowerCase();

  const narrativeKeywords: Record<string, "risk_factors" | "mda" | "business"> =
    {
      risk: "risk_factors",
      "risk factor": "risk_factors",
      threat: "risk_factors",
      danger: "risk_factors",
      "management discussion": "mda",
      mda: "mda",
      "md&a": "mda",
      outlook: "mda",
      guidance: "mda",
      "business description": "business",
      "business model": "business",
      "what does": "business",
      "what do they do": "business",
      overview: "business",
      segment: "business",
    };

  let narrative: "risk_factors" | "mda" | "business" | undefined;
  for (const [keyword, section] of Object.entries(narrativeKeywords)) {
    if (q.includes(keyword)) {
      narrative = section;
      break;
    }
  }

  const financialKeywords = [
    "revenue",
    "income",
    "profit",
    "margin",
    "debt",
    "asset",
    "equity",
    "eps",
    "earnings",
    "cash",
    "r&d",
    "research",
    "growth",
    "financial",
    "balance sheet",
    "cost",
  ];
  const financials =
    financialKeywords.some((kw) => q.includes(kw)) || !narrative;

  return { financials, narrative };
}

// Extract ticker from query — looks for $TICKER or all-caps 1-5 letter words
function extractTicker(query: string): string | null {
  // Check for $TICKER format
  const dollarMatch = query.match(/\$([A-Z]{1,5})\b/);
  if (dollarMatch) return dollarMatch[1];

  // Check for common patterns like "Apple (AAPL)" or just "AAPL"
  const parenMatch = query.match(/\(([A-Z]{1,5})\)/);
  if (parenMatch) return parenMatch[1];

  // Look for standalone all-caps words that could be tickers (2-5 chars)
  const words = query.split(/\s+/);
  for (const word of words) {
    const clean = word.replace(/[^A-Z]/g, "");
    if (clean.length >= 2 && clean.length <= 5 && clean === word.replace(/[^A-Za-z]/g, "").toUpperCase()) {
      // Skip common English words that look like tickers
      const skipWords = new Set(["THE", "AND", "FOR", "ARE", "BUT", "NOT", "YOU", "ALL", "CAN", "HER", "WAS", "ONE", "OUR", "OUT", "SEC", "CEO", "CFO", "IPO"]);
      if (!skipWords.has(clean)) return clean;
    }
  }

  return null;
}

export async function POST(request: Request) {
  const email = await getAuthenticatedEmail();
  if (!email) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();
  const { query, ticker: explicitTicker } = body;

  if (!query || typeof query !== "string") {
    return Response.json({ error: "Query required" }, { status: 400 });
  }

  const ticker = explicitTicker || extractTicker(query);
  if (!ticker) {
    return Response.json(
      { error: "Could not identify a company ticker. Include a ticker like AAPL or $MSFT in your question." },
      { status: 400 }
    );
  }

  const classification = classifyQuery(query);

  const data = await gatherResearchData(ticker, {
    financials: classification.financials,
    narrative: classification.narrative,
  });

  if (!data) {
    return Response.json(
      { error: `Ticker "${ticker}" not found in EDGAR.` },
      { status: 404 }
    );
  }

  // Build context for LLM
  let context = `Company: ${data.name} (${data.ticker}, CIK ${data.cik})\n\n`;

  const sources: Citation[] = [];

  if (data.financials.length > 0) {
    context += `[FINANCIAL DATA - from XBRL Company Facts]\n`;
    context += formatFinancialsForLLM(data.financials);
    context += "\n\n";
    sources.push({
      type: "xbrl",
      label: `XBRL Company Facts — ${data.name}`,
      url: `https://data.sec.gov/api/xbrl/companyfacts/CIK${data.cik.padStart(10, "0")}.json`,
    });
  }

  if (data.filingSection) {
    const sectionLabels: Record<string, string> = {
      risk_factors: "Risk Factors (Item 1A)",
      mda: "Management's Discussion & Analysis (Item 7)",
      business: "Business Description (Item 1)",
    };
    const label = sectionLabels[data.sectionName || ""] || "Filing Section";
    context += `[FILING TEXT - 10-K ${label}, filed ${data.latestFilingDate}]\n`;
    context += data.filingSection;
    context += "\n\n";
    if (data.latestFilingUrl) {
      sources.push({
        type: "filing",
        label: `10-K filed ${data.latestFilingDate}`,
        url: data.latestFilingUrl,
      });
    }
  }

  context += `Question: ${query}`;

  const answer = await invokeBedrockChat(SYSTEM_PROMPT, context);

  return Response.json({ answer, sources });
}
