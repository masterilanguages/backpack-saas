"use client";

// Duocards-style phone app shell. Everything lives inside the light rounded
// panel — a fixed-height "phone screen" with the menu pinned at the bottom
// and no page scrolling:
//   LEARNING  the cards home (turtle mascot, goal ring, stats, START, My cards)
//   PRACTICE  AI questions from the user's newest flashcard words + the
//             in-shell Journal (write → AI turns it into a lesson)
//   LIBRARY   the Content Library videos as an in-shell thumbnail grid
//   ACCOUNT   profile menu — Progress and Schedule live here
// The turtle mascot reacts (idle / happy / sad / cheer) like Duolingo's owl.

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { base44 as base44Client } from "@/api/base44Client";
const base44: any = base44Client;
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronRight, ChevronLeft, Plus, BarChart3, Palette, Loader2, X, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { languageLabel } from "@/lib/language";
import { generateLesson } from "@/lib/journal/generateLesson";
import JournalLessonView from "@/components/journal/JournalLessonView";

// Writing starters for the in-shell journal (same set the old page offered).
const JOURNAL_TOPICS: { label: string; starter: string }[] = [
  { label: "My day", starter: "Today I " },
  { label: "How I feel", starter: "Right now I feel " },
  { label: "Grateful for", starter: "I'm grateful for " },
  { label: "A goal", starter: "One thing I want to do is " },
];

const deriveTitle = (text: string) => {
  const first = (text || "").trim().split("\n")[0].trim();
  if (!first) return "Journal entry";
  return first.length > 48 ? first.slice(0, 48).trim() + "…" : first;
};

const DAILY_GOAL = 15;

const LANGUAGE_FLAGS: Record<string, string> = {
  hebrew: "🇮🇱",
  english: "🇬🇧",
  spanish: "🇪🇸",
  french: "🇫🇷",
  portuguese: "🇵🇹",
  italian: "🇮🇹",
};

type Mood = "idle" | "happy" | "sad" | "cheer";

