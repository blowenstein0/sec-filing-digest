"use client";

import { useState, useEffect } from "react";

export function useSession() {
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setEmail(data?.email || null))
      .catch(() => setEmail(null))
      .finally(() => setLoading(false));
  }, []);

  return { email, loading };
}
