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
