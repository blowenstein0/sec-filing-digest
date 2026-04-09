"use client";

import { useState, useEffect } from "react";
import ChatPanel from "@/components/research/ChatPanel";
import { Info } from "lucide-react";

interface CoverageData {
  ticker: string;
  name: string;
  metrics: string[];
  updatedAt: string;
}

export default function ResearchPage() {
  const [coverage, setCoverage] = useState<CoverageData[]>([]);
  const [showDetails, setShowDetails] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/research/coverage")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.tickers) setCoverage(data.tickers);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  return (
    <>
      {loaded && (
        <div className="bg-blue-50 border-b border-blue-100 px-4 sm:px-6 lg:px-8 py-2">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-start gap-2 text-xs text-blue-800">
              <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <div>
                {coverage.length > 0 ? (
                  <>
                    <p>
                      <span className="font-medium">Verified financials available for:</span>{" "}
                      {coverage.map((c) => c.ticker).join(", ")}.
                      Other tickers use live EDGAR data.
                      <button
                        onClick={() => setShowDetails(!showDetails)}
                        className="ml-1 text-blue-600 hover:text-blue-800 underline"
                      >
                        {showDetails ? "Hide" : "Show metrics"}
                      </button>
                    </p>
                    {showDetails && (
                      <div className="mt-2 space-y-1.5">
                        {coverage.map((c) => (
                          <div key={c.ticker}>
                            <span className="font-semibold">{c.ticker}</span>{" "}
                            <span className="text-blue-600">({c.name})</span>
                            <span className="text-blue-500"> — {c.metrics.join(", ")}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <p>
                    All data sourced from SEC EDGAR filings. Financial analysis powered by Claude.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      <ChatPanel />
    </>
  );
}
