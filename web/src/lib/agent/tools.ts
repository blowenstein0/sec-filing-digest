import type { ToolConfiguration } from "@aws-sdk/client-bedrock-runtime";
import type { Citation } from "@/types";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import {
  lookupTicker,
  fetchCompanyFacts,
  extractFinancialMetrics,
  formatFinancialsForLLM,
  fetchCompanySubmissions,
  getLatest10K,
  fetchFilingText,
} from "@/lib/edgar";
import { searchFilingChunks, uploadForIndexing } from "@/lib/rag";

const ddbClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.APP_REGION || process.env.AWS_REGION || "us-east-1" })
);
const METRICS_TABLE = process.env.METRICS_TABLE || "sec-financial-metrics";

// Rate limiting — shared across all tool calls in a single agent run
let lastEdgarCall = 0;
const RATE_DELAY_MS = 150;

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastEdgarCall;
  if (elapsed < RATE_DELAY_MS) {
    await new Promise((r) => setTimeout(r, RATE_DELAY_MS - elapsed));
  }
  lastEdgarCall = Date.now();
}

export function resetRateLimit(): void {
  lastEdgarCall = 0;
}

// --- Tool result type ---

export interface ToolResult {
  text: string;
  sources: Citation[];
  // For building ComparisonData on the route handler side
  meta?: {
    ticker?: string;
    financials?: { label: string; value: number; year: number }[];
  };
}

// --- Tool executor registry ---

type ToolExecutorFn = (input: Record<string, unknown>) => Promise<ToolResult>;

// Read pre-normalized metrics from DynamoDB
async function getCachedMetrics(ticker: string): Promise<ToolResult | null> {
  try {
    const result = await ddbClient.send(
      new GetCommand({
        TableName: METRICS_TABLE,
        Key: { ticker: ticker.toUpperCase() },
      })
    );

    if (!result.Item) return null;

    const item = result.Item;
    const metrics = item.metrics as Record<
      string,
      { concept: string; periods: { year: number; end_date: string; value: number; filed: string }[] }
    >;

    // Format for LLM
    const lines: string[] = [];
    const metaFinancials: { label: string; value: number; year: number }[] = [];

    for (const [label, data] of Object.entries(metrics)) {
      const values = data.periods
        .map((p) => {
          const val = Number(p.value);
          metaFinancials.push({ label, value: val, year: p.year });
          return `FY${p.year}: ${formatDollar(val, label)}`;
        })
        .join(", ");
      lines.push(`${label}: ${values}`);
    }

    return {
      text: `Financial metrics for ${item.company_name} (${ticker}) [updated ${item.updated_at}]:\n${lines.join("\n")}`,
      sources: [
        {
          type: "xbrl" as const,
          label: `XBRL (normalized) — ${item.company_name}`,
          url: `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(item.cik).padStart(10, "0")}.json`,
        },
      ],
      meta: { ticker, financials: metaFinancials },
    };
  } catch {
    return null; // Fall back to live EDGAR
  }
}

function formatDollar(value: number, label: string): string {
  if (label.includes("EPS")) return `$${value.toFixed(2)}`;
  const abs = Math.abs(value);
  if (abs >= 1e12) return `$${(value / 1e12).toFixed(1)}T`;
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  return `$${value.toLocaleString()}`;
}

