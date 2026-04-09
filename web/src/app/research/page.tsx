"use client";

import { useState, useEffect } from "react";
import ChatPanel from "@/components/research/ChatPanel";
import { Info, Lock } from "lucide-react";

const RESEARCH_COOKIE = "research_access";

interface CoverageData {
  ticker: string;
  name: string;
  metrics: string[];
  updatedAt: string;
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name: string, value: string, days: number) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
}

export default function ResearchPage() {
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [coverage, setCoverage] = useState<CoverageData[]>([]);
  const [showDetails, setShowDetails] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Check if already authenticated via cookie
    if (getCookie(RESEARCH_COOKIE)) {
      setAuthed(true);
    }
  }, []);

  useEffect(() => {
    if (!authed) return;
    fetch("/api/research/coverage")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.tickers) setCoverage(data.tickers);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [authed]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === "cheeky") {
      setCookie(RESEARCH_COOKIE, password, 30);
      setAuthed(true);
      setError(false);
    } else {
      setError(true);
    }
  };

  if (!authed) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)]">
        <div className="w-full max-w-sm px-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-8 text-center">
            <Lock className="w-8 h-8 text-gray-400 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Research Access</h2>
            <p className="text-sm text-gray-500 mb-6">Enter the password to continue.</p>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(false); }}
                placeholder="Password"
                autoFocus
                className={`w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-1 ${
                  error
                    ? "border-red-300 focus:border-red-400 focus:ring-red-400"
                    : "border-gray-300 focus:border-blue-400 focus:ring-blue-400"
                }`}
              />
              {error && <p className="text-xs text-red-500">Wrong password.</p>}
              <button
                type="submit"
                className="w-full py-2.5 bg-blue-900 text-white rounded-xl text-sm font-medium hover:bg-blue-800 transition-colors"
              >
                Enter
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

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
