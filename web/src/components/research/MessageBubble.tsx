"use client";

import { useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import type { ChatMessage, Citation } from "@/types";
import ComparisonTable from "./ComparisonTable";
import { ExternalLink, ChevronDown, ChevronRight, Check, AlertCircle, ThumbsUp, ThumbsDown } from "lucide-react";

export default function MessageBubble({
  message,
  onFeedback,
}: {
  message: ChatMessage;
  onFeedback?: (messageId: string, feedback: "up" | "down") => void;
}) {
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
        {/* Answer with markdown + inline citations */}
        <div className="text-gray-800 prose prose-sm prose-gray max-w-none prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-headings:text-gray-900 prose-headings:mt-3 prose-headings:mb-1.5 prose-strong:text-gray-900 prose-a:text-blue-600">
          <MarkdownWithCitations content={message.content} sources={message.sources || []} />
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
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-gray-50 text-gray-600 rounded-md hover:bg-gray-100 hover:text-blue-900 transition-colors no-underline"
                >
                  <span className="font-mono text-blue-600 font-semibold mr-0.5">
                    [{i + 1}]
                  </span>
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

        {/* Thumbs up/down feedback */}
        {message.logId && onFeedback && (
          <div className="mt-2 pt-2 border-t border-gray-100 flex items-center gap-1">
            <button
              onClick={() => onFeedback(message.id, "up")}
              className={`p-1 rounded transition-colors ${
                message.feedback === "up"
                  ? "text-green-600 bg-green-50"
                  : "text-gray-300 hover:text-green-600 hover:bg-green-50"
              }`}
              title="Good answer"
            >
              <ThumbsUp className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onFeedback(message.id, "down")}
              className={`p-1 rounded transition-colors ${
                message.feedback === "down"
                  ? "text-red-600 bg-red-50"
                  : "text-gray-300 hover:text-red-600 hover:bg-red-50"
              }`}
              title="Bad answer"
            >
              <ThumbsDown className="w-3.5 h-3.5" />
            </button>
            {message.feedback && (
              <span className="text-xs text-gray-400 ml-1">
                {message.feedback === "up" ? "Thanks!" : "Noted — we'll improve"}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Renders markdown with citation [1] [2] replaced by clickable pills
function MarkdownWithCitations({ content, sources }: { content: string; sources: Citation[] }) {
  // Replace [N] citations with placeholder tokens that survive markdown parsing
  const CITE_TOKEN = "%%CITE_";
  const processed = content.replace(/\[(\d+)\]/g, `${CITE_TOKEN}$1%%`);

  return (
    <ReactMarkdown
      components={{
        // Override text rendering to inject citation links
        p: ({ children }) => <p>{injectCitations(children, sources)}</p>,
        li: ({ children }) => <li>{injectCitations(children, sources)}</li>,
        td: ({ children }) => <td>{injectCitations(children, sources)}</td>,
      }}
    >
      {processed}
    </ReactMarkdown>
  );
}

function injectCitations(children: ReactNode, sources: Citation[]): ReactNode {
  if (!children) return children;

  const CITE_TOKEN = "%%CITE_";

  // Process each child
  if (Array.isArray(children)) {
    return children.map((child, i) => {
      if (typeof child === "string") {
        return renderCitationsInText(child, sources, i);
      }
      return child;
    });
  }

  if (typeof children === "string") {
    return renderCitationsInText(children, sources, 0);
  }

  return children;
}

function renderCitationsInText(text: string, sources: Citation[], keyPrefix: number): ReactNode {
  const parts = text.split(/(%%CITE_\d+%%)/g);
  if (parts.length === 1) return text;

  return parts.map((part, i) => {
    const match = part.match(/^%%CITE_(\d+)%%$/);
    if (match) {
      const num = Number(match[1]);
      const source = sources[num - 1];
      if (!source) {
        return <span key={`${keyPrefix}-${i}`} className="text-gray-400 text-xs">[{num}]</span>;
      }
      return (
        <a
          key={`${keyPrefix}-${i}`}
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          title={source.label}
          className="inline-flex items-center justify-center text-[10px] font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded px-1 py-0 mx-0.5 align-super cursor-pointer transition-colors no-underline leading-tight"
        >
          {num}
        </a>
      );
    }
    return <span key={`${keyPrefix}-${i}`}>{part}</span>;
  });
}