const executors: Record<string, ToolExecutorFn> = {
  lookup_ticker: async (input) => {
    const ticker = input.ticker as string;
    await rateLimit();
    const result = await lookupTicker(ticker);
    if (!result) {
      return {
        text: `Ticker "${ticker}" not found in EDGAR.`,
        sources: [],
      };
    }
    return {
      text: `${ticker} → ${result.name} (CIK: ${result.cik})`,
      sources: [],
      meta: { ticker: ticker.toUpperCase() },
    };
  },

  get_financial_metrics: async (input) => {
    const ticker = (input.ticker as string).toUpperCase();

    // Try DynamoDB cache first (pre-normalized data)
    const cached = await getCachedMetrics(ticker);
    if (cached) {
      return cached;
    }

    // Cache miss — fall back to live EDGAR fetch
    const company = await lookupTicker(ticker);
    if (!company) {
      return { text: `Ticker "${ticker}" not found.`, sources: [] };
    }

    await rateLimit();
    const facts = await fetchCompanyFacts(company.cik);
    if (!facts) {
      return {
        text: `No XBRL financial data available for ${ticker}.`,
        sources: [],
      };
    }

    const requestedMetrics = input.metrics as string[] | undefined;
    const metrics = extractFinancialMetrics(facts, requestedMetrics);
    if (metrics.length === 0) {
      return {
        text: `No matching financial metrics found for ${ticker}.`,
        sources: [],
      };
    }

    const formatted = formatFinancialsForLLM(metrics);
    const cikPadded = company.cik.padStart(10, "0");

    const metaFinancials = metrics.flatMap((m) =>
      m.periods.map((p) => ({ label: m.label, value: p.value, year: p.year }))
    );

    return {
      text: `Financial metrics for ${company.name} (${ticker}) [from live EDGAR — may be less accurate]:\n${formatted}`,
      sources: [
        {
          type: "xbrl" as const,
          label: `XBRL Company Facts — ${company.name}`,
          url: `https://data.sec.gov/api/xbrl/companyfacts/CIK${cikPadded}.json`,
        },
      ],
      meta: { ticker, financials: metaFinancials },
    };
  },

  read_filing: async (input) => {
    const ticker = (input.ticker as string).toUpperCase();
    const formType = (input.form_type as string) || "10-K";
    const year = input.year as number | undefined;
    const topic = input.topic as string | undefined;

    const company = await lookupTicker(ticker);
    if (!company) {
      return { text: `Ticker "${ticker}" not found.`, sources: [] };
    }

    // Find the right filing from submissions
    await rateLimit();
    const subs = await fetchCompanySubmissions(company.cik);
    if (!subs) {
      return { text: `Could not fetch filings for ${ticker}.`, sources: [] };
    }

    const recent = subs.filings.recent;
    let filingIdx = -1;

    for (let i = 0; i < recent.form.length; i++) {
      if (recent.form[i] !== formType) continue;
      if (year) {
        const filingYear = parseInt(recent.filingDate[i].slice(0, 4));
        // Match the filing year or the fiscal year it covers (filed year or year before)
        if (filingYear !== year && filingYear !== year + 1) continue;
      }
      filingIdx = i;
      break;
    }

    if (filingIdx === -1) {
      // No matching filing — return the list of available ones
      const available: string[] = [];
      const seen = new Set<string>();
      for (let i = 0; i < recent.form.length && available.length < 15; i++) {
        const key = `${recent.form[i]}-${recent.filingDate[i]}`;
        if (seen.has(key)) continue;
        seen.add(key);
        available.push(`${recent.form[i]} | ${recent.filingDate[i]} | ${recent.primaryDocDescription[i] || "N/A"}`);
      }
      return {
        text: `No ${formType}${year ? ` for ${year}` : ""} found for ${ticker}. Available filings:\n${available.join("\n")}`,
        sources: [],
      };
    }

    const accessionNumber = recent.accessionNumber[filingIdx];
    const primaryDocument = recent.primaryDocument[filingIdx];
    const filingDate = recent.filingDate[filingIdx];

    await rateLimit();
    const text = await fetchFilingText(company.cik, accessionNumber, primaryDocument);

    const accNoFmt = accessionNumber.replace(/-/g, "");
    const filingUrl = `https://www.sec.gov/Archives/edgar/data/${company.cik}/${accNoFmt}/${primaryDocument}`;
    const source = {
      type: "filing" as const,
      label: `${formType} filed ${filingDate}`,
      url: filingUrl,
    };

    if (!text || text.length < 100) {
      return {
        text: `Could not retrieve ${formType} text for ${ticker} (filed ${filingDate}).`,
        sources: [source],
      };
    }

    const header = `${company.name} ${formType} (filed ${filingDate})`;
    const context = topic ? `. Focus on: ${topic}` : "";

    return {
      text: `${header}${context}\n\n${text}`,
      sources: [source],
    };
  },

  search_filing: async (input) => {
    const ticker = (input.ticker as string).toUpperCase();
    const query = input.query as string;
    const formType = (input.form_type as string) || "10-K";

    // Try RAG first
    const ragResult = await searchFilingChunks(ticker, query, formType);
    if (ragResult && ragResult.chunkCount > 0) {
      return {
        text: `${ticker} ${formType} — Search results for "${query}" (${ragResult.chunkCount} passages):\n\n${ragResult.fullText}`,
        sources: ragResult.sources,
      };
    }

    // KB miss — fall back to read_filing behavior (fetch from EDGAR)
    const company = await lookupTicker(ticker);
    if (!company) {
      return { text: `Ticker "${ticker}" not found.`, sources: [] };
    }

    await rateLimit();
    const subs = await fetchCompanySubmissions(company.cik);
    if (!subs) {
      return { text: `Could not fetch filings for ${ticker}.`, sources: [] };
    }

    // Find the filing
    const recent = subs.filings.recent;
    let filingIdx = -1;
    for (let i = 0; i < recent.form.length; i++) {
      if (recent.form[i] === formType) { filingIdx = i; break; }
    }
    if (filingIdx === -1) {
      return { text: `No ${formType} found for ${ticker}.`, sources: [] };
    }

    const accessionNumber = recent.accessionNumber[filingIdx];
    const primaryDocument = recent.primaryDocument[filingIdx];
    const filingDate = recent.filingDate[filingIdx];

    await rateLimit();
    const text = await fetchFilingText(company.cik, accessionNumber, primaryDocument);

    const accNoFmt = accessionNumber.replace(/-/g, "");
    const filingUrl = `https://www.sec.gov/Archives/edgar/data/${company.cik}/${accNoFmt}/${primaryDocument}`;

    // Fire-and-forget: upload full text to S3 for async indexing
    // Next time this ticker is queried, RAG will have the chunks
    uploadForIndexing(ticker, accessionNumber, formType, filingDate, company.name, company.cik, text);

    if (!text || text.length < 100) {
      return {
        text: `Could not retrieve ${formType} text for ${ticker}.`,
        sources: [{ type: "filing" as const, label: `${formType} filed ${filingDate}`, url: filingUrl }],
      };
    }

    return {
      text: `${company.name} ${formType} (filed ${filingDate}). Focus on: ${query}\n\n[Note: This is truncated raw text. Semantic search will be available for this filing on your next query.]\n\n${text}`,
      sources: [{ type: "filing" as const, label: `${formType} filed ${filingDate}`, url: filingUrl }],
    };
  },
};

