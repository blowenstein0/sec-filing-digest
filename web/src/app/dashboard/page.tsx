"use client";

import { useWatchlist } from "@/hooks/useWatchlist";
import AddCompanyForm from "@/components/dashboard/AddCompanyForm";
import WatchlistTable from "@/components/dashboard/WatchlistTable";
import PreferencesPanel from "@/components/dashboard/PreferencesPanel";

export default function DashboardPage() {
  const { watchlist, loading, error, add, remove } = useWatchlist();

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
      <p className="mt-1 text-gray-600">Manage your SEC filing watchlist and preferences.</p>

      {/* Preferences */}
      <section className="mt-8 bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Preferences</h2>
        <PreferencesPanel />
      </section>

      {/* Watchlist */}
      <section className="mt-6 bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Watchlist</h2>
        <AddCompanyForm onAdd={add} />

        <div className="mt-6">
          {loading ? (
            <div className="animate-pulse space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-gray-100 rounded" />
              ))}
            </div>
          ) : error ? (
            <p className="text-red-600 text-sm">{error}</p>
          ) : (
            <WatchlistTable watchlist={watchlist} onRemove={remove} />
          )}
        </div>
      </section>
    </div>
  );
}
