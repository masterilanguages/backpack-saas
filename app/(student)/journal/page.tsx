"use client";

import React, { useState, useEffect, useMemo } from "react";
import { base44 as base44Client } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Link, createPageUrl } from "@/lib/router-compat";
import {
  ArrowLeft,
  BookOpen,
  Plus,
  Loader2,
  Sparkles,
  PenLine,
  Calendar,
  Languages,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import JournalLessonView from "@/components/journal/JournalLessonView";
import { generateLesson, type GeneratedLesson } from "@/lib/journal/generateLesson";
import { languageLabel, needsTransliteration, isRTLLanguage } from "@/lib/language";

// base44 shim entities are built dynamically; TS can't see entity keys. Cast to
// any for ergonomic access — the runtime shape is guaranteed by the shim.
const base44: any = base44Client;

// Proposed writing prompts. Tapping one drops a gentle starter into the page —
// the learner is free to ignore them and write whatever they want.
const TOPICS: { label: string; starter: string }[] = [
  { label: "My day", starter: "Today I " },
  { label: "How I feel", starter: "Right now I feel " },
  { label: "Grateful for", starter: "I'm grateful for " },
  { label: "A small win", starter: "Something good that happened was " },
  { label: "A goal", starter: "One thing I want to do is " },
  { label: "Someone I love", starter: "I keep thinking about " },
  { label: "A memory", starter: "I remember when " },
  { label: "A place", starter: "A place I want to go is " },
];

type Mode = "list" | "compose" | "lesson";

const today = () => new Date().toISOString().split("T")[0];

// The list needs a label per entry; we no longer ask for a title, so derive one
// from the entry's first line.
function deriveTitle(text: string) {
  const first = (text || "").trim().split("\n")[0].trim();
  if (!first) return "Journal entry";
  return first.length > 48 ? first.slice(0, 48).trim() + "…" : first;
}

function statusBadge(status?: string) {
  if (status === "generated" || status === "saved_to_library")
    return { label: "Generated", cls: "bg-teal-500/15 text-teal-300" };
  return { label: "Draft", cls: "bg-slate-800 text-slate-400" };
}

export default function Journal() {
  const queryClient = useQueryClient();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [mode, setMode] = useState<Mode>("list");
  const [selected, setSelected] = useState<any>(null); // entry being viewed
  const [editingId, setEditingId] = useState<string | null>(null); // draft being edited
  const [originalText, setOriginalText] = useState("");

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  const { data: userProfile } = useQuery({
    queryKey: ["userProfile", currentUser?.email],
    queryFn: async () => {
      const profiles = await base44.entities.UserProfile.filter({
        created_by: currentUser.email,
      });
      return profiles[0] || null;
    },
    enabled: !!currentUser?.email,
  });

  // Target language is simply the language the learner is studying — no picker.
  const lang = String(userProfile?.language || "hebrew").toLowerCase();
  const rtl = isRTLLanguage(lang);
  const showTranslit = needsTransliteration(lang);

  const { data: entries = [] } = useQuery({
    queryKey: ["journalLessonEntries"],
    queryFn: () => base44.entities.JournalEntry.list("-created_date"),
  });

  // Show only entries created by this feature (they carry a target language /
  // lesson / status). Legacy daily-journal rows are left out of the list.
  const lessonEntries = useMemo(
    () =>
      (entries || []).filter(
        (e: any) => e.target_language || e.lesson || e.status
      ),
    [entries]
  );

  // Newest words the learner has added to their Backpack, in the current
  // language — shown at the bottom of the journal so they're easy to reuse.
  const { data: backpackWords = [] } = useQuery({
    queryKey: ["journalBackpackWords", currentUser?.email, lang],
    queryFn: async () => {
      const all = await base44.entities.Word.filter({
        category: "wordbank",
        created_by: currentUser.email,
      });
      return all.filter((w: any) => !w.language || w.language === lang);
    },
    enabled: !!currentUser?.email,
  });

  const latestWords = useMemo(
    () =>
      [...backpackWords]
        .sort(
          (a: any, b: any) =>
            new Date(b.created_date).getTime() - new Date(a.created_date).getTime()
        )
        .slice(0, 12),
    [backpackWords]
  );

  const openNew = () => {
    setEditingId(null);
    setOriginalText("");
    setMode("compose");
  };

  const openEntry = (entry: any) => {
    if (entry.lesson) {
      setSelected(entry);
      setMode("lesson");
    } else {
      // A draft — reopen it in the composer to generate.
      setEditingId(entry.id);
      setOriginalText(entry.text || "");
      setMode("compose");
    }
  };

  const insertTopic = (starter: string) =>
    setOriginalText((t) => {
      const base = t.replace(/\s+$/, "");
      return (base ? base + "\n\n" : "") + starter;
    });

  const buildEntryData = (
    status: "draft" | "generated",
    lesson?: GeneratedLesson
  ) => ({
    title: deriveTitle(originalText),
    date: today(),
    text: originalText,
    original_language: null,
    target_language: lang,
    status,
    lesson: lesson || null,
  });

  const persist = async (data: any) => {
    if (editingId) return base44.entities.JournalEntry.update(editingId, data);
    return base44.entities.JournalEntry.create(data);
  };

  const generateMutation = useMutation({
    mutationFn: async () => {
      const lesson = await generateLesson({
        originalText,
        targetLanguage: lang,
        invokeLLM: base44.integrations.Core.InvokeLLM,
      });
      const saved = await persist(buildEntryData("generated", lesson));
      // Pre-migration, the shim drops the lesson column; fall back to the
      // in-memory lesson so the view still works this session.
      return { ...(saved || {}), lesson: saved?.lesson || lesson };
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ["journalLessonEntries"] });
      setSelected(saved);
      setMode("lesson");
      toast.success("Lesson ready — saved to your Journal 📓");
    },
    onError: (e: any) => {
      console.error("Lesson generation failed", e);
      toast.error("Couldn't generate the lesson — please try again.");
    },
  });

  const draftMutation = useMutation({
    mutationFn: () => persist(buildEntryData("draft")),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journalLessonEntries"] });
      toast.success("Draft saved 📝");
      setOriginalText("");
      setEditingId(null);
      setMode("list");
    },
    onError: () => toast.error("Couldn't save the draft — please try again."),
  });

  const canGenerate = originalText.trim().length >= 10 && !generateMutation.isPending;

  // Reusable: newest Backpack words, shown at the bottom of the journal.
  const backpackSection =
    latestWords.length > 0 ? (
      <section className="mt-10">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-slate-400">
            <span>🎒</span> Newest words in your Backpack
          </h3>
          <Link
            to="/library"
            className="text-xs font-medium text-teal-400 transition-colors hover:text-teal-300"
          >
            Open Backpack →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {latestWords.map((w: any) => (
            <div
              key={w.id}
              className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2.5"
            >
              <div className="font-semibold text-white" dir={rtl ? "rtl" : "ltr"}>
                {w.word || w.phonetic}
              </div>
              {showTranslit && w.phonetic && w.phonetic !== w.word && (
                <div className="text-xs text-teal-300">{w.phonetic}</div>
              )}
              <div className="truncate text-xs text-slate-400">{w.translation}</div>
            </div>
          ))}
        </div>
      </section>
    ) : null;

  // ── Lesson view ──────────────────────────────────────────────────────────
  if (mode === "lesson" && selected) {
    return (
      <div className="min-h-screen bg-slate-950">
        <div className="mx-auto max-w-3xl px-4 py-6">
          <div className="mb-6 flex items-center gap-4">
            <button
              onClick={() => setMode("list")}
              className="text-slate-400 transition-colors hover:text-white"
              aria-label="Back to journal"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold text-white">
                {selected.title || "Journal lesson"}
              </h1>
              <p className="flex items-center gap-2 text-sm text-slate-400">
                <Languages className="h-3.5 w-3.5" />
                {languageLabel(selected.target_language || lang)}
                <span className="text-slate-600">·</span>
                {new Date(
                  selected.date || selected.created_date || Date.now()
                ).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>

          {selected.lesson ? (
            <JournalLessonView
              lesson={selected.lesson}
              language={String(selected.target_language || lang).toLowerCase()}
              journalEntryId={selected.id}
              libraryLessonId={selected.library_item_id || undefined}
            />
          ) : (
            <p className="text-slate-400">This entry has no generated lesson yet.</p>
          )}
        </div>
      </div>
    );
  }

  // ── Composer ─────────────────────────────────────────────────────────────
  if (mode === "compose") {
    return (
      <div className="min-h-screen bg-slate-950">
        <div className="mx-auto max-w-2xl px-4 py-6">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setMode("list")}
                className="text-slate-400 transition-colors hover:text-white"
                aria-label="Back to journal"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
                <PenLine className="h-6 w-6 text-teal-400" /> New journal entry
              </h1>
            </div>
            <span className="flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-xs font-semibold text-teal-300">
              <Languages className="h-3.5 w-3.5" /> {languageLabel(lang)}
            </span>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            {/* Proposed topics — optional sparks, not required */}
            <p className="mb-2 text-xs font-medium text-slate-400">
              Need a spark? Tap a topic — or just start writing.
            </p>
            <div className="mb-4 flex flex-wrap gap-2">
              {TOPICS.map((t) => (
                <button
                  key={t.label}
                  onClick={() => insertTopic(t.starter)}
                  className="rounded-full border border-slate-700 px-3 py-1 text-xs font-medium text-slate-300 transition-colors hover:border-teal-500/40 hover:bg-teal-500/10 hover:text-teal-300"
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Notebook paper: a warm ruled page with a red margin line, so writing
                an entry feels like a journal instead of filling in a form. The ruled
                lines use background-attachment:local so they scroll with the text, and
                the gradient period matches the textarea line-height. */}
            <div
              className="relative overflow-hidden rounded-xl border border-amber-950/20"
              style={{ background: "#faf6ea" }}
            >
              <div
                className="pointer-events-none absolute inset-y-0"
                style={{ left: 46, width: 2, background: "rgba(200,72,72,0.4)" }}
                aria-hidden="true"
              />
              <textarea
                value={originalText}
                onChange={(e) => setOriginalText(e.target.value)}
                placeholder={`Write about your real life — in English or in ${languageLabel(
                  lang
                )}.\n\nToday I'm flying back to Miami. I feel calm and a little excited to see my family…`}
                dir="auto"
                className="relative block w-full resize-none bg-transparent font-serif text-[15px] text-stone-800 outline-none placeholder:text-stone-400/80"
                style={{
                  minHeight: 340,
                  lineHeight: "34px",
                  padding: "8px 18px 20px 62px",
                  backgroundImage:
                    "repeating-linear-gradient(to bottom, transparent 0px, transparent 33px, rgba(59,86,120,0.15) 33px, rgba(59,86,120,0.15) 34px)",
                  backgroundAttachment: "local",
                }}
              />
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <Button
                variant="outline"
                onClick={() => draftMutation.mutate()}
                disabled={draftMutation.isPending || !originalText.trim()}
                className="border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                {draftMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Save draft"
                )}
              </Button>
              <Button
                onClick={() => generateMutation.mutate()}
                disabled={!canGenerate}
                className="bg-teal-500 font-semibold text-white hover:bg-teal-400 disabled:opacity-50"
              >
                {generateMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating lesson…
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" /> Generate lesson
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── List ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-6 flex items-center gap-4">
          <Link
            to={createPageUrl("Home")}
            className="text-slate-400 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex-1">
            <h1 className="flex items-center gap-2 text-3xl font-bold text-white">
              <BookOpen className="h-7 w-7 text-teal-400" /> Journal
            </h1>
            <p className="text-sm text-slate-400">
              Write about your real life — Backpack turns it into a lesson you can use.
            </p>
          </div>
          <Button
            onClick={openNew}
            className="bg-teal-500 font-semibold text-white hover:bg-teal-400"
          >
            <Plus className="mr-1.5 h-4 w-4" /> New entry
          </Button>
        </div>

        {lessonEntries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/50 px-6 py-16 text-center">
            <div className="mb-3 text-4xl">📓</div>
            <p className="mb-1 font-medium text-white">No entries yet</p>
            <p className="mb-5 text-sm text-slate-400">
              Write your first journal entry and turn it into a language lesson.
            </p>
            <Button
              onClick={openNew}
              className="bg-teal-500 font-semibold text-white hover:bg-teal-400"
            >
              <Plus className="mr-1.5 h-4 w-4" /> New entry
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {lessonEntries.map((entry: any, i: number) => {
                const badge = statusBadge(entry.status);
                return (
                  <motion.button
                    key={entry.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    onClick={() => openEntry(entry)}
                    className="flex w-full items-center gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-4 text-left transition-colors hover:border-slate-700 hover:bg-slate-800/60"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-white">
                        {entry.title || "Journal entry"}
                      </p>
                      <p className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
                        <Calendar className="h-3 w-3" />
                        {new Date(
                          entry.date || entry.created_date || Date.now()
                        ).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                        {entry.target_language && (
                          <>
                            <span className="text-slate-600">·</span>
                            {languageLabel(entry.target_language)}
                          </>
                        )}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${badge.cls}`}
                    >
                      {badge.label}
                    </span>
                    <span className="shrink-0 text-sm font-medium text-teal-400">
                      Open →
                    </span>
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </div>
        )}

        {backpackSection}
      </div>
    </div>
  );
}