export async function executeTool(
  name: string,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const executor = executors[name];
  if (!executor) {
    return {
      text: `Unknown tool: ${name}`,
      sources: [],
    };
  }
  return executor(input);
}

// --- Tool label for progress display ---

export function getToolLabel(name: string, input: Record<string, unknown>): string {
  const ticker = input.ticker as string | undefined;
  switch (name) {
    case "lookup_ticker":
      return `Looking up ${ticker || "ticker"}`;
    case "get_financial_metrics":
      return `Fetching financials for ${ticker || "company"}`;
    case "read_filing": {
      const ft = (input.form_type as string) || "10-K";
      const yr = input.year ? ` (${input.year})` : "";
      return `Reading ${ft}${yr} for ${ticker || "company"}`;
    }
    case "search_filing":
      return `Searching ${(input.form_type as string) || "10-K"} for ${ticker || "company"}`;
    default:
      return `Running ${name}`;
  }
}

// --- Bedrock Converse tool configuration ---

export const TOOL_CONFIG: ToolConfiguration = {
  tools: [
    {
      toolSpec: {
        name: "lookup_ticker",
        description:
          "Look up a stock ticker symbol to get the company name and SEC CIK number. Always call this first before other tools.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              ticker: {
                type: "string",
                description: "Stock ticker symbol, e.g. AAPL, MSFT, NVDA",
              },
            },
            required: ["ticker"],
          },
        },
      },
    },
    {
      toolSpec: {
        name: "get_financial_metrics",
        description:
          "Fetch structured financial metrics from XBRL filings. Returns up to 5 years of annual data for metrics like Revenue, Net Income, Operating Income, R&D Expense, Total Assets, Stockholders' Equity, Long-term Debt, EPS, Cash & Equivalents, Gross Profit, Cost of Revenue.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              ticker: {
                type: "string",
                description: "Stock ticker symbol",
              },
              metrics: {
                type: "array",
                items: { type: "string" },
                description:
                  "Optional: specific metrics to fetch. If omitted, returns all available metrics.",
              },
            },
            required: ["ticker"],
          },
        },
      },
    },
    {
      toolSpec: {
        name: "read_filing",
        description:
          "Read the full text of an SEC filing for a company. By default fetches the most recent 10-K, but you can specify any form type (10-Q, 8-K, DEF 14A, etc.) and a specific year. Returns the complete filing text. If no matching filing is found, returns a list of available filings.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              ticker: {
                type: "string",
                description: "Stock ticker symbol",
              },
              form_type: {
                type: "string",
                description: "Filing type: '10-K' (default), '10-Q', '8-K', 'DEF 14A', 'SC 13D', etc.",
              },
              year: {
                type: "number",
                description: "Fiscal year to target, e.g. 2023. Omit for the most recent filing.",
              },
              topic: {
                type: "string",
                description: "What you're looking for in the filing, e.g. 'risk factors', 'executive compensation', 'revenue breakdown'. Helps focus your analysis.",
              },
            },
            required: ["ticker"],
          },
        },
      },
    },
    {
      toolSpec: {
        name: "search_filing",
        description:
          "Semantic search over SEC filing text. Returns the most relevant passages from 10-K or 10-Q filings for a given company and topic. Use this instead of read_filing when you need specific information from large filings (10-K, 10-Q) — it finds the exact paragraphs relevant to your question. For small filings (8-K, DEF 14A), use read_filing instead.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              ticker: {
                type: "string",
                description: "Stock ticker symbol",
              },
              query: {
                type: "string",
                description: "What to search for, e.g. 'risk factors related to supply chain', 'revenue breakdown by segment', 'executive compensation'",
              },
              form_type: {
                type: "string",
                description: "Filing type to search: '10-K' (default) or '10-Q'",
              },
            },
            required: ["ticker", "query"],
          },
        },
      },
    },
  ],
};
