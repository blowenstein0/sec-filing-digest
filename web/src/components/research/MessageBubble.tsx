"use client";

import { useState } from "react";
import type { ChatMessage } from "@/types";
import ComparisonTable from "./ComparisonTable";
import { ExternalLink, ChevronDown, ChevronRight, Check, AlertCircle } from "lucide-react";

export default function MessageBubble({ message }: { message: ChatMessage }) {
  const [showSteps, setShowSteps] = useState(false);

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="bg-blue-900 text-white px-4 py-2.5 rounded-2xl rounded-br-md max-w-[80%] text-sm leading-relaxed">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="bg-white border border-gray-200 px-4 py-3 rounded-2xl rounded-bl-md max-w-[90%] text-sm leading-relaxed">
        {/* Answer text */}
        <div className="text-gray-800 whitespace-pre-wrap">
          {formatAnswer(message.content)}
        </div>

        {/* Comparison table */}
        {message.comparison && message.comparison.metrics.length > 0 && (
          <ComparisonTable data={message.comparison} />
        )}

        {/* Sources */}
        {message.sources && message.sources.length > 0 && (
          <div className="mt-3 pt-2 border-t border-gray-100">
            <p className="text-xs text-gray-400 mb-1.5">Sources</p>
            <div className="flex flex-wrap gap-1.5">
              {message.sources.map((source, i) => (
                <a
                  key={i}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-gray-50 text-gray-600 rounded-md hover:bg-gray-100 hover:text-blue-900 transition-colors"
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${source.type === "xbrl" ? "bg-green-400" : "bg-blue-400"}`}
                  />
                  {source.label}
                  <ExternalLink className="w-3 h-3" />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Research steps trace */}
        {message.steps && message.steps.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-100">
            <button
              onClick={() => setShowSteps(!showSteps)}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              {showSteps ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
              {message.steps.length} research steps
            </button>

            {showSteps && (
              <div className="mt-1.5 space-y-1">
                {message.steps.map((step) => (
                  <div
                    key={step.id}
                    className="flex items-center gap-1.5 text-xs text-gray-400"
                  >
                    {step.status === "complete" && (
                      <Check className="w-3 h-3 text-green-400 flex-shrink-0" />
                    )}
                    {step.status === "error" && (
                      <AlertCircle className="w-3 h-3 text-red-400 flex-shrink-0" />
                    )}
                    {step.status === "running" && (
                      <span className="w-3 h-3 flex-shrink-0" />
                    )}
                    {step.label}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function formatAnswer(text: string): string {
  return text.replace(/\*\*(.*?)\*\*/g, "$1");
}
