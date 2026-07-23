"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wand2, Loader2, Volume2, GraduationCap, ArrowUpRight } from "lucide-react";
import { base44 as base44Client } from "@/api/base44Client";
import { toast } from "sonner";
import {
  languageLabel,
  needsTransliteration,
  isRTLLanguage,
} from "@/lib/language";
import { generateLessonAudio } from "@/lib/audio/lessonAudio";
import type { GeneratedLesson } from "@/lib/journal/generateLesson";

// base44 shim entities are built dynamically; cast to any for ergonomic access.
const base44: any = base44Client;

type Mode = "natural" | "advanced" | "grammar";

interface RewriteResult {
  text: string;
  transliteration?: string;
  english?: string;
  note?: string;
  upgrades?: { from: string; to: string; why: string }[];
  points?: { title: string; explanation: string }[];
}

interface JournalCorrectionsProps {
  lesson: GeneratedLesson;
  language: string;
}

const TABS: { mode: Mode; label: string; icon: React.ReactNode }[] = [
  { mode: "natural", label: "More natural", icon: <Wand2 className="h-4 w-4" /> },
  { mode: "advanced", label: "More advanced", icon: <ArrowUpRight className="h-4 w-4" /> },
  { mode: "grammar", label: "Explain grammar", icon: <GraduationCap className="h-4 w-4" /> },
];

// Optional AI coaching on the generated lesson: a more natural rewrite, a more
// advanced-vocabulary rewrite, or a grammar explanation. Each is fetched lazily
// on first open and cached for the session.
export default function JournalCorrections({
  lesson,
  language,
}: JournalCorrectionsProps) {
  const [active, setActive] = useState<Mode | null>(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Partial<Record<Mode, RewriteResult>>>({});

  const langName = languageLabel(language);
  const showTranslit = needsTransliteration(language);
  const rtl = isRTLLanguage(language);
  const targetText = lesson.generatedTargetText;

  const speak = (text: string) => generateLessonAudio({ text, language }).play();

  const fetchResult = async (mode: Mode) => {
    setLoading(true);
    try {
      let prompt = "";
      let schema: any = {};

      if (mode === "natural") {
        prompt = `Here is a ${langName} journal passage:\n"""${targetText}"""\n\nRewrite it so it sounds more natural, like a fluent native speaker journaling. Keep the same meaning and roughly the same length. Return "text" (${langName} native script), ${
          showTranslit ? `"transliteration" (Latin letters), ` : ""
        }"english" (translation), and a short "note" explaining what you improved.`;
        schema = {
          type: "object",
          properties: {
            text: { type: "string" },
            transliteration: { type: "string" },
            english: { type: "string" },
            note: { type: "string" },
          },
          required: ["text"],
        };
      } else if (mode === "advanced") {
        prompt = `Here is a ${langName} journal passage:\n"""${targetText}"""\n\nRewrite it using more advanced, richer vocabulary and expressions a strong intermediate/advanced learner should know, while keeping the meaning. Return "text" (${langName} native script), ${
          showTranslit ? `"transliteration" (Latin letters), ` : ""
        }"english" (translation), and "upgrades": an array of the key word/phrase upgrades, each with "from" (simpler), "to" (more advanced), and "why".`;
        schema = {
          type: "object",
          properties: {
            text: { type: "string" },
            transliteration: { type: "string" },
            english: { type: "string" },
            upgrades: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  from: { type: "string" },
                  to: { type: "string" },
                  why: { type: "string" },
                },
              },
            },
          },
          required: ["text"],
        };
      } else {
        prompt = `Here is a ${langName} journal passage:\n"""${targetText}"""\n\nExplain the key grammar a learner should understand from it, in simple English. Return "points": an array of { "title", "explanation" }, 3-6 items, each tied to something concrete in the passage.`;
        schema = {
          type: "object",
          properties: {
            points: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  explanation: { type: "string" },
                },
              },
            },
          },
          required: ["points"],
        };
      }

      const result = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: schema,
      });
      setResults((prev) => ({ ...prev, [mode]: result }));
    } catch (e) {
      toast.error("Couldn't get AI feedback — please try again.");
      setActive(null);
    } finally {
      setLoading(false);
    }
  };

  const handleTab = (mode: Mode) => {
    if (active === mode) {
      setActive(null);
      return;
    }
    setActive(mode);
    if (!results[mode]) fetchResult(mode);
  };

  const current = active ? results[active] : undefined;

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-slate-400">
        <Wand2 className="h-4 w-4" /> AI Coaching
      </h3>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.mode}
            onClick={() => handleTab(t.mode)}
            className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              active === t.mode
                ? "border-teal-500/40 bg-teal-500/15 text-teal-300"
                : "border-slate-700 text-slate-300 hover:bg-slate-800"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {active && (
          <motion.div
            key={active}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-4">
              {loading && !current ? (
                <div className="flex items-center gap-2 py-4 text-slate-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Thinking…</span>
                </div>
              ) : current ? (
                active === "grammar" ? (
                  <ul className="space-y-2">
                    {(current.points || []).map((p, i) => (
                      <li
                        key={i}
                        className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3"
                      >
                        <p className="text-sm font-semibold text-teal-300">
                          {p.title}
                        </p>
                        <p className="mt-0.5 text-sm text-slate-300">
                          {p.explanation}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                      {showTranslit && current.transliteration && (
                        <p className="text-base font-medium text-teal-300">
                          {current.transliteration}
                        </p>
                      )}
                      <p
                        dir={rtl ? "rtl" : "ltr"}
                        className="mt-1 flex items-start gap-2 text-lg leading-relaxed text-white"
                      >
                        <button
                          onClick={() => speak(current.text)}
                          className="mt-1 shrink-0 rounded-full p-1 text-slate-400 transition-colors hover:bg-teal-500/15 hover:text-teal-300"
                          aria-label="Play"
                          title="Play"
                        >
                          <Volume2 className="h-4 w-4" />
                        </button>
                        <span>{current.text}</span>
                      </p>
                      {current.english && (
                        <p className="mt-1 text-sm text-slate-400">
                          {current.english}
                        </p>
                      )}
                    </div>

                    {current.note && (
                      <p className="text-sm italic text-slate-400">
                        {current.note}
                      </p>
                    )}

                    {current.upgrades && current.upgrades.length > 0 && (
                      <ul className="space-y-1.5">
                        {current.upgrades.map((u, i) => (
                          <li
                            key={i}
                            className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
                          >
                            <span className="text-slate-400">{u.from}</span>
                            <span className="mx-2 text-teal-500">→</span>
                            <span className="font-medium text-teal-300">
                              {u.to}
                            </span>
                            {u.why && (
                              <span className="block text-xs text-slate-500">
                                {u.why}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
