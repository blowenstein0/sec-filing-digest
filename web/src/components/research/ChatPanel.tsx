"use client";

import { useState, useRef, useEffect } from "react";
import { useResearch } from "@/hooks/useResearch";
import MessageBubble from "./MessageBubble";
import SuggestedQueries from "./SuggestedQueries";
import { Send, Loader2, RotateCcw, Check, AlertCircle } from "lucide-react";

export default function ChatPanel() {
  const { messages, loading, error, activeSteps, sendQuery, sendFeedback, clearMessages } =
    useResearch();
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, activeSteps]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || loading) return;
    setInput("");
    sendQuery(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleSuggestion = (query: string) => {
    sendQuery(query);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.length === 0 && !loading ? (
            <div className="pt-12">
              <SuggestedQueries onSelect={handleSuggestion} />
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} onFeedback={sendFeedback} />
              ))}

              {/* Agent progress steps */}
              {loading && activeSteps.length > 0 && (
                <div className="flex justify-start">
                  <div className="bg-white border border-gray-200 px-4 py-3 rounded-2xl rounded-bl-md min-w-[240px]">
                    <div className="space-y-1.5">
                      {activeSteps.map((step) => (
                        <div
                          key={step.id}
                          className="flex items-center gap-2 text-sm"
                        >
                          {step.status === "running" && (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500 flex-shrink-0" />
                          )}
                          {step.status === "complete" && (
                            <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                          )}
                          {step.status === "error" && (
                            <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                          )}
                          <span
                            className={
                              step.status === "running"
                                ? "text-gray-700"
                                : step.status === "error"
                                  ? "text-red-500"
                                  : "text-gray-400"
                            }
                          >
                            {step.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Fallback loading if no steps yet */}
              {loading && activeSteps.length === 0 && (
                <div className="flex justify-start">
                  <div className="bg-white border border-gray-200 px-4 py-3 rounded-2xl rounded-bl-md">
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Starting research...
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="flex justify-start">
                  <div className="bg-red-50 border border-red-200 px-4 py-3 rounded-2xl rounded-bl-md max-w-[80%]">
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                </div>
              )}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-gray-200 bg-white px-4 sm:px-6 lg:px-8 py-3">
        <div className="max-w-3xl mx-auto">
          <form onSubmit={handleSubmit} className="flex items-end gap-2">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={"Ask about a company, e.g. \"What are AAPL's risk factors?\""}
                rows={1}
                className="w-full resize-none rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                style={{ minHeight: "42px", maxHeight: "120px" }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = "auto";
                  target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
                }}
              />
            </div>

            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="flex-shrink-0 p-2.5 bg-blue-900 text-white rounded-xl hover:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>

            {messages.length > 0 && (
              <button
                type="button"
                onClick={clearMessages}
                className="flex-shrink-0 p-2.5 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition-colors"
                title="New conversation"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
          </form>

          <p className="text-xs text-gray-400 mt-1.5 text-center">
            All data sourced from SEC EDGAR. AI analysis may contain errors — verify before acting.
          </p>
        </div>
      </div>
    </div>
  );
}
