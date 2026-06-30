"use client";

import { useParams } from "next/navigation";
import { useState, useEffect } from "react";

export interface School {
  id: string;
  slug: string;
  name: string;
  tagline?: string;
  industry?: string;
  currency: "USD" | "ILS";
  accent_color: string;
  logo_url?: string;
  plan: string;
  role?: "owner" | "admin" | "coach" | "student";
}

export function useSchool(): { school: School | null; loading: boolean } {
  const params = useParams<{ companyId: string }>();
  const slug = params.companyId;
  const [school, setSchool] = useState<School | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/school/${slug}`)
      .then((r) => r.json())
      .then((data) => setSchool(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [slug]);

  return { school, loading };
}
