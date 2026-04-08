"use client";

import Link from "next/link";
import { useSession } from "@/hooks/useSession";

export default function Header() {
  const { email, loading } = useSession();

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg text-gray-900">
          <span className="text-blue-900">SEC Filing Digest</span>
        </Link>

        {!loading && (
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/blog" className="text-gray-600 hover:text-gray-900">
              Blog
            </Link>
            {email ? (
              <>
                <Link href="/dashboard" className="text-gray-600 hover:text-gray-900">
                  Dashboard
                </Link>
                <button
                  onClick={async () => {
                    await fetch("/api/auth/session", { method: "DELETE" });
                    window.location.href = "/";
                  }}
                  className="text-gray-500 hover:text-gray-700"
                >
                  Log out
                </button>
              </>
            ) : (
              <Link
                href="/signup"
                className="bg-blue-900 text-white px-4 py-1.5 rounded-md font-medium hover:bg-blue-800 transition-colors"
              >
                Get Started
              </Link>
            )}
          </nav>
        )}
      </div>
    </header>
  );
}
