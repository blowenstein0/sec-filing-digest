import { getAuthenticatedEmail } from "@/lib/auth";
import {
  lookupTicker,
  fetchCompanyFacts,
  extractFinancialMetrics,
  formatFinancialsForLLM,
} from "@/lib/edgar";
import { invokeBedrockChat } from "@/lib/bedrock";
import type { Citation, ComparisonData, FinancialMetric } from "@/types";

const SYSTEM_PROMPT = `You are a financial research analyst comparing public companies. Use only the EDGAR data provided below.

Rules:
- Present comparisons with specific numbers from the data.
- For each metric, note which company leads and by how much (absolute and percentage).
- Identify trends: who is growing faster, who has better margins, etc.
- Cite fiscal years for all data points.
- Keep the analysis focused and actionable.
- Use bullet points and clear structure.`;

const RATE_DELAY_MS = 150;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: Request) {
  const email = await getAuthenticatedEmail();
  if (!email) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await request.json();
  const { tickers, query } = body;

  if (!tickers || !Array.isArray(tickers) || tickers.length < 2) {
    return Response.json(
      { error: "At least 2 tickers required for comparison." },
      { status: 400 }
    );
  }

  if (tickers.length > 5) {
    return Response.json(
      { error: "Maximum 5 companies per comparison." },
      { status: 400 }
    );
  }

  // Look up all tickers
  const companies: { ticker: string; cik: string; name: string }[] = [];
  for (const t of tickers) {
    const match = await lookupTicker(t);
    if (!match) {
      return Response.json(
        { error: `Ticker "${t}" not found in EDGAR.` },
        { status: 404 }
      );
    }
    companies.push({ ticker: t.toUpperCase(), ...match });
  }

  // Fetch XBRL facts for all companies (with rate limiting)
  const allFinancials: Map<string, FinancialMetric[]> = new Map();
  const sources: Citation[] = [];

  for (let i = 0; i < companies.length; i++) {
    if (i > 0) await delay(RATE_DELAY_MS);
    const facts = await fetchCompanyFacts(companies[i].cik);
    if (facts) {
      allFinancials.set(
        companies[i].ticker,
        extractFinancialMetrics(facts)
      );
      sources.push({
        type: "xbrl",
        label: `XBRL — ${companies[i].name}`,
        url: `https://data.sec.gov/api/xbrl/companyfacts/CIK${companies[i].cik.padStart(10, "0")}.json`,
      });
    }
  }

  // Build structured comparison data for the frontend table
  const comparison = buildComparisonData(companies, allFinancials);

  // Build LLM context
  let context = "";
  for (const co of companies) {
    const financials = allFinancials.get(co.ticker) || [];
    context += `=== ${co.name} (${co.ticker}, CIK ${co.cik}) ===\n`;
    context += formatFinancialsForLLM(financials);
    context += "\n\n";
  }

  context += `Compare these companies${query ? `: ${query}` : ". Provide a structured comparison with key insights."}`;

  const answer = await invokeBedrockChat(SYSTEM_PROMPT, context, 3000);

  return Response.json({ answer, sources, comparison });
}

function buildComparisonData(
  companies: { ticker: string; cik: string; name: string }[],
  allFinancials: Map<string, FinancialMetric[]>
): ComparisonData {
  const companyNames = companies.map((c) => c.ticker);

  // Find common metrics across companies and use the most recent year
  const metricLabels = new Set<string>();
  for (const financials of allFinancials.values()) {
    for (const m of financials) {
      metricLabels.add(m.label);
    }
  }

  const metrics: ComparisonData["metrics"] = [];
  for (const label of metricLabels) {
    const values: Record<string, number | string> = {};
    let hasAnyValue = false;

    for (const co of companies) {
      const financials = allFinancials.get(co.ticker) || [];
      const metric = financials.find((m) => m.label === label);
      if (metric && metric.periods.length > 0) {
        values[co.ticker] = metric.periods[0].value;
        hasAnyValue = true;
      } else {
        values[co.ticker] = "N/A";
      }
    }

    if (hasAnyValue) {
      metrics.push({ label, values });
    }
  }

  return { companies: companyNames, metrics };
}
