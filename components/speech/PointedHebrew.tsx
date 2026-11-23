"use client";

// Shows Hebrew with or without nikud, following the shared preference, but
// only while `active` (the transliteration view) is on.

import type { ReactNode } from "react";
import { usePointedHebrew } from "@/lib/speech/useNikud";

export default function PointedHebrew({
  text,
  transliteration,
  active,
  children,
}: {
  text: string;
  transliteration?: string;
  active: boolean;
  children: (shown: string, loading: boolean) => ReactNode;
}) {
  const pointed = usePointedHebrew(text, transliteration, active);
  return <>{children(pointed.text, pointed.loading)}</>;
}
