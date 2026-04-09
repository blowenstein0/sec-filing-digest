import type { ToolConfiguration } from "@aws-sdk/client-bedrock-runtime";
import type { Citation } from "@/types";
import {
  lookupTicker,
  fetchCompanyFacts,
  extractFinancialMetrics,
  formatFinancialsForLLM,
  fetchCompanySubmissions,
  getLatest10K,
  fetchFilingText,
  extractFilingSection,
} from "@/lib/edgar";

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

    // Build meta for ComparisonData
    const metaFinancials = metrics.flatMap((m) =>
      m.periods.map((p) => ({ label: m.label, value: p.value, year: p.year }))
    );

    return {
      text: `Financial metrics for ${company.name} (${ticker}):\n${formatted}`,
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

  get_filing_section: async (input) => {
    const ticker = (input.ticker as string).toUpperCase();
    const section = input.section as "risk_factors" | "mda" | "business";

    const company = await lookupTicker(ticker);
    if (!company) {
      return { text: `Ticker "${ticker}" not found.`, sources: [] };
    }

    await rateLimit();
    const filing10K = await getLatest10K(company.cik);
    if (!filing10K) {
      return {
        text: `No 10-K filing found for ${ticker}.`,
        sources: [],
      };
    }

    await rateLimit();
    const text = await fetchFilingText(
      company.cik,
      filing10K.accessionNumber,
      filing10K.primaryDocument
    );
    if (!text) {
      return {
        text: `Could not retrieve filing text for ${ticker} 10-K.`,
        sources: [],
      };
    }

    const extracted = extractFilingSection(text, section);
    const sectionLabels: Record<string, string> = {
      risk_factors: "Risk Factors (Item 1A)",
      mda: "Management's Discussion & Analysis (Item 7)",
      business: "Business Description (Item 1)",
    };

    const accNoFmt = filing10K.accessionNumber.replace(/-/g, "");
    const filingUrl = `https://www.sec.gov/Archives/edgar/data/${company.cik}/${accNoFmt}/${filing10K.primaryDocument}`;

    if (!extracted) {
      return {
        text: `Could not extract ${sectionLabels[section]} from ${ticker}'s 10-K (filed ${filing10K.filingDate}). The section heading may use non-standard formatting.`,
        sources: [
          {
            type: "filing" as const,
            label: `10-K filed ${filing10K.filingDate}`,
            url: filingUrl,
          },
        ],
      };
    }

    return {
      text: `${sectionLabels[section]} from ${company.name}'s 10-K (filed ${filing10K.filingDate}):\n\n${extracted}`,
      sources: [
        {
          type: "filing" as const,
          label: `10-K filed ${filing10K.filingDate}`,
          url: filingUrl,
        },
      ],
    };
  },

  get_filing_list: async (input) => {
    const ticker = (input.ticker as string).toUpperCase();
    const formType = input.form_type as string | undefined;
    const limit = (input.limit as number) || 10;

    const company = await lookupTicker(ticker);
    if (!company) {
      return { text: `Ticker "${ticker}" not found.`, sources: [] };
    }

    await rateLimit();
    const subs = await fetchCompanySubmissions(company.cik);
    if (!subs) {
      return {
        text: `Could not fetch filing history for ${ticker}.`,
        sources: [],
      };
    }

    const recent = subs.filings.recent;
    const results: string[] = [];
    let count = 0;

    for (let i = 0; i < recent.form.length && count < limit; i++) {
      if (formType && recent.form[i] !== formType) continue;
      results.push(
        `${recent.form[i]} | ${recent.filingDate[i]} | ${recent.primaryDocDescription[i] || "N/A"} | Accession: ${recent.accessionNumber[i]}`
      );
      count++;
    }

    return {
      text: `Recent filings for ${company.name} (${ticker}):\n${results.join("\n") || "No filings found."}`,
      sources: [],
    };
  },

  get_raw_filing_text: async (input) => {
    const cik = input.cik as string;
    const accessionNumber = input.accession_number as string;
    const primaryDocument = input.primary_document as string;

    await rateLimit();
    const text = await fetchFilingText(cik, accessionNumber, primaryDocument);

    if (!text) {
      return {
        text: "Could not retrieve filing text.",
        sources: [],
      };
    }

    const accNoFmt = accessionNumber.replace(/-/g, "");
    const url = `https://www.sec.gov/Archives/edgar/data/${cik}/${accNoFmt}/${primaryDocument}`;

    return {
      text: text.slice(0, 40_000), // Leave room in context
      sources: [
        {
          type: "filing" as const,
          label: `Filing ${accessionNumber}`,
          url,
        },
      ],
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
    case "get_filing_section": {
      const sections: Record<string, string> = {
        risk_factors: "risk factors",
        mda: "MD&A",
        business: "business description",
      };
      return `Reading ${sections[input.section as string] || "filing section"} for ${ticker || "company"}`;
    }
    case "get_filing_list":
      return `Checking filing history for ${ticker || "company"}`;
    case "get_raw_filing_text":
      return `Reading filing document`;
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
        name: "get_filing_section",
        description:
          "Extract a specific section from the company's most recent 10-K annual report. Available sections: risk_factors (Item 1A — risks and uncertainties), mda (Item 7 — Management's Discussion and Analysis), business (Item 1 — business overview and segments).",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              ticker: {
                type: "string",
                description: "Stock ticker symbol",
              },
              section: {
                type: "string",
                enum: ["risk_factors", "mda", "business"],
                description: "Which section to extract from the 10-K",
              },
            },
            required: ["ticker", "section"],
          },
        },
      },
    },
    {
      toolSpec: {
        name: "get_filing_list",
        description:
          "List recent SEC filings for a company. Useful for seeing what filings are available, checking dates, or finding specific accession numbers for deeper reading.",
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
                description:
                  "Optional: filter by form type (e.g. '10-K', '10-Q', '8-K', 'DEF 14A')",
              },
              limit: {
                type: "number",
                description: "Maximum filings to return (default 10)",
              },
            },
            required: ["ticker"],
          },
        },
      },
    },
    {
      toolSpec: {
        name: "get_raw_filing_text",
        description:
          "Fetch the full text of a specific SEC filing by its accession number and primary document. Use this when you need to read a filing that isn't the latest 10-K, or when you need the full text rather than a specific section.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              cik: { type: "string", description: "Company CIK number" },
              accession_number: {
                type: "string",
                description: "Filing accession number (e.g. 0000320193-24-000123)",
              },
              primary_document: {
                type: "string",
                description: "Primary document filename (e.g. aapl-20240928.htm)",
              },
            },
            required: ["cik", "accession_number", "primary_document"],
          },
        },
      },
    },
  ],
};
