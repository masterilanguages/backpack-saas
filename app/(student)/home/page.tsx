"use client";

// Duocards-style home screen: light app panel with a streak tip card, a
// mascot scene around a campfire daily-goal ring, To Learn / Practiced /
// Learned stats, a big START button and an expandable "My cards" list.
// Data comes from the same Word/UserProfile entities the Backpack uses.
// (The previous gamified dashboard lives in git history if it's ever needed.)

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { base44 as base44Client } from "@/api/base44Client";
const base44: any = base44Client;
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ChevronDown, Plus, BarChart3, Palette } from "lucide-react";

const DAILY_GOAL = 15;

const LANGUAGE_FLAGS: Record<string, string> = {
  hebrew: "🇮🇱",
  english: "🇬🇧",
  spanish: "🇪🇸",
  french: "🇫🇷",
  portuguese: "🇵🇹",
  italian: "🇮🇹",
};

export default function Home() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [cardsOpen, setCardsOpen] = useState(false);

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
    document.title = "Home - Lashon Languages";
  }, []);

  const { data: userProfile } = useQuery({
    queryKey: ["userProfile", currentUser?.email],
    queryFn: async () => {
      const profiles = await base44.entities.UserProfile.filter({ created_by: currentUser.email });
      return profiles[0] || null;
    },
    enabled: !!currentUser?.email,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const language = userProfile?.language || "hebrew";

  const { data: words = [] } = useQuery({
    queryKey: ["wordRatings", language, currentUser?.email],
    queryFn: () => base44.entities.Word.filter({ category: "wordbank", language, created_by: currentUser.email }),
    enabled: !!userProfile && !!currentUser?.email,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { toLearn, practiced, learned, practicedToday } = useMemo(() => {
    const today = new Date().toDateString();
    let toLearn = 0, practiced = 0, learned = 0, practicedToday = 0;
    for (const w of words as any[]) {
      const level = w.times_practiced || 0;
      if (level === 0) toLearn++;
      else if (level >= 5) learned++;
      else practiced++;
      if (level > 0 && w.updated_date && new Date(w.updated_date).toDateString() === today) {
        practicedToday++;
      }
    }
    return { toLearn, practiced, learned, practicedToday };
  }, [words]);

  const goalDone = Math.min(practicedToday, DAILY_GOAL);
  const ringRadius = 46;
  const ringCircumference = 2 * Math.PI * ringRadius;

  const startLearning = () => {
    // Same handoff the Backpack uses for its "All Words" flashcard run.
    if (typeof window !== "undefined") {
      sessionStorage.setItem("pendingFlashcardWords", JSON.stringify({ allWords: true }));
    }
    router.push("/library?flashcard=all");
  };

  const streak = userProfile?.daily_streak || 0;

  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* Light "app screen" panel — the rest of the portal stays dark. */}
      <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-[#eef4fb] shadow-2xl">

        {/* Top bar: palette · language · stats */}
        <div className="flex items-center justify-between border-b border-slate-200/70 bg-white/80 px-5 py-3">
          <Palette className="h-6 w-6 text-slate-300" />
          <Link
            href="/settings"
            className="flex items-center gap-2 text-xl font-semibold text-slate-800"
          >
            <span className="text-2xl">{LANGUAGE_FLAGS[language] || "🌍"}</span>
            <span className="capitalize">{language}</span>
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </Link>
          <Link href="/progress" aria-label="Progress">
            <BarChart3 className="h-6 w-6 text-slate-400 transition hover:text-slate-600" />
          </Link>
        </div>

        <div className="px-5 sm:px-8">
          {/* Streak flame + AI-assistant tip card */}
          <div className="relative mt-10">
            <div className="absolute -top-7 left-1/2 z-10 -translate-x-1/2">
              <div className="relative flex h-12 w-12 items-center justify-center">
                <span className="text-5xl leading-none drop-shadow">🔥</span>
                <span className="absolute top-4 text-sm font-bold text-white">{streak}</span>
              </div>
            </div>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => router.push("/practice")}
              className="relative cursor-pointer rounded-xl border border-slate-200 bg-white px-6 pb-5 pt-8 text-center shadow-sm transition hover:shadow-md"
            >
              <p className="text-lg font-semibold text-slate-800">Try our AI-assistant</p>
              <ol className="mt-2 space-y-1.5 text-slate-700">
                <li>1. Go to the Practice section 🗨️</li>
                <li>2. Tap &quot;Chat&quot; 💬</li>
                <li>3. Ask for something…</li>
              </ol>
              {/* Speech-bubble tail */}
              <div className="absolute -bottom-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 border-b border-r border-slate-200 bg-white" />
            </motion.div>
          </div>

          {/* Mascot scene: grass, cave, mammoth, campfire goal ring */}
          <div className="relative mx-auto mt-10 flex justify-center">
            <div className="relative h-56 w-full max-w-xl">
              {/* Grass ellipse */}
              <div className="absolute inset-x-0 top-10 mx-auto h-44 w-[92%] rounded-[50%] bg-[#eaf7d9]" />
              {/* Cave */}
              <span className="absolute left-[12%] top-6 text-5xl">🏜️</span>
              {/* Mammoth mascot */}
              <motion.span
                animate={{ scale: [0.98, 1.03, 0.98] }}
                transition={{ repeat: Infinity, duration: 3 }}
                className="absolute left-[30%] top-14 text-6xl"
              >
                🦣
              </motion.span>
              {/* Campfire with daily-goal ring */}
              <div className="absolute left-1/2 top-16 -translate-x-1/4">
                <div className="relative flex h-28 w-28 items-center justify-center">
                  <svg viewBox="0 0 104 104" className="absolute inset-0 h-full w-full -rotate-90">
                    <circle cx="52" cy="52" r={ringRadius} fill="none" stroke="#dce8f5" strokeWidth="4" />
                    <circle
                      cx="52" cy="52" r={ringRadius} fill="none"
                      stroke="#f97316" strokeWidth="4" strokeLinecap="round"
                      strokeDasharray={ringCircumference}
                      strokeDashoffset={ringCircumference * (1 - goalDone / DAILY_GOAL)}
                    />
                  </svg>
                  <div className="flex flex-col items-center">
                    <span className="text-4xl">🔥</span>
                    <span className="mt-0.5 text-sm font-semibold text-orange-600">
                      {goalDone} / {DAILY_GOAL}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div className="mt-8 grid grid-cols-3 divide-x divide-slate-200 rounded-2xl border border-slate-200 bg-white py-5 shadow-sm">
            {[
              { label: "TO LEARN", value: toLearn, color: "text-sky-500" },
              { label: "PRACTICED", value: practiced, color: "text-green-600" },
              { label: "LEARNED", value: learned, color: "text-amber-500" },
            ].map((s) => (
              <button
                key={s.label}
                onClick={() => router.push("/library")}
                className="flex flex-col items-center gap-1"
              >
                <span className={`text-sm font-semibold tracking-wide ${s.color}`}>{s.label}</span>
                <span className={`text-4xl font-bold ${s.color}`}>{s.value}</span>
              </button>
            ))}
          </div>

          {/* START */}
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={startLearning}
            className="mt-5 w-full rounded-full bg-gradient-to-b from-sky-400 to-sky-500 py-4 text-xl font-semibold tracking-wide text-white shadow-lg shadow-sky-500/30 transition hover:to-sky-600"
          >
            START
          </motion.button>

          {/* My cards */}
          <div className="mt-6 flex items-stretch overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <button
              onClick={() => setCardsOpen((o) => !o)}
              className="flex flex-1 items-center gap-3 px-5 py-4 text-left"
            >
              <ChevronDown className={`h-5 w-5 text-slate-400 transition-transform ${cardsOpen ? "" : "-rotate-90"}`} />
              <span className="text-lg font-medium text-slate-800">My cards</span>
              <span className="text-sm text-slate-400">{(words as any[]).length}</span>
            </button>
            <Link
              href="/library"
              aria-label="Add a card"
              className="flex items-center border-l border-slate-200 px-5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
            >
              <Plus className="h-5 w-5" />
            </Link>
          </div>
          {cardsOpen && (
            <div className="mt-2 max-h-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              {(words as any[]).length === 0 ? (
                <p className="px-5 py-6 text-center text-slate-400">
                  No cards yet — tap + to add your first word!
                </p>
              ) : (
                (words as any[])
                  .slice()
                  .sort((a, b) => (a.phonetic || a.word || "").localeCompare(b.phonetic || b.word || ""))
                  .map((w) => {
                    const level = w.times_practiced || 0;
                    const dot = level >= 5 ? "bg-amber-400" : level > 0 ? "bg-green-500" : "bg-sky-400";
                    return (
                      <Link
                        key={w.id}
                        href="/library"
                        className="flex items-center gap-3 border-b border-slate-100 px-5 py-3 last:border-b-0 hover:bg-slate-50"
                      >
                        <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${dot}`} />
                        <span className="min-w-0 flex-1 truncate font-medium text-slate-800">
                          {w.phonetic || w.word}
                        </span>
                        <span className="min-w-0 truncate text-sm text-slate-400">{w.translation}</span>
                      </Link>
                    );
                  })
              )}
            </div>
          )}
        </div>

        {/* Bottom tab row — quick links inside the app panel */}
        <div className="mt-8 flex items-center justify-around border-t border-slate-200 bg-white px-2 py-3">
          {[
            { href: "/home", emoji: "🃏", label: "LEARNING", active: true },
            { href: "/practice", emoji: "💬", label: "PRACTICE", active: false },
            { href: "/media", emoji: "📚", label: "LIBRARY", active: false },
            { href: "/settings", emoji: "👤", label: "ACCOUNT", active: false },
          ].map((tab) => (
            <Link
              key={tab.label}
              href={tab.href}
              className={`flex flex-col items-center gap-0.5 rounded-lg px-3 py-1 text-[11px] font-semibold tracking-wide ${
                tab.active ? "text-slate-900" : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <span className="text-2xl">{tab.emoji}</span>
              {tab.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
