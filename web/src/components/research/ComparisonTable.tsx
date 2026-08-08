"use client";

import type { ComparisonData } from "@/types";
import { formatNumber } from "@/lib/edgar";

function formatValue(value: number | string, label: string): string {
  if (typeof value === "string") return value;
  return formatNumber(value, label);
}

export default function ComparisonTable({
  data,
}: {
  data: ComparisonData;
}) {
  if (!data.metrics.length) return null;

  return (
    <div className="overflow-x-auto mt-3 mb-2">
      <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
        <thead>
          <tr className="bg-gray-50">
            <th className="text-left px-3 py-2 font-medium text-gray-600 border-b border-gray-200">
              Metric
            </th>
            {data.companies.map((ticker) => (
              <th
                key={ticker}
                className="text-right px-3 py-2 font-medium text-gray-600 border-b border-gray-200"
              >
                {ticker}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.metrics.map((row) => {
            // Find the max numeric value for highlighting
            const numericValues = data.companies
              .map((t) => row.values[t])
              .filter((v): v is number => typeof v === "number");
            const maxVal =
              numericValues.length > 0 ? Math.max(...numericValues) : null;

            return (
              <tr key={row.label} className="border-b border-gray-100 last:border-0">
                <td className="px-3 py-2 text-gray-700 font-medium">
                  {row.label}
                </td>
                {data.companies.map((ticker) => {
                  const val = row.values[ticker];
                  const isMax =
                    typeof val === "number" && val === maxVal && numericValues.length > 1;
                  return (
                    <td
                      key={ticker}
                      className={`px-3 py-2 text-right tabular-nums ${
                        isMax ? "text-blue-900 font-semibold" : "text-gray-700"
                      }`}
                    >
                      {formatValue(val, row.label)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
