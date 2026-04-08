"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function UnsubscribePage() {
  return (
    <Suspense fallback={<div className="max-w-md mx-auto px-4 py-16 text-center"><p className="text-gray-400">Loading...</p></div>}>
      <UnsubscribeContent />
    </Suspense>
  );
}

function UnsubscribeContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  const handleUnsubscribe = async () => {
    if (!token) return;
    setStatus("loading");

    try {
      const res = await fetch("/api/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      if (!res.ok) throw new Error();
      setStatus("done");
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-gray-900">Unsubscribe</h1>

      {!token ? (
        <p className="mt-4 text-gray-600">Invalid unsubscribe link.</p>
      ) : status === "done" ? (
        <p className="mt-4 text-gray-600">
          You&apos;ve been unsubscribed. You won&apos;t receive any more SEC filing digests.
        </p>
      ) : status === "error" ? (
        <p className="mt-4 text-red-600">Something went wrong. Please try again.</p>
      ) : (
        <>
          <p className="mt-4 text-gray-600">
            Click below to stop receiving SEC filing digest emails.
          </p>
          <button
            onClick={handleUnsubscribe}
            disabled={status === "loading"}
            className="mt-6 px-6 py-2.5 bg-red-600 text-white rounded-md font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {status === "loading" ? "Processing..." : "Unsubscribe"}
          </button>
        </>
      )}
    </div>
  );
}
