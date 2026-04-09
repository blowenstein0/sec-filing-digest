"use client";

const SUGGESTIONS = [
  { label: "Risk factors", query: "What are AAPL's main risk factors?" },
  { label: "Revenue trends", query: "Show me MSFT revenue and net income trends" },
  { label: "Competitive analysis", query: "Compare AAPL vs MSFT vs GOOGL on revenue, margins, and R&D" },
  { label: "Balance sheet", query: "What does NVDA's balance sheet look like? Debt, cash, and equity" },
  { label: "Business overview", query: "What does TSLA do? Give me a business overview" },
  { label: "Head-to-head", query: "Compare AMD vs NVDA on revenue growth and profitability" },
];

export default function SuggestedQueries({
  onSelect,
}: {
  onSelect: (query: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl font-semibold text-gray-900">
          Company Research
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Ask questions about any public company. All data comes from SEC EDGAR filings.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-2xl mx-auto">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.query}
            onClick={() => onSelect(s.query)}
            className="text-left px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm hover:border-blue-300 hover:bg-blue-50/50 transition-colors group"
          >
            <span className="text-gray-400 text-xs font-medium group-hover:text-blue-600 transition-colors">
              {s.label}
            </span>
            <p className="text-gray-700 mt-0.5">{s.query}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
