"use client";

import { useState, useCallback } from "react";
import type { ChatMessage, ComparisonData, Citation } from "@/types";

// Detect comparison queries: "compare X vs Y", "X versus Y", multiple tickers
function isComparisonQuery(query: string): string[] | null {
  const q = query.toLowerCase();

  // "compare AAPL vs MSFT" or "AAPL versus MSFT"
  if (q.includes("compare") || q.includes(" vs ") || q.includes("versus")) {
    const tickers = query.match(/\b[A-Z]{2,5}\b/g);
    if (tickers && tickers.length >= 2) {
      // Filter out common English words
      const skip = new Set(["THE", "AND", "FOR", "ARE", "BUT", "NOT", "YOU", "ALL", "CAN", "HER", "WAS", "ONE", "OUR", "OUT", "SEC", "CEO", "CFO", "IPO"]);
      const filtered = tickers.filter((t) => !skip.has(t));
      if (filtered.length >= 2) return [...new Set(filtered)];
    }
  }

  return null;
}

let nextId = 1;

export function useResearch() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendQuery = useCallback(async (query: string) => {
    setError(null);

    const userMessage: ChatMessage = {
      id: `msg-${nextId++}`,
      role: "user",
      content: query,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    try {
      const comparisonTickers = isComparisonQuery(query);

      let response: Response;
      if (comparisonTickers) {
        response = await fetch("/api/research/compare", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tickers: comparisonTickers, query }),
        });
      } else {
        response = await fetch("/api/research/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query }),
        });
      }

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Something went wrong.");
        setLoading(false);
        return;
      }

      const assistantMessage: ChatMessage = {
        id: `msg-${nextId++}`,
        role: "assistant",
        content: data.answer,
        sources: data.sources as Citation[] | undefined,
        comparison: data.comparison as ComparisonData | undefined,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch {
      setError("Failed to connect. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return { messages, loading, error, sendQuery, clearMessages };
}
