import type { CompanyFacts, FinancialMetric, XBRLDataPoint } from "@/types";

const EDGAR_HEADERS = {
  "User-Agent": "ZipperDataBrief/1.0 (your-email@example.com)",
  Accept: "application/json",
};

const RATE_DELAY_MS = 150;

function padCik(cik: string): string {
  return cik.padStart(10, "0");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Ticker lookup (shared cache) ---

const TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
let tickerCache: Map<string, { cik: string; name: string }> | null = null;

export async function lookupTicker(
  ticker: string
): Promise<{ cik: string; name: string } | null> {
  if (!tickerCache) {
    const res = await fetch(TICKERS_URL, { headers: EDGAR_HEADERS });
    const data = await res.json();
    tickerCache = new Map();
    for (const entry of Object.values(data) as Array<{
      cik_str: string;
      ticker: string;
      title: string;
    }>) {
      tickerCache.set(entry.ticker.toUpperCase(), {
        cik: String(entry.cik_str),
        name: entry.title,
      });
    }
  }
  return tickerCache.get(ticker.toUpperCase()) || null;
}

// --- Company Facts (XBRL structured financials) ---

export async function fetchCompanyFacts(
  cik: string
): Promise<CompanyFacts | null> {
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${padCik(cik)}.json`;
  const res = await fetch(url, { headers: EDGAR_HEADERS });
  if (!res.ok) return null;
  return res.json();
}

// --- Company Submissions (filing history) ---

interface CompanySubmissions {
  name: string;
  cik: string;
  filings: {
    recent: {
      accessionNumber: string[];
      form: string[];
      filingDate: string[];
      primaryDocument: string[];
      primaryDocDescription: string[];
    };
  };
}

export async function fetchCompanySubmissions(
  cik: string
): Promise<CompanySubmissions | null> {
  const url = `https://data.sec.gov/submissions/CIK${padCik(cik)}.json`;
  const res = await fetch(url, { headers: EDGAR_HEADERS });
  if (!res.ok) return null;
  return res.json();
}

// --- Filing text fetching ---

export async function fetchFilingText(
  cik: string,
  accessionNumber: string,
  primaryDocument: string
): Promise<string> {
  const accNoFmt = accessionNumber.replace(/-/g, "");
  const url = `https://www.sec.gov/Archives/edgar/data/${cik}/${accNoFmt}/${primaryDocument}`;
  const res = await fetch(url, { headers: EDGAR_HEADERS });
  if (!res.ok) return "";

  let text = await res.text();

  // Remove entire XBRL hidden blocks (iXBRL filings wrap metadata in hidden divs)
  text = text.replace(/<div[^>]*style="[^"]*display:\s*none[^"]*"[^>]*>[\s\S]*?<\/div>/gi, " ");

  // Remove ix:header blocks (inline XBRL metadata)
  text = text.replace(/<ix:header>[\s\S]*?<\/ix:header>/gi, " ");

  // Remove all ix: and xbrli: elements but keep their text content
  text = text.replace(/<\/?(?:ix|xbrli|xbrldi|link|xlink):[^>]*>/gi, " ");

  // Strip remaining HTML tags
  text = text.replace(/<[^>]+>/g, " ");

  // Remove common XBRL artifacts that survive tag stripping
  text = text.replace(/\b(?:us-gaap|dei|srt|country):[A-Za-z]+\b/g, " ");
  text = text.replace(/http:\/\/(?:fasb\.org|xbrl\.sec\.gov|www\.w3\.org)\S*/g, " ");

  // Normalize whitespace
  text = text.replace(/\s+/g, " ").trim();

  return text.slice(0, 50_000);
}

// --- Section extraction from 10-K/10-Q text ---

const SECTION_PATTERNS: Record<string, RegExp> = {
  risk_factors:
    /item\s+1a[\.\s\-:]+risk\s+factors([\s\S]*?)(?=item\s+1b[\.\s\-:]|item\s+2[\.\s\-:])/i,
  mda: /item\s+7[\.\s\-:]+management['']?s?\s+discussion([\s\S]*?)(?=item\s+7a[\.\s\-:]|item\s+8[\.\s\-:])/i,
  business:
    /item\s+1[\.\s\-:]+business([\s\S]*?)(?=item\s+1a[\.\s\-:]|item\s+2[\.\s\-:])/i,
};

export function extractFilingSection(
  text: string,
  section: "risk_factors" | "mda" | "business"
): string {
  const match = text.match(SECTION_PATTERNS[section]);
  if (!match || !match[1]) return "";
  return match[1].trim().slice(0, 30_000);
}

// --- Financial metric extraction from XBRL ---

// Multiple XBRL concepts per metric — companies use different tags
const METRIC_CONCEPTS: Record<string, string[]> = {
  Revenue: [
    "Revenues",
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "RevenueFromContractWithCustomerIncludingAssessedTax",
    "SalesRevenueNet",
    "SalesRevenueGoodsNet",
  ],
  "Net Income": ["NetIncomeLoss", "ProfitLoss"],
  "Operating Income": [
    "OperatingIncomeLoss",
    "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest",
  ],
  "R&D Expense": [
    "ResearchAndDevelopmentExpense",
    "ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost",
  ],
  "Total Assets": ["Assets"],
  "Stockholders' Equity": [
    "StockholdersEquity",
    "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
  ],
  "Long-term Debt": [
    "LongTermDebt",
    "LongTermDebtNoncurrent",
    "LongTermDebtAndCapitalLeaseObligations",
  ],
  "EPS (Basic)": ["EarningsPerShareBasic"],
  "Cash & Equivalents": [
    "CashAndCashEquivalentsAtCarryingValue",
    "CashCashEquivalentsAndShortTermInvestments",
  ],
  "Gross Profit": ["GrossProfit"],
  "Cost of Revenue": [
    "CostOfRevenue",
    "CostOfGoodsAndServicesSold",
    "CostOfGoodsSold",
  ],
};

function extractAnnualValues(
  dataPoints: XBRLDataPoint[]
): { year: number; value: number; form: string }[] {
  // Filter to 10-K filings, full-year period only (fp=FY), with a start date
  const annual = dataPoints.filter(
    (dp) => dp.form === "10-K" && dp.fp === "FY" && dp.start
  );

  // Deduplicate by fiscal year, keep latest filed
  const byYear = new Map<number, XBRLDataPoint>();
  for (const dp of annual) {
    const existing = byYear.get(dp.fy);
    if (!existing || dp.filed > existing.filed) {
      byYear.set(dp.fy, dp);
    }
  }

  return Array.from(byYear.entries())
    .sort(([a], [b]) => b - a)
    .slice(0, 5)
    .map(([year, dp]) => ({ year, value: dp.val, form: dp.form }));
}

function extractInstantValues(
  dataPoints: XBRLDataPoint[]
): { year: number; value: number; form: string }[] {
  // For balance sheet items (no start date, just end/instant), full-year only
  const annual = dataPoints.filter(
    (dp) => dp.form === "10-K" && dp.fp === "FY" && !dp.start
  );

  const byYear = new Map<number, XBRLDataPoint>();
  for (const dp of annual) {
    const existing = byYear.get(dp.fy);
    if (!existing || dp.filed > existing.filed) {
      byYear.set(dp.fy, dp);
    }
  }

  return Array.from(byYear.entries())
    .sort(([a], [b]) => b - a)
    .slice(0, 5)
    .map(([year, dp]) => ({ year, value: dp.val, form: dp.form }));
}

// Balance sheet (instant) vs income statement (period) concepts
const INSTANT_METRICS = new Set([
  "Total Assets",
  "Stockholders' Equity",
  "Long-term Debt",
  "Cash & Equivalents",
]);

export function extractFinancialMetrics(
  facts: CompanyFacts,
  requestedMetrics?: string[]
): FinancialMetric[] {
  const usGaap = facts.facts["us-gaap"];
  if (!usGaap) return [];

  const metricsToExtract = requestedMetrics || Object.keys(METRIC_CONCEPTS);
  const results: FinancialMetric[] = [];

  for (const metricLabel of metricsToExtract) {
    const concepts = METRIC_CONCEPTS[metricLabel];
    if (!concepts) continue;

    for (const concept of concepts) {
      const fact = usGaap[concept];
      if (!fact) continue;

      const usdData = fact.units["USD"] || fact.units["USD/shares"];
      if (!usdData || usdData.length === 0) continue;

      const isInstant = INSTANT_METRICS.has(metricLabel);
      const periods = isInstant
        ? extractInstantValues(usdData)
        : extractAnnualValues(usdData);

      if (periods.length > 0) {
        results.push({ concept, label: metricLabel, periods });
        break; // Found data for this metric, move on
      }
    }
  }

  return results;
}

// --- Get latest 10-K filing info ---

export async function getLatest10K(
  cik: string
): Promise<{
  accessionNumber: string;
  primaryDocument: string;
  filingDate: string;
} | null> {
  const subs = await fetchCompanySubmissions(cik);
  if (!subs) return null;
  await delay(RATE_DELAY_MS);

  const recent = subs.filings.recent;
  for (let i = 0; i < recent.form.length; i++) {
    if (recent.form[i] === "10-K") {
      return {
        accessionNumber: recent.accessionNumber[i],
        primaryDocument: recent.primaryDocument[i],
        filingDate: recent.filingDate[i],
      };
    }
  }
  return null;
}

// --- Fetch everything needed for a research query ---

export interface ResearchData {
  name: string;
  cik: string;
  ticker: string;
  financials: FinancialMetric[];
  filingSection?: string;
  sectionName?: string;
  latestFilingDate?: string;
  latestFilingUrl?: string;
}

export async function gatherResearchData(
  ticker: string,
  options: {
    financials?: boolean;
    narrative?: "risk_factors" | "mda" | "business";
  } = { financials: true }
): Promise<ResearchData | null> {
  const company = await lookupTicker(ticker);
  if (!company) return null;

  const result: ResearchData = {
    name: company.name,
    cik: company.cik,
    ticker: ticker.toUpperCase(),
    financials: [],
  };

  // Fetch financials and filing info in parallel where possible
  const tasks: Promise<void>[] = [];

  if (options.financials !== false) {
    tasks.push(
      fetchCompanyFacts(company.cik).then((facts) => {
        if (facts) {
          result.financials = extractFinancialMetrics(facts);
        }
      })
    );
  }

  if (options.narrative) {
    tasks.push(
      (async () => {
        const filing10K = await getLatest10K(company.cik);
        if (!filing10K) return;

        result.latestFilingDate = filing10K.filingDate;
        const accNoFmt = filing10K.accessionNumber.replace(/-/g, "");
        result.latestFilingUrl = `https://www.sec.gov/Archives/edgar/data/${company.cik}/${accNoFmt}/${filing10K.primaryDocument}`;

        await delay(RATE_DELAY_MS);
        const text = await fetchFilingText(
          company.cik,
          filing10K.accessionNumber,
          filing10K.primaryDocument
        );
        if (text) {
          result.filingSection = extractFilingSection(text, options.narrative!);
          result.sectionName = options.narrative;
        }
      })()
    );
  }

  await Promise.all(tasks);
  return result;
}

// --- Format financials as text for LLM context ---

export function formatFinancialsForLLM(
  financials: FinancialMetric[]
): string {
  if (financials.length === 0) return "No XBRL financial data available.";

  const lines: string[] = [];
  for (const metric of financials) {
    const values = metric.periods
      .map((p) => {
        const formatted = formatNumber(p.value, metric.label);
        return `FY${p.year}: ${formatted}`;
      })
      .join(", ");
    lines.push(`${metric.label}: ${values}`);
  }
  return lines.join("\n");
}

function formatNumber(value: number, label: string): string {
  if (label.includes("EPS")) return `$${value.toFixed(2)}`;
  const abs = Math.abs(value);
  if (abs >= 1e12) return `$${(value / 1e12).toFixed(1)}T`;
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  return `$${value.toLocaleString()}`;
}
