"use client";

import type { WatchlistEntry } from "@/types";

interface Props {
  watchlist: WatchlistEntry[];
  onRemove: (cik: string) => Promise<void>;
}

export default function WatchlistTable({ watchlist, onRemove }: Props) {
  if (watchlist.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-lg">No companies on your watchlist yet.</p>
        <p className="mt-1 text-sm">Add a ticker above to start monitoring SEC filings.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left py-3 px-3 font-semibold text-gray-700">Company</th>
            <th className="text-left py-3 px-3 font-semibold text-gray-700">Ticker</th>
            <th className="text-left py-3 px-3 font-semibold text-gray-700">CIK</th>
            <th className="text-left py-3 px-3 font-semibold text-gray-700">Form Types</th>
            <th className="text-left py-3 px-3 font-semibold text-gray-700">Keywords</th>
            <th className="py-3 px-3"></th>
          </tr>
        </thead>
        <tbody>
          {watchlist.map((entry) => (
            <tr key={entry.cik} className="border-b border-gray-100 hover:bg-gray-50">
              <td className="py-3 px-3 font-medium text-gray-900">{entry.company_name}</td>
              <td className="py-3 px-3 font-mono text-blue-900">{entry.ticker || "—"}</td>
              <td className="py-3 px-3 text-gray-500 font-mono text-xs">{entry.cik}</td>
              <td className="py-3 px-3">
                <div className="flex flex-wrap gap-1">
                  {(entry.form_types || []).map((ft) => (
                    <span key={ft} className="inline-block px-1.5 py-0.5 bg-blue-50 text-blue-800 text-xs rounded font-mono">
                      {ft}
                    </span>
                  ))}
                </div>
              </td>
              <td className="py-3 px-3 text-gray-500 text-xs">
                {(entry.keywords || []).length > 0 ? entry.keywords.join(", ") : "—"}
              </td>
              <td className="py-3 px-3 text-right">
                <button
                  onClick={() => onRemove(entry.cik)}
                  className="text-red-500 hover:text-red-700 text-xs font-medium"
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
