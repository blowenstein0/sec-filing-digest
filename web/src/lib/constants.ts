export const SESSION_COOKIE_NAME = "sec_session";
export const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || process.env.BASE_URL || "https://sec.zipperdatabrief.com";

export const FORM_TYPES = [
  { value: "8-K", label: "8-K", description: "Current reports — earnings, M&A, leadership changes" },
  { value: "10-K", label: "10-K", description: "Annual reports — full financial and operational overview" },
  { value: "10-Q", label: "10-Q", description: "Quarterly reports — financials and MD&A" },
  { value: "13F-HR", label: "13F", description: "Institutional holdings — what big funds are buying/selling" },
  { value: "SC 13D", label: "SC 13D", description: "Beneficial ownership — activist positions, >5% stakes" },
  { value: "SC 13G", label: "SC 13G", description: "Passive beneficial ownership — >5% stakes" },
  { value: "DEF 14A", label: "DEF 14A", description: "Proxy statements — exec comp, board composition" },
] as const;

export const TIER_LIMITS = {
  free: { companies: 3, cadences: ["weekly"] as const },
  pro: { companies: 25, cadences: ["daily", "weekly"] as const },
  enterprise: { companies: Infinity, cadences: ["daily", "weekly"] as const },
} as const;
