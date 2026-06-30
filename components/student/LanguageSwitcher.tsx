"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/AuthContext";
import { base44 as base44Client } from "@/api/base44Client";
import { toast } from "sonner";
import { LEARNING_LANGUAGES, getLanguage } from "@/lib/learningLanguages";

// base44Client is a JS shim whose entities are built dynamically, so TS can't
// see keys like `UserProfile`. Cast to any for ergonomic access.
const base44: any = base44Client;

// In-app language switcher for the student portal. Lives in the sidebar so it is
// reachable from every screen (incl. /learn). Changing it updates
// userProfile.language and invalidates the shared ['userProfile'] cache, so the
// whole app re-filters its content to the new language.
export default function LanguageSwitcher() {
  const { user } = useAuth();
  const email = user?.email;
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Same queryKey/queryFn the pages use → shares cache, no extra round-trips.
  const { data: userProfile } = useQuery({
    queryKey: ["userProfile", email],
    queryFn: async () => {
      const profiles = await base44.entities.UserProfile.filter({ created_by: email });
      return profiles[0] || null;
    },
    enabled: !!email,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  const currentId = userProfile?.language || "hebrew";
  const current = getLanguage(currentId);

  const changeLang = useMutation({
    mutationFn: async (language: string) => {
      const profiles = await base44.entities.UserProfile.filter({ created_by: email });
      if (profiles[0]) {
        return base44.entities.UserProfile.update(profiles[0].id, { language });
      }
      // No profile yet (shouldn't happen post-onboarding) — create a minimal one.
      return base44.entities.UserProfile.create({ language, current_day: 1 });
    },
    onSuccess: (_data, language) => {
      // Refresh every screen that filters by language.
      queryClient.invalidateQueries({ queryKey: ["userProfile"] });
      const lang = getLanguage(language);
      toast.success(`Language switched to ${lang?.name || language}`);
      setOpen(false);
    },
    onError: (e: any) => {
      toast.error(`Couldn't switch language: ${e?.message || "unknown error"}`);
    },
  });

  // Close the menu on outside click.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!email) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-400 transition hover:bg-white/5 hover:text-slate-100"
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Change learning language"
      >
        <span className="text-base">{current?.emoji || "🌐"}</span>
        <span className="flex-1 text-left">{current?.name || "Language"}</span>
        <svg
          className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute bottom-full left-0 right-0 mb-1 overflow-hidden rounded-lg border border-slate-700 bg-slate-800 py-1 shadow-xl"
        >
          {LEARNING_LANGUAGES.map((lang) => {
            const selected = lang.id === currentId;
            const disabled = !lang.active;
            return (
              <button
                key={lang.id}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={disabled || changeLang.isPending}
                onClick={() => {
                  if (disabled || selected) return;
                  changeLang.mutate(lang.id);
                }}
                className={`flex w-full items-center gap-3 px-3 py-2 text-sm transition ${
                  selected
                    ? "bg-teal-500/10 text-teal-400"
                    : disabled
                    ? "cursor-not-allowed text-slate-600"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span className="text-base">{lang.emoji}</span>
                <span className="flex-1 text-left">{lang.name}</span>
                {selected && <span className="text-teal-400">✓</span>}
                {disabled && (
                  <span className="text-[10px] uppercase tracking-wide text-slate-600">
                    Soon
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
