export type Cadence = "daily" | "weekly";

export type UserStatus = "pending" | "active" | "paused" | "unsubscribed";

export type FormType = "8-K" | "10-K" | "10-Q" | "13F-HR" | "SC 13D" | "SC 13D/A" | "SC 13G" | "SC 13G/A" | "DEF 14A";

export interface User {
  email: string;
  status: UserStatus;
  cadence: Cadence;
  tier: "free" | "pro" | "enterprise";
  createdAt: string;
  verifiedAt?: string;
  unsubscribeToken: string;
}

export interface WatchlistEntry {
  email: string;
  cik: string;
  ticker?: string;
  company_name: string;
  form_types: FormType[];
  keywords: string[];
  addedAt: string;
}

export interface Filing {
  accession_number: string;
  cik: string;
  company_name: string;
  form_type: string;
  filed_at: string;
  primary_document: string;
  description: string;
  summary: string;
  processed_at: string;
}

export interface UserPreferences {
  cadence: Cadence;
}

export interface Session {
  email: string;
  token: string;
  expiresAt: number;
}

// --- Research / EDGAR XBRL types ---

export interface CompanyFacts {
  cik: number;
  entityName: string;
  facts: {
    "us-gaap"?: Record<string, XBRLFact>;
    dei?: Record<string, XBRLFact>;
  };
}

export interface XBRLFact {
  label: string;
  description: string;
  units: Record<string, XBRLDataPoint[]>;
}

export interface XBRLDataPoint {
  start?: string;
  end: string;
  val: number;
  accn: string;
  fy: number;
  fp: string;
  form: string;
  filed: string;
}

export interface FinancialMetric {
  concept: string;
  label: string;
  periods: { year: number; quarter?: string; value: number; form: string }[];
}

export interface CompanyResearch {
  name: string;
  cik: string;
  ticker: string;
  financials: FinancialMetric[];
}

export interface AgentStep {
  id: string;
  label: string;
  detail?: string;
  status: "running" | "complete" | "error";
  timestamp: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Citation[];
  comparison?: ComparisonData;
  steps?: AgentStep[];
  logId?: string;
  feedback?: "up" | "down";
  timestamp: string;
}

export interface Citation {
  type: "xbrl" | "filing";
  label: string;
  url?: string;
}

export interface ComparisonData {
  companies: string[];
  metrics: {
    label: string;
    values: Record<string, number | string>;
  }[];
}
