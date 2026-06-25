"use client";

import { useEffect } from "react";
import { useNavigate, createPageUrl } from "@/lib/router-compat";

// Source parity: src/pages/Flashcards.jsx simply redirects to the Backpack page.
// The Backpack lives at /library in this migration, so we redirect there.
export default function Flashcards() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(createPageUrl("Backpack"), { replace: true });
  }, []);
  return null;
}
