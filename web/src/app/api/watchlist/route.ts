import { getAuthenticatedEmail } from "@/lib/auth";
import { getUser, getWatchlist, addToWatchlist, removeFromWatchlist, updateWatchlistEntry } from "@/lib/dynamodb";
import { TIER_LIMITS, FORM_TYPES } from "@/lib/constants";
import type { WatchlistEntry } from "@/types";

export async function GET() {
  const email = await getAuthenticatedEmail();
  if (!email) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const watchlist = await getWatchlist(email);
  return Response.json({ watchlist });
}

export async function POST(request: Request) {
  const email = await getAuthenticatedEmail();
  if (!email) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { cik, ticker, company_name, form_types, keywords } = await request.json();

  if (!cik || !company_name) {
    return Response.json({ error: "CIK and company name required" }, { status: 400 });
  }

  // Check tier limits
  const user = await getUser(email);
  const tier = user?.tier || "free";
  const limit = TIER_LIMITS[tier].companies;
  const current = await getWatchlist(email);
  if (current.length >= limit) {
    return Response.json(
      { error: `${tier} tier limited to ${limit} companies. Upgrade for more.` },
      { status: 403 }
    );
  }

  const validFormTypes: string[] = FORM_TYPES.map(f => f.value);
  const filteredFormTypes = (form_types || []).filter((f: string) => validFormTypes.includes(f));

  const entry: WatchlistEntry = {
    email,
    cik: String(cik),
    ticker: ticker || undefined,
    company_name,
    form_types: filteredFormTypes.length > 0 ? filteredFormTypes : validFormTypes,
    keywords: keywords || [],
    addedAt: new Date().toISOString(),
  };

  await addToWatchlist(entry);
  return Response.json({ ok: true, entry });
}

export async function PUT(request: Request) {
  const email = await getAuthenticatedEmail();
  if (!email) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { cik, form_types, keywords } = await request.json();
  if (!cik) {
    return Response.json({ error: "CIK required" }, { status: 400 });
  }

  await updateWatchlistEntry(email, String(cik), form_types || [], keywords || []);
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const email = await getAuthenticatedEmail();
  if (!email) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { cik } = await request.json();
  if (!cik) {
    return Response.json({ error: "CIK required" }, { status: 400 });
  }

  await removeFromWatchlist(email, String(cik));
  return Response.json({ ok: true });
}
