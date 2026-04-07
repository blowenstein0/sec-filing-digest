"use client";

import { useState, useEffect, useCallback } from "react";
import type { WatchlistEntry } from "@/types";

export function useWatchlist() {
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/watchlist");
      if (!res.ok) throw new Error("Failed to load watchlist");
      const data = await res.json();
      setWatchlist(data.watchlist);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load watchlist");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const add = async (entry: { cik: string; ticker?: string; company_name: string; form_types?: string[]; keywords?: string[] }) => {
    const res = await fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Failed to add company");
    }
    await refresh();
  };

  const remove = async (cik: string) => {
    await fetch("/api/watchlist", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cik }),
    });
    await refresh();
  };

  const update = async (cik: string, form_types: string[], keywords: string[]) => {
    await fetch("/api/watchlist", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cik, form_types, keywords }),
    });
    await refresh();
  };

  return { watchlist, loading, error, add, remove, update, refresh };
}
