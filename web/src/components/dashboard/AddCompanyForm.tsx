"use client";

import { useState } from "react";
import { FORM_TYPES } from "@/lib/constants";

interface Props {
  onAdd: (entry: { cik: string; ticker?: string; company_name: string; form_types: string[] }) => Promise<void>;
}

export default function AddCompanyForm({ onAdd }: Props) {
  const [ticker, setTicker] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Look up CIK from ticker via our API
      const lookupRes = await fetch(`/api/watchlist/lookup?ticker=${encodeURIComponent(ticker.toUpperCase())}`);
      if (!lookupRes.ok) {
        const data = await lookupRes.json();
        throw new Error(data.error || "Company not found");
      }
      const { cik, company_name } = await lookupRes.json();

      await onAdd({
        cik,
        ticker: ticker.toUpperCase(),
        company_name,
        form_types: FORM_TYPES.map(f => f.value),
      });

      setTicker("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add company");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 items-end">
      <div className="flex-1">
        <label htmlFor="ticker" className="block text-sm font-medium text-gray-700 mb-1">
          Add company by ticker
        </label>
        <input
          id="ticker"
          type="text"
          required
          value={ticker}
          onChange={(e) => setTicker(e.target.value)}
          placeholder="AAPL, MSFT, TSLA..."
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-transparent uppercase"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="px-4 py-2 bg-blue-900 text-white rounded-md font-medium hover:bg-blue-800 transition-colors disabled:opacity-50 whitespace-nowrap"
      >
        {loading ? "Adding..." : "+ Add"}
      </button>
      {error && <p className="text-sm text-red-600 ml-2 self-center">{error}</p>}
    </form>
  );
}
