"use client";

import { useState, useEffect } from "react";
import ChatPanel from "@/components/research/ChatPanel";
import { Info, Shield } from "lucide-react";

interface CoverageData {
  ticker: string;
  name: string;
  metrics: string[];
  updatedAt: string;
}

export default function ResearchPage() {
  const [coverage, setCoverage] = useState<CoverageData[]>([]);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    fetch("/api/research/coverage")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.tickers) setCoverage(data.tickers);
      })
      .catch(() => {});
  }, []);

  return (
    <>
      <div className="bg-gray-900 border-b border-gray-800 px-4 sm:px-6 lg:px-8 py-2">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-2 text-xs text-gray-300">
            <Shield className="w-3.5 h-3.5 flex-shrink-0 text-amber-400" />
            <p>
              <span className="font-medium text-white">Precision mode.</span>{" "}
              Responses are intentionally slower. We use Sonnet for data gathering
              and Opus for final analysis to maximize accuracy on financial data.
            </p>
          </div>
        </div>
      </div>
      {coverage.length > 0 && (
        <div className="bg-blue-50 border-b border-blue-100 px-4 sm:px-6 lg:px-8 py-2">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-start gap-2 text-xs text-blue-800">
              <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <div>
                <p>
                  <span className="font-medium">Pre-cached financials:</span>{" "}
                  {coverage.map((c) => c.ticker).join(", ")}.
                  Other tickers fall back to live EDGAR data (slower, less accurate).
                  <button
                    onClick={() => setShowDetails(!showDetails)}
                    className="ml-1 text-blue-600 hover:text-blue-800 underline"
                  >
                    {showDetails ? "Hide details" : "Details"}
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
              </div>
            </div>
          </div>
        </div>
      )}
      <ChatPanel />
    </>
  );
}
