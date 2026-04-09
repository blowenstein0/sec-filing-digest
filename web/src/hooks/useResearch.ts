"use client";

import { useState, useCallback, useRef } from "react";
import type { ChatMessage, AgentStep, ComparisonData, Citation } from "@/types";

let nextId = 1;

export function useResearch() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

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

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const history = messagesRef.current.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const response = await fetch("/api/research/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, history }),
        signal: controller.signal,
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Something went wrong.");
        return;
      }

      const assistantMessage: ChatMessage = {
        id: `msg-${nextId++}`,
        role: "assistant",
        content: data.answer,
        sources: data.sources as Citation[] | undefined,
        comparison: data.comparison as ComparisonData | undefined,
        steps: data.steps as AgentStep[] | undefined,
        logId: data.logId as string | undefined,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // User cancelled
      } else {
        setError("Failed to connect. Please try again.");
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, []);

  const sendFeedback = useCallback(async (messageId: string, feedback: "up" | "down") => {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, feedback } : m))
    );

    const msg = messagesRef.current.find((m) => m.id === messageId);
    if (!msg?.logId) return;

    await fetch("/api/research/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logId: msg.logId, feedback }),
    });
  }, []);

  const clearMessages = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    setMessages([]);
    setError(null);
  }, []);

  return { messages, loading, error, sendQuery, sendFeedback, clearMessages };
}
