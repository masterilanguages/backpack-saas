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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import JournalLessonView from "@/components/journal/JournalLessonView";
import { generateLesson, type GeneratedLesson } from "@/lib/journal/generateLesson";
import { languageLabel } from "@/lib/language";

// base44 shim entities are built dynamically; TS can't see entity keys. Cast to
// any for ergonomic access — the runtime shape is guaranteed by the shim.
const base44: any = base44Client;

const LANGUAGES = ["hebrew", "spanish", "french", "portuguese", "italian", "english"];
const LEVELS = ["beginner", "intermediate", "advanced"];
const TONES = ["casual", "warm", "professional", "funny", "simple and clear"];
const FOCUSES = [
  "travel",
  "emotions",
  "work",
  "family",
  "dating",
  "friends",
  "hobbies",
  "health",
  "daily routine",
  "spirituality",
  "other",
];

const NONE = "__none__"; // Radix Select can't use an empty-string value.

type Mode = "list" | "compose" | "lesson";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const today = () => new Date().toISOString().split("T")[0];

function statusBadge(status?: string) {
  if (status === "generated" || status === "saved_to_library")
    return { label: "Generated", cls: "bg-teal-500/15 text-teal-300" };
  return { label: "Draft", cls: "bg-slate-800 text-slate-400" };
}

export default function Journal() {
  const queryClient = useQueryClient();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [mode, setMode] = useState<Mode>("list");
  const [selected, setSelected] = useState<any>(null); // entry being viewed/edited

  // Composer form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today());
  const [targetLanguage, setTargetLanguage] = useState("hebrew");
  const [level, setLevel] = useState("beginner");
  const [tone, setTone] = useState("casual");
  const [focus, setFocus] = useState<string>(NONE);
  const [originalText, setOriginalText] = useState("");
  const [langTouched, setLangTouched] = useState(false);

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

  // Default the target language to the learner's language, until they change it.
  useEffect(() => {
    if (userProfile?.language && !langTouched) {
      setTargetLanguage(String(userProfile.language).toLowerCase());
    }
  }, [userProfile?.language, langTouched]);

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

  const resetForm = () => {
    setEditingId(null);
    setTitle("");
    setDate(today());
    setLevel("beginner");
    setTone("casual");
    setFocus(NONE);
    setOriginalText("");
    if (userProfile?.language) setTargetLanguage(String(userProfile.language).toLowerCase());
  };

  const openNew = () => {
    resetForm();
    setMode("compose");
  };

  const openEntry = (entry: any) => {
    if (entry.lesson) {
      setSelected(entry);
      setMode("lesson");
    } else {
      // A draft — reopen it in the composer to generate.
      setEditingId(entry.id);
      setTitle(entry.title || "");
      setDate(entry.date || today());
      setTargetLanguage(String(entry.target_language || "hebrew").toLowerCase());
      setLevel(entry.level || "beginner");
      setTone(entry.tone || "casual");
      setFocus(entry.focus || NONE);
      setOriginalText(entry.text || "");
      setLangTouched(true);
      setMode("compose");
    }
  };

  const buildEntryData = (
    status: "draft" | "generated",
    lesson?: GeneratedLesson
  ) => ({
    title: title.trim() || "Untitled entry",
    date,
    text: originalText,
    original_language: null,
    target_language: targetLanguage,
    level,
    tone,
    focus: focus === NONE ? null : focus,
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
        targetLanguage,
        level,
        tone,
        focus: focus === NONE ? undefined : focus,
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
      resetForm();
      setMode("list");
    },
    onError: () => toast.error("Couldn't save the draft — please try again."),
  });

  const canGenerate = originalText.trim().length >= 10 && !generateMutation.isPending;

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
                {languageLabel(selected.target_language)}
                <span className="text-slate-600">·</span>
                {new Date(selected.date || selected.created_date || Date.now()).toLocaleDateString(
                  "en-US",
                  { month: "short", day: "numeric", year: "numeric" }
                )}
              </p>
            </div>
          </div>

          {selected.lesson ? (
            <JournalLessonView
              lesson={selected.lesson}
              language={String(selected.target_language || "hebrew").toLowerCase()}
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
          <div className="mb-6 flex items-center gap-4">
            <button
              onClick={() => setMode("list")}
              className="text-slate-400 transition-colors hover:text-white"
              aria-label="Back to journal"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
              <PenLine className="h-6 w-6 text-teal-400" /> New Journal Entry
            </h1>
          </div>

          <div className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div>
              <Label className="text-slate-300">Entry title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="A day in Miami"
                className="mt-1.5 border-slate-700 bg-slate-950 text-white placeholder:text-slate-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-slate-300">Date</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1.5 border-slate-700 bg-slate-950 text-white"
                />
              </div>
              <div>
                <Label className="text-slate-300">Target language</Label>
                <Select
                  value={targetLanguage}
                  onValueChange={(v) => {
                    setLangTouched(true);
                    setTargetLanguage(v);
                  }}
                >
                  <SelectTrigger className="mt-1.5 border-slate-700 bg-slate-950 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map((l) => (
                      <SelectItem key={l} value={l}>
                        {languageLabel(l)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-slate-300">Level</Label>
                <Select value={level} onValueChange={setLevel}>
                  <SelectTrigger className="mt-1.5 border-slate-700 bg-slate-950 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEVELS.map((l) => (
                      <SelectItem key={l} value={l}>
                        {cap(l)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-slate-300">Tone</Label>
                <Select value={tone} onValueChange={setTone}>
                  <SelectTrigger className="mt-1.5 border-slate-700 bg-slate-950 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TONES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {cap(t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-slate-300">Focus</Label>
                <Select value={focus} onValueChange={setFocus}>
                  <SelectTrigger className="mt-1.5 border-slate-700 bg-slate-950 text-white">
                    <SelectValue placeholder="Optional" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>None</SelectItem>
                    {FOCUSES.map((f) => (
                      <SelectItem key={f} value={f}>
                        {cap(f)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-slate-300">Your journal entry</Label>
              <p className="mb-1.5 mt-0.5 text-xs text-slate-500">
                Write about your real life — in English or in {languageLabel(targetLanguage)}.
              </p>
              <Textarea
                value={originalText}
                onChange={(e) => setOriginalText(e.target.value)}
                placeholder="Today I'm flying back to Miami. I feel calm and a little excited to see my family…"
                className="min-h-[220px] resize-none border-slate-700 bg-slate-950 text-white placeholder:text-slate-500"
              />
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
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
                    <Sparkles className="mr-2 h-4 w-4" /> Generate Lesson
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
            <Plus className="mr-1.5 h-4 w-4" /> New Entry
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
              <Plus className="mr-1.5 h-4 w-4" /> New Entry
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
                        {entry.title || "Untitled entry"}
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
      </div>
    </div>
  );
}
