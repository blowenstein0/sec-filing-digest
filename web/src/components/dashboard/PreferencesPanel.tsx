"use client";

import { useState, useEffect } from "react";

export default function PreferencesPanel() {
  const [cadence, setCadence] = useState("daily");
  const [tier, setTier] = useState("free");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/preferences")
      .then((res) => res.json())
      .then((data) => {
        setCadence(data.cadence || "daily");
        setTier(data.tier || "free");
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    await fetch("/api/preferences", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cadence }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  if (loading) {
    return <div className="animate-pulse h-20 bg-gray-100 rounded-lg" />;
  }

  return (
    <div className="flex items-center gap-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Digest frequency
        </label>
        <div className="flex gap-2">
          {["daily", "weekly"].map((c) => (
            <button
              key={c}
              onClick={() => setCadence(c)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                cadence === c
                  ? "bg-blue-900 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {c.charAt(0).toUpperCase() + c.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="text-sm text-gray-500">
        Tier: <span className="font-medium text-gray-700 capitalize">{tier}</span>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="px-4 py-1.5 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
      >
        {saving ? "Saving..." : saved ? "Saved" : "Save"}
      </button>
    </div>
  );
}