// ---------------------------------------------------------------------------
// Turtle mascot with Duolingo-owl-style reactions. Mood drives the animation
// and the reaction bubble next to it.
// ---------------------------------------------------------------------------
function Turtle({ mood, size = "text-6xl" }: { mood: Mood; size?: string }) {
  const animations: Record<Mood, any> = {
    idle: { y: [0, -3, 0], rotate: 0, scale: 1, transition: { repeat: Infinity, duration: 3 } },
    happy: { y: [0, -18, 0, -10, 0], rotate: [0, -8, 8, 0], scale: 1.08, transition: { duration: 0.9 } },
    cheer: { y: [0, -24, 0, -24, 0], rotate: [0, -12, 12, -12, 0], scale: 1.12, transition: { duration: 1.2 } },
    sad: { y: [0, 4, 0], rotate: [0, -6, 0], scale: 0.94, transition: { duration: 0.8 } },
  };
  const emote = mood === "happy" ? "🎉" : mood === "cheer" ? "🏆" : mood === "sad" ? "💧" : null;
  return (
    <div className="relative inline-flex items-end">
      <motion.span animate={animations[mood]} className={`${size} leading-none`}>
        🐢
      </motion.span>
      <AnimatePresence>
        {emote && (
          <motion.span
            key={mood}
            initial={{ opacity: 0, y: 6, scale: 0.5 }}
            animate={{ opacity: 1, y: -6, scale: 1 }}
            exit={{ opacity: 0 }}
            className="absolute -right-4 -top-2 text-2xl"
          >
            {emote}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [tab, setTab] = useState<"learning" | "practice" | "library" | "account">("learning");
  const [cardsOpen, setCardsOpen] = useState(false);
  const [mood, setMood] = useState<Mood>("idle");

  // In-shell journal (lives inside the Practice tab)
  const [journalMode, setJournalMode] = useState<"off" | "list" | "compose" | "lesson">("off");
  const [journalText, setJournalText] = useState("");
  const [journalSelected, setJournalSelected] = useState<any>(null);
  const [journalBusy, setJournalBusy] = useState(false);
  // In-shell learning-language picker (lives inside the Account tab)
  const [langPickerOpen, setLangPickerOpen] = useState(false);

  // Practice (AI quiz) state
  const [quiz, setQuiz] = useState<any[]>([]);
  const [quizIdx, setQuizIdx] = useState(0);
  const [quizAnswer, setQuizAnswer] = useState<number | null>(null);
  const [quizScore, setQuizScore] = useState(0);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizDone, setQuizDone] = useState(false);

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
    document.title = "Home - Lashon Languages";
    // Deep-link support: /home?open=journal (old /journal links redirect here).
    const open = new URLSearchParams(window.location.search).get("open");
    if (open === "journal") {
      setTab("practice");
      setJournalMode("list");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Reactions decay back to idle.
  useEffect(() => {
    if (mood === "idle") return;
    const t = setTimeout(() => setMood("idle"), 1600);
    return () => clearTimeout(t);
  }, [mood]);

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

  // Library tab: master-library videos in the learner's language + their own
  // personal videos, rendered as thumbnails inside the shell.
  const { data: libraryVideos = [] } = useQuery({
    queryKey: ["mediaLibrary"],
    queryFn: () => base44.entities.MediaLibrary.list(),
    enabled: !!currentUser && tab === "library",
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const { data: myVideos = [] } = useQuery({
    queryKey: ["userSavedVideos", currentUser?.email],
    queryFn: () => base44.entities.UserSavedVideo.list(),
    enabled: !!currentUser && tab === "library",
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const shellVideos = useMemo(() => {
    const catalog = (libraryVideos as any[])
      .filter((v) => v.is_active !== false && (!v.language || v.language === language));
    const own = (myVideos as any[])
      .filter((v) => v.created_by === currentUser?.email)
      .map((v) => ({ ...v, _mine: true }));
    return [...own, ...catalog];
  }, [libraryVideos, myVideos, language, currentUser?.email]);

  // Journal entries (in-shell journal). Legacy daily-journal rows are left out.
  const { data: journalEntries = [] } = useQuery({
    queryKey: ["journalLessonEntries"],
    queryFn: () => base44.entities.JournalEntry.list("-created_date"),
    enabled: !!currentUser && journalMode !== "off",
  });
  const lessonEntries = useMemo(
    () => (journalEntries as any[]).filter((e) => e.target_language || e.lesson || e.status),
    [journalEntries]
  );

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
  const ringRadius = 40;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const streak = userProfile?.daily_streak || 0;

  // Switch the learning language — same behavior the old sidebar switcher had:
  // update the profile and invalidate everything that filters by language.
  const changeLanguageMutation = useMutation({
    mutationFn: async (lang: string) => {
      const profiles = await base44.entities.UserProfile.filter({ created_by: currentUser?.email });
      if (profiles[0]) return base44.entities.UserProfile.update(profiles[0].id, { language: lang });
      return base44.entities.UserProfile.create({ language: lang, current_day: 1 });
    },
    onSuccess: (_data: any, lang: string) => {
      queryClient.invalidateQueries({ queryKey: ["userProfile"] });
      toast.success(`Language switched to ${lang.charAt(0).toUpperCase()}${lang.slice(1)}`);
      setLangPickerOpen(false);
    },
    onError: (e: any) => toast.error(`Couldn't switch language: ${e?.message || "unknown error"}`),
  });

  const bumpWordMutation = useMutation({
    mutationFn: ({ id, level }: any) =>
      base44.entities.Word.update(id, { times_practiced: level, mastered: level >= 5 }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["wordRatings"] }),
  });

  const startLearning = () => {
    // Same handoff the Backpack uses for its "All Words" flashcard run.
    if (typeof window !== "undefined") {
      sessionStorage.setItem("pendingFlashcardWords", JSON.stringify({ allWords: true }));
    }
    router.push("/library?flashcard=all");
  };

  // -------------------------------------------------------------------------
  // Practice: AI multiple-choice questions from the newest flashcard words.
  // -------------------------------------------------------------------------
  const startQuiz = async () => {
    const pool = (words as any[])
      .filter((w) => w.translation && (w.phonetic || w.word))
      .sort((a, b) => new Date(b.created_date || 0).getTime() - new Date(a.created_date || 0).getTime())
      .sort((a, b) => (a.times_practiced || 0) - (b.times_practiced || 0))
      .slice(0, 8);
    if (pool.length < 2) {
      toast.info("Add a few words to your cards first!");
      return;
    }
    setQuizLoading(true);
    setQuizDone(false);
    setQuiz([]);
    setQuizIdx(0);
    setQuizScore(0);
    setQuizAnswer(null);
    try {
      const label = languageLabel(language);
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `You are a ${label} tutor. Create one multiple-choice exercise per word for these ${label} flashcards the student recently added:

${pool.map((w) => `- "${w.phonetic || w.word}" = "${w.translation}"`).join("\n")}

Mix question styles: translate ${label}→English, translate English→${label}, and fill-the-blank in a short sentence. Each question has exactly 4 options with ONE correct. Distractors must be plausible but clearly wrong. Keep questions short.

Return JSON: { "questions": [ { "word": the flashcard word, "prompt": the question text, "options": [4 strings], "correct_index": 0-3, "explanation": one short sentence } ] }`,
        response_json_schema: {
          type: "object",
          properties: {
            questions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  word: { type: "string" },
                  prompt: { type: "string" },
                  options: { type: "array", items: { type: "string" } },
                  correct_index: { type: "number" },
                  explanation: { type: "string" },
                },
              },
            },
          },
        },
      });
      const qs = (result?.questions || []).filter((q: any) => Array.isArray(q.options) && q.options.length === 4);
      if (qs.length === 0) throw new Error("no questions");
      setQuiz(qs);
    } catch (e) {
      toast.error("Couldn't generate exercises — try again.");
    }
    setQuizLoading(false);
  };

  const answerQuiz = (idx: number) => {
    if (quizAnswer !== null) return;
    const q = quiz[quizIdx];
    const correct = idx === q.correct_index;
    setQuizAnswer(idx);
    if (correct) {
      setQuizScore((s) => s + 1);
      setMood("happy");
      // Correct answer counts as practice on that word (feeds the daily goal).
      const w = (words as any[]).find(
        (w) => (w.phonetic || w.word)?.toLowerCase() === (q.word || "").toLowerCase()
      );
      if (w) {
        const level = Math.min((w.times_practiced || 0) + 1, 4);
        bumpWordMutation.mutate({ id: w.id, level });
      }
    } else {
      setMood("sad");
    }
  };

  const nextQuiz = () => {
    if (quizIdx + 1 >= quiz.length) {
      setQuizDone(true);
      if (quizScore === quiz.length) setMood("cheer");
    } else {
      setQuizIdx((i) => i + 1);
      setQuizAnswer(null);
    }
  };

  // -------------------------------------------------------------------------
  // In-shell journal: write an entry, AI turns it into a target-language
  // lesson (same generateLesson module the old /journal page used).
  // -------------------------------------------------------------------------
  const generateJournalLesson = async () => {
    if (!journalText.trim()) {
      toast.info("Write a few sentences first!");
      return;
    }
    setJournalBusy(true);
    try {
      const lesson = await generateLesson({
        originalText: journalText,
        targetLanguage: language,
        invokeLLM: base44.integrations.Core.InvokeLLM,
      });
      const saved = await base44.entities.JournalEntry.create({
        title: deriveTitle(journalText),
        date: new Date().toISOString().split("T")[0],
        text: journalText,
        original_language: null,
        target_language: language,
        status: "generated",
        lesson,
      });
      queryClient.invalidateQueries({ queryKey: ["journalLessonEntries"] });
      // Shim may drop the lesson column pre-migration; keep the in-memory copy.
      setJournalSelected({ ...(saved || {}), lesson: saved?.lesson || lesson });
      setJournalMode("lesson");
      setJournalText("");
      setMood("happy");
    } catch (e) {
      console.error(e);
      toast.error("Couldn't generate the lesson — please try again.");
    }
    setJournalBusy(false);
  };

  const goalPct = goalDone / DAILY_GOAL;

  return (
    // Full dark backdrop with an iPhone-looking frame centered on it.
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-3 py-4">
      {/* Bezel */}
      <div className="relative w-full max-w-md rounded-[3rem] border border-slate-700 bg-slate-900 p-2.5 shadow-[0_0_80px_rgba(45,212,191,0.07)]">
        {/* Notch / dynamic island */}
        <div className="absolute left-1/2 top-4 z-20 h-6 w-28 -translate-x-1/2 rounded-full bg-slate-900" />
        {/* The phone screen: fixed height, no page scroll, menu pinned bottom. */}
        <div className="flex h-[min(820px,calc(100dvh-3.5rem))] w-full flex-col overflow-hidden rounded-[2.4rem] bg-[#eef4fb]">

        {/* Top bar: palette · language · stats (padded below the notch) */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200/70 bg-white/80 px-5 pb-2.5 pt-8">
          <Palette className="h-5 w-5 text-slate-300" />
          <button
            onClick={() => { setTab("account"); setLangPickerOpen(true); }}
            className="flex items-center gap-2 text-lg font-semibold text-slate-800"
          >
            <span className="text-xl">{LANGUAGE_FLAGS[language] || "🌍"}</span>
            <span className="capitalize">{language}</span>
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </button>
          <button onClick={() => { setTab("account"); }} aria-label="Stats">
            <BarChart3 className="h-5 w-5 text-slate-400 transition hover:text-slate-600" />
          </button>
        </div>

        {/* ================= LEARNING ================= */}
        {tab === "learning" && (
          <div className="flex min-h-0 flex-1 flex-col px-4 pt-5">
            {/* Streak flame + tip card */}
            <div className="relative flex-shrink-0">
              <div className="absolute -top-4 left-1/2 z-10 -translate-x-1/2">
                <div className="relative flex h-9 w-9 items-center justify-center">
                  <span className="text-4xl leading-none drop-shadow">🔥</span>
                  <span className="absolute top-3 text-xs font-bold text-white">{streak}</span>
                </div>
              </div>
              <div
                onClick={() => setTab("practice")}
                className="relative cursor-pointer rounded-xl border border-slate-200 bg-white px-4 pb-3 pt-6 text-center shadow-sm transition hover:shadow-md"
              >
                <p className="text-sm font-semibold text-slate-800">Try our AI-assistant</p>
                <p className="mt-1 text-xs text-slate-600">
                  Tap Practice 💬 and get exercises built from your newest cards
                </p>
                <div className="absolute -bottom-2 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r border-slate-200 bg-white" />
              </div>
            </div>

            {/* Turtle scene with campfire goal ring */}
            <div className="relative mx-auto mt-6 h-40 w-full flex-shrink-0">
              <div className="absolute inset-x-2 top-6 h-32 rounded-[50%] bg-[#eaf7d9]" />
              <span className="absolute left-[8%] top-2 text-4xl">🏜️</span>
              <div className="absolute left-[26%] top-10">
                <Turtle mood={mood} />
              </div>
              <div className="absolute right-[10%] top-4">
                <div className="relative flex h-24 w-24 items-center justify-center">
                  <svg viewBox="0 0 96 96" className="absolute inset-0 h-full w-full -rotate-90">
                    <circle cx="48" cy="48" r={ringRadius} fill="none" stroke="#dce8f5" strokeWidth="4" />
                    <circle
                      cx="48" cy="48" r={ringRadius} fill="none"
                      stroke="#f97316" strokeWidth="4" strokeLinecap="round"
                      strokeDasharray={ringCircumference}
                      strokeDashoffset={ringCircumference * (1 - goalPct)}
                    />
                  </svg>
                  <div className="flex flex-col items-center">
                    <span
                      className="cursor-pointer text-3xl"
                      onClick={() => setMood(goalDone >= DAILY_GOAL ? "cheer" : "happy")}
                    >
                      🔥
                    </span>
                    <span className="text-xs font-semibold text-orange-600">
                      {goalDone} / {DAILY_GOAL}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Stats row */}
            <div className="mt-4 grid flex-shrink-0 grid-cols-3 divide-x divide-slate-200 rounded-2xl border border-slate-200 bg-white py-3 shadow-sm">
              {[
                { label: "TO LEARN", value: toLearn, color: "text-sky-500" },
                { label: "PRACTICED", value: practiced, color: "text-green-600" },
                { label: "LEARNED", value: learned, color: "text-amber-500" },
              ].map((s) => (
                <div key={s.label} className="flex flex-col items-center gap-0.5">
                  <span className={`text-[11px] font-semibold tracking-wide ${s.color}`}>{s.label}</span>
                  <span className={`text-3xl font-bold ${s.color}`}>{s.value}</span>
                </div>
              ))}
            </div>

            {/* START */}
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={startLearning}
              className="mt-3 w-full flex-shrink-0 rounded-full bg-gradient-to-b from-sky-400 to-sky-500 py-3 text-lg font-semibold tracking-wide text-white shadow-lg shadow-sky-500/30"
            >
              START
            </motion.button>

            {/* My cards — expands into the remaining space, scrolls internally */}
            <div className="mt-3 flex min-h-0 flex-1 flex-col pb-3">
              <div className="flex flex-shrink-0 items-stretch overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <button onClick={() => setCardsOpen((o) => !o)} className="flex flex-1 items-center gap-2 px-4 py-3 text-left">
                  <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${cardsOpen ? "" : "-rotate-90"}`} />
                  <span className="font-medium text-slate-800">My cards</span>
                  <span className="text-sm text-slate-400">{(words as any[]).length}</span>
                </button>
                <button
                  onClick={() => router.push("/library")}
                  aria-label="Add a card"
                  className="flex items-center border-l border-slate-200 px-4 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>
              {cardsOpen && (
                <div className="mt-2 min-h-0 flex-1 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                  {(words as any[]).length === 0 ? (
                    <p className="px-4 py-5 text-center text-sm text-slate-400">No cards yet — tap + to add your first word!</p>
                  ) : (
                    (words as any[])
                      .slice()
                      .sort((a, b) => (a.phonetic || a.word || "").localeCompare(b.phonetic || b.word || ""))
                      .map((w) => {
                        const level = w.times_practiced || 0;
                        const dot = level >= 5 ? "bg-amber-400" : level > 0 ? "bg-green-500" : "bg-sky-400";
                        return (
                          <div key={w.id} className="flex items-center gap-3 border-b border-slate-100 px-4 py-2.5 last:border-b-0">
                            <span className={`h-2 w-2 flex-shrink-0 rounded-full ${dot}`} />
                            <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{w.phonetic || w.word}</span>
                            <span className="min-w-0 truncate text-xs text-slate-400">{w.translation}</span>
                          </div>
                        );
                      })
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= PRACTICE / JOURNAL ================= */}
        {tab === "practice" && journalMode !== "off" && (
          <div className="flex min-h-0 flex-1 flex-col px-4 pt-4">
            {/* Journal header */}
            <div className="flex flex-shrink-0 items-center gap-2">
              <button
                onClick={() => {
                  if (journalMode === "list") setJournalMode("off");
                  else setJournalMode("list");
                  setJournalSelected(null);
                }}
                aria-label="Back"
                className="rounded-lg p-1 text-slate-400 hover:bg-white hover:text-slate-700"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="text-lg font-bold text-slate-800">📓 Journal</span>
              {journalMode === "list" && (
                <button
                  onClick={() => { setJournalText(""); setJournalMode("compose"); }}
                  className="ml-auto flex items-center gap-1 rounded-full bg-teal-500 px-3 py-1.5 text-xs font-semibold text-white shadow"
                >
                  <Plus className="h-3.5 w-3.5" /> New entry
                </button>
              )}
            </div>

            {journalMode === "list" && (
              <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pb-3">
                {lessonEntries.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white/60 px-4 py-8 text-center">
                    <span className="text-3xl">📓</span>
                    <p className="text-sm font-medium text-slate-700">No entries yet</p>
                    <p className="text-xs text-slate-500">Write about your real life — it becomes a lesson you can use.</p>
                    <button
                      onClick={() => { setJournalText(""); setJournalMode("compose"); }}
                      className="mt-1 rounded-full bg-teal-500 px-4 py-2 text-sm font-semibold text-white shadow"
                    >
                      + New entry
                    </button>
                  </div>
                ) : (
                  lessonEntries.map((e: any) => (
                    <button
                      key={e.id}
                      onClick={() => {
                        if (e.lesson) { setJournalSelected(e); setJournalMode("lesson"); }
                        else { setJournalText(e.text || ""); setJournalMode("compose"); }
                      }}
                      className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition hover:shadow-md"
                    >
                      <span className="text-xl">{e.lesson ? "✨" : "✏️"}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-800">{e.title || deriveTitle(e.text)}</span>
                        <span className="block text-xs text-slate-400">{e.date || ""}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-400" />
                    </button>
                  ))
                )}
                {/* Newest backpack words */}
                {(words as any[]).length > 0 && (
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">🎒 Newest words in your backpack</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(words as any[])
                        .slice()
                        .sort((a, b) => new Date(b.created_date || 0).getTime() - new Date(a.created_date || 0).getTime())
                        .slice(0, 6)
                        .map((w) => (
                          <span key={w.id} className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700">
                            {w.phonetic || w.word} · {w.translation}
                          </span>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {journalMode === "compose" && (
              <div className="mt-3 flex min-h-0 flex-1 flex-col pb-3">
                <div className="flex flex-shrink-0 flex-wrap gap-1.5">
                  {JOURNAL_TOPICS.map((t) => (
                    <button
                      key={t.label}
                      onClick={() => setJournalText((txt) => (txt ? txt : t.starter))}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 shadow-sm hover:border-teal-400"
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <textarea
                  value={journalText}
                  onChange={(e) => setJournalText(e.target.value)}
                  placeholder="Write about your day in English or Hebrew…"
                  className="mt-2 min-h-0 w-full flex-1 resize-none rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-teal-500 focus:outline-none"
                />
                <button
                  onClick={generateJournalLesson}
                  disabled={journalBusy || !journalText.trim()}
                  className="mt-3 flex flex-shrink-0 items-center justify-center gap-2 rounded-full bg-gradient-to-b from-teal-400 to-teal-500 py-3 font-semibold text-white shadow-lg shadow-teal-500/30 disabled:opacity-50"
                >
                  {journalBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {journalBusy ? "Creating your lesson…" : "Turn into a lesson"}
                </button>
              </div>
            )}

            {journalMode === "lesson" && journalSelected && (
              // JournalLessonView is dark-themed; give it a dark inset "reader"
              // so it stays legible inside the light shell.
              <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-2xl bg-slate-900 p-4 pb-6">
                {journalSelected.lesson ? (
                  <JournalLessonView
                    lesson={journalSelected.lesson}
                    language={String(journalSelected.target_language || language).toLowerCase()}
                    journalEntryId={journalSelected.id}
                    libraryLessonId={journalSelected.library_item_id || undefined}
                  />
                ) : (
                  <p className="text-sm text-slate-400">This entry has no lesson yet.</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ================= PRACTICE ================= */}
        {tab === "practice" && journalMode === "off" && (
          <div className="flex min-h-0 flex-1 flex-col px-4 pt-5">
            {quiz.length === 0 && !quizLoading ? (
              <>
                <div className="flex flex-shrink-0 flex-col items-center text-center">
                  <Turtle mood={mood} size="text-5xl" />
                  <h2 className="mt-2 text-lg font-bold text-slate-800">Practice</h2>
                  <p className="mt-1 px-4 text-sm text-slate-500">
                    AI questions and exercises built from the newest words in your cards.
                  </p>
                </div>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={startQuiz}
                  className="mt-5 w-full flex-shrink-0 rounded-full bg-gradient-to-b from-green-400 to-green-500 py-3 text-lg font-semibold text-white shadow-lg shadow-green-500/30"
                >
                  Start exercises
                </motion.button>

                {/* Journal lives inside Practice — opens in-shell */}
                <button
                  onClick={() => setJournalMode("list")}
                  className="mt-4 flex flex-shrink-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left shadow-sm transition hover:shadow-md"
                >
                  <span className="text-2xl">📓</span>
                  <span className="flex-1">
                    <span className="block font-medium text-slate-800">Journal</span>
                    <span className="block text-xs text-slate-500">Write entries and turn them into lessons</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </button>

                <button
                  onClick={() => router.push("/practice")}
                  className="mt-3 flex flex-shrink-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left shadow-sm transition hover:shadow-md"
                >
                  <span className="text-2xl">🗣️</span>
                  <span className="flex-1">
                    <span className="block font-medium text-slate-800">Chat &amp; speaking</span>
                    <span className="block text-xs text-slate-500">Talk with the AI assistant</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </button>
              </>
            ) : quizLoading ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3">
                <Turtle mood="idle" size="text-5xl" />
                <Loader2 className="h-6 w-6 animate-spin text-green-500" />
                <p className="text-sm text-slate-500">Building exercises from your cards…</p>
              </div>
            ) : quizDone ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                <Turtle mood={quizScore === quiz.length ? "cheer" : "happy"} size="text-6xl" />
                <h2 className="text-2xl font-bold text-slate-800">
                  {quizScore} / {quiz.length}
                </h2>
                <p className="text-sm text-slate-500">
                  {quizScore === quiz.length ? "Perfect! The turtle is thrilled! 🏆" : "Nice work — keep practicing!"}
                </p>
                <div className="mt-2 flex gap-2">
                  <button onClick={startQuiz} className="rounded-full bg-green-500 px-5 py-2.5 font-semibold text-white shadow">
                    Practice again
                  </button>
                  <button onClick={() => { setQuiz([]); setQuizDone(false); }} className="rounded-full border border-slate-300 bg-white px-5 py-2.5 font-semibold text-slate-600">
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex flex-shrink-0 items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400">
                    {quizIdx + 1} / {quiz.length}
                  </span>
                  <button onClick={() => { setQuiz([]); setQuizAnswer(null); }} aria-label="Quit practice">
                    <X className="h-4 w-4 text-slate-400" />
                  </button>
                </div>
                <div className="mt-1 h-1.5 flex-shrink-0 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${((quizIdx + (quizAnswer !== null ? 1 : 0)) / quiz.length) * 100}%` }} />
                </div>

                <div className="mt-4 flex flex-shrink-0 items-start gap-3">
                  <Turtle mood={mood} size="text-4xl" />
                  <div className="relative flex-1 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                    <p className="text-sm font-medium text-slate-800">{quiz[quizIdx].prompt}</p>
                  </div>
                </div>

                <div className="mt-4 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pb-2">
                  {quiz[quizIdx].options.map((opt: string, i: number) => {
                    const isCorrect = i === quiz[quizIdx].correct_index;
                    const chosen = quizAnswer === i;
                    let cls = "border-slate-200 bg-white text-slate-800 hover:border-sky-400";
                    if (quizAnswer !== null) {
                      if (isCorrect) cls = "border-green-500 bg-green-50 text-green-700";
                      else if (chosen) cls = "border-red-400 bg-red-50 text-red-600";
                      else cls = "border-slate-200 bg-white text-slate-400";
                    }
                    return (
                      <button
                        key={i}
                        onClick={() => answerQuiz(i)}
                        disabled={quizAnswer !== null}
                        className={`flex-shrink-0 rounded-xl border-2 px-4 py-3 text-left text-sm font-medium shadow-sm transition ${cls}`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                  {quizAnswer !== null && (
                    <div className="flex-shrink-0 pb-1">
                      {quiz[quizIdx].explanation && (
                        <p className="mb-2 text-xs text-slate-500">{quiz[quizIdx].explanation}</p>
                      )}
                      <button onClick={nextQuiz} className="w-full rounded-full bg-sky-500 py-3 font-semibold text-white shadow">
                        {quizIdx + 1 >= quiz.length ? "Finish" : "Next"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= LIBRARY ================= */}
        {tab === "library" && (
          <div className="flex min-h-0 flex-1 flex-col px-4 pt-4">
            <div className="flex flex-shrink-0 items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">📚 Library</h2>
              <button
                onClick={() => router.push("/media")}
                className="rounded-full bg-teal-500 px-3 py-1.5 text-xs font-semibold text-white shadow"
              >
                + Add video
              </button>
            </div>
            <div className="mt-3 min-h-0 flex-1 overflow-y-auto pb-3">
              {shellVideos.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white/60 px-4 py-10 text-center">
                  <span className="text-3xl">📺</span>
                  <p className="text-sm font-medium text-slate-700">No videos yet</p>
                  <p className="text-xs text-slate-500">Add a YouTube video to start learning from real content.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {shellVideos.map((v: any) => {
                    const vid = v.video_id || "";
                    const thumb = v.thumbnail_url || (vid ? `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` : "");
                    return (
                      <button
                        key={`${v._mine ? "mine" : "cat"}_${v.id}`}
                        onClick={() => router.push(`/media?videoId=${encodeURIComponent(vid)}`)}
                        className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition hover:shadow-md"
                      >
                        <div className="aspect-video w-full bg-slate-200">
                          {thumb && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={thumb} alt={v.title} className="h-full w-full object-cover" onError={(e: any) => { e.target.style.display = "none"; }} />
                          )}
                        </div>
                        <div className="p-2.5">
                          <p className="line-clamp-2 text-xs font-semibold leading-snug text-slate-800">{v.title}</p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1">
                            {v.difficulty_level && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">{v.difficulty_level}</span>}
                            {v.duration_minutes && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">{v.duration_minutes} min</span>}
                            {v._mine && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600">My video</span>}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= ACCOUNT ================= */}
        {tab === "account" && (
          <div className="flex min-h-0 flex-1 flex-col px-4 pt-6">
            <div className="flex flex-shrink-0 flex-col items-center text-center">
              <Turtle mood={mood} size="text-5xl" />
              <p className="mt-2 font-semibold text-slate-800">{currentUser?.full_name || currentUser?.email}</p>
              <p className="text-xs text-slate-400">{currentUser?.email}</p>
            </div>
            <div className="mt-5 space-y-2.5 overflow-y-auto pb-3">
              {/* Learning language — expandable picker (was the sidebar switcher) */}
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <button
                  onClick={() => setLangPickerOpen((o) => !o)}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
                >
                  <span className="text-2xl">{LANGUAGE_FLAGS[language] || "🌍"}</span>
                  <span className="flex-1">
                    <span className="block font-medium capitalize text-slate-800">{language}</span>
                    <span className="block text-xs text-slate-500">Learning language</span>
                  </span>
                  <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${langPickerOpen ? "rotate-180" : ""}`} />
                </button>
                {langPickerOpen && (
                  <div className="border-t border-slate-100 px-2 py-2">
                    {Object.entries(LANGUAGE_FLAGS).map(([id, flag]) => (
                      <button
                        key={id}
                        onClick={() => changeLanguageMutation.mutate(id)}
                        disabled={changeLanguageMutation.isPending}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-slate-50 ${
                          id === language ? "font-semibold text-teal-600" : "text-slate-700"
                        }`}
                      >
                        <span className="text-lg">{flag}</span>
                        <span className="flex-1 capitalize">{id}</span>
                        {id === language && <span className="text-xs">✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {[
                { emoji: "📈", label: "Progress", desc: "Streaks, words and study time", href: "/progress" },
                { emoji: "🗓️", label: "Schedule", desc: "Your sessions and daily tasks", href: "/learn/lessons/days" },
                { emoji: "⚙️", label: "Settings", desc: "Account and preferences", href: "/settings" },
                ...(currentUser && ["admin", "coach", "owner"].includes(currentUser.role)
                  ? [{ emoji: "🛠️", label: "Admin console", desc: "Manage your school", href: "/dashboard" }]
                  : []),
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={() => router.push(item.href)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-left shadow-sm transition hover:shadow-md"
                >
                  <span className="text-2xl">{item.emoji}</span>
                  <span className="flex-1">
                    <span className="block font-medium text-slate-800">{item.label}</span>
                    <span className="block text-xs text-slate-500">{item.desc}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </button>
              ))}
              <button
                onClick={() => base44.auth.logout()}
                className="flex w-full items-center gap-3 rounded-2xl border border-red-100 bg-white px-4 py-3.5 text-left shadow-sm transition hover:bg-red-50"
              >
                <span className="text-2xl">🚪</span>
                <span className="flex-1 font-medium text-red-500">Sign out</span>
              </button>
            </div>
          </div>
        )}

        {/* ================= BOTTOM MENU (pinned) ================= */}
        <div className="flex flex-shrink-0 items-center justify-around border-t border-slate-200 bg-white px-2 py-2">
          {[
            { key: "learning", emoji: "🎒", label: "BACKPACK", onTap: () => setTab("learning") },
            { key: "practice", emoji: "💬", label: "PRACTICE", onTap: () => { setTab("practice"); setJournalMode("off"); } },
            { key: "library", emoji: "📚", label: "LIBRARY", onTap: () => setTab("library") },
            { key: "account", emoji: "👤", label: "ACCOUNT", onTap: () => setTab("account") },
          ].map((t) => (
            <button
              key={t.key}
              onClick={t.onTap}
              className={`flex flex-col items-center gap-0.5 rounded-lg px-3 py-1 text-[10px] font-semibold tracking-wide ${
                tab === t.key ? "text-slate-900" : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <span className="text-xl">{t.emoji}</span>
              {t.label}
            </button>
          ))}
        </div>
        </div>
        {/* Home indicator */}
        <div className="mx-auto mt-2 h-1 w-28 rounded-full bg-slate-700" />
      </div>
    </div>
  );
}
