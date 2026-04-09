"use client";

import { useState, useCallback, useRef } from "react";
import type { ChatMessage, AgentStep, ComparisonData, Citation } from "@/types";

let nextId = 1;

export function useResearch() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSteps, setActiveSteps] = useState<AgentStep[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const sendQuery = useCallback(async (query: string) => {
    setError(null);
    setActiveSteps([]);

    const userMessage: ChatMessage = {
      id: `msg-${nextId++}`,
      role: "user",
      content: query,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    // Both query and compare now go to the same endpoint
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // Build conversation history for context (just role + content, no metadata)
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

      if (!response.ok) {
        const data = await response.json();
        setError(data.error || "Something went wrong.");
        setLoading(false);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        setError("No response stream.");
        setLoading(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6);
          if (!jsonStr) continue;

          try {
            const event = JSON.parse(jsonStr);

            if (event.type === "progress") {
              setActiveSteps((prev) => {
                // Update existing step or add new one
                const existing = prev.find(
                  (s) => s.label === event.step && s.status === "running"
                );
                if (existing) {
                  return prev.map((s) =>
                    s === existing
                      ? { ...s, status: event.status, detail: event.detail }
                      : s
                  );
                }
                return [
                  // Mark previous running steps as complete
                  ...prev.map((s) =>
                    s.status === "running" ? { ...s, status: "complete" as const } : s
                  ),
                  {
                    id: `step-${nextId++}`,
                    label: event.step,
                    status: event.status || "running",
                    detail: event.detail,
                    timestamp: new Date().toISOString(),
                  },
                ];
              });
            }

            if (event.type === "answer") {
              const assistantMessage: ChatMessage = {
                id: `msg-${nextId++}`,
                role: "assistant",
                content: event.content,
                sources: event.sources as Citation[] | undefined,
                comparison: event.comparison as ComparisonData | undefined,
                steps: event.steps as AgentStep[] | undefined,
                logId: event.logId as string | undefined,
                timestamp: new Date().toISOString(),
              };
              setMessages((prev) => [...prev, assistantMessage]);
              setActiveSteps([]);
            }

            if (event.type === "error") {
              setError(event.message || "Research failed.");
              setActiveSteps([]);
            }
          } catch {
            // Skip malformed events
          }
        }
      }
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

    // Find the logId for this message
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
    setActiveSteps([]);
  }, []);

  return { messages, loading, error, activeSteps, sendQuery, sendFeedback, clearMessages };
}
