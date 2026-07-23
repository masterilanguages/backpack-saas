"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Check, X, Volume2 } from "lucide-react";
import { base44 as base44Client } from "@/api/base44Client";
import { toast } from "sonner";
import { languageLabel, isRTLText, needsTransliteration } from "@/lib/language";
import { generateLessonAudio } from "@/lib/audio/lessonAudio";
import type { LessonVocab } from "@/lib/journal/generateLesson";

// base44 shim entities are built dynamically; TS can't see entity keys. Cast to
// any for ergonomic access — the runtime shape is guaranteed by the shim.
const base44: any = base44Client;

interface WordInfo {
  translation: string;
  transliteration: string;
  partOfSpeech?: string;
  example?: string;
}

interface JournalWordProps {
  /** The clickable word in the target language (native script, punctuation stripped). */
  word: string;
  /** Target language name (e.g. "hebrew", "spanish"). */
  language: string;
  /** The full sentence the word appears in, for context + saved provenance. */
  sentenceContext: string;
  /** Owning journal entry id, saved on the vocabulary item for provenance. */
  journalEntryId?: string;
  /** Reserved: owning library lesson id (future Library integration). */
  libraryLessonId?: string;
  /** If the word is a known lesson vocab item, its data — skips the AI lookup. */
  vocabHint?: LessonVocab;
}

// Clickable target-language word. On click it opens a small popover with the
// meaning / transliteration / part of speech / example, and a 🎒 button that
// saves the word to the learner's Backpack vocabulary (Word entity, wordbank).
export default function JournalWord({
  word,
  language,
  sentenceContext,
  journalEntryId,
  libraryLessonId,
  vocabHint,
}: JournalWordProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<WordInfo | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [coords, setCoords] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const spanRef = useRef<HTMLSpanElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const rtl = isRTLText(word);
  const showTranslit = needsTransliteration(language);

  const audio = useMemo(
    () => generateLessonAudio({ text: word, language }),
    [word, language]
  );

  const lookup = async () => {
    // Prefer instant data from the lesson's own vocab list.
    if (vocabHint) {
      setInfo({
        translation: vocabHint.translation,
        transliteration: vocabHint.transliteration,
        partOfSpeech: vocabHint.partOfSpeech,
        example: vocabHint.example,
      });
      return;
    }
    if (info) return; // cached from a previous open
    setLoading(true);
    try {
      const langName = languageLabel(language);
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `In this ${langName} sentence: "${sentenceContext}"
the word "${word}" appears. Give its English meaning IN CONTEXT.
Return: "translation" (English meaning), "transliteration" (${
          showTranslit ? "Latin-letter pronunciation" : 'empty string ""'
        }), "partOfSpeech", and a short "example" sentence in ${langName} using the word.`,
        response_json_schema: {
          type: "object",
          properties: {
            translation: { type: "string" },
            transliteration: { type: "string" },
            partOfSpeech: { type: "string" },
            example: { type: "string" },
          },
          required: ["translation"],
        },
      });
      setInfo({
        translation: String(result?.translation || "").trim(),
        transliteration: String(result?.transliteration || "").trim(),
        partOfSpeech: result?.partOfSpeech
          ? String(result.partOfSpeech).trim()
          : undefined,
        example: result?.example ? String(result.example).trim() : undefined,
      });
    } catch (e) {
      toast.error("Couldn't look up that word — try again.");
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const openPopover = () => {
    const rect = spanRef.current?.getBoundingClientRect();
    if (rect) {
      // Clamp horizontally so a 288px-wide card stays on screen.
      const x = Math.min(Math.max(rect.left, 12), window.innerWidth - 300);
      setCoords({ x, y: rect.bottom + 8 });
    }
    setOpen(true);
    lookup();
  };

  const handleSave = async () => {
    if (!info) return;
    setSaving(true);
    try {
      await base44.entities.Word.create({
        word,
        translation: info.translation,
        phonetic: info.transliteration || word,
        category: "wordbank",
        language,
        times_practiced: 1,
        mastered: false,
        // Provenance (columns added in 1000_journal_lessons.sql; harmlessly
        // dropped by the shim if the migration hasn't been applied yet).
        source_journal_entry_id: journalEntryId,
        source_library_lesson_id: libraryLessonId,
        sentence_context: sentenceContext,
        word_status: "saved",
      });
      setSaved(true);
      toast.success("Added to Backpack 🎒");
    } catch (e) {
      toast.error("Couldn't save the word — try again.");
    } finally {
      setSaving(false);
    }
  };

  // Close on outside click, Escape, or scroll/resize (position would go stale).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (
        popRef.current?.contains(e.target as Node) ||
        spanRef.current?.contains(e.target as Node)
      )
        return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onMove = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open]);

  return (
    <>
      <span
        ref={spanRef}
        onClick={openPopover}
        className={`cursor-pointer rounded px-0.5 transition-colors hover:bg-teal-500/25 hover:text-teal-200 ${
          open ? "bg-teal-500/25 text-teal-200" : ""
        }`}
      >
        {word}
      </span>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                ref={popRef}
                initial={{ opacity: 0, y: -4, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.12 }}
                style={{ position: "fixed", left: coords.x, top: coords.y, zIndex: 1000 }}
                className="w-72 rounded-2xl border border-teal-500/30 bg-slate-900 p-4 shadow-2xl"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-lg font-bold text-white"
                      dir={rtl ? "rtl" : "ltr"}
                    >
                      {word}
                    </span>
                    {audio.supported && (
                      <button
                        onClick={() => audio.play()}
                        className="rounded-full p-1 text-slate-400 transition-colors hover:bg-teal-500/15 hover:text-teal-300"
                        aria-label="Hear pronunciation"
                        title="Hear pronunciation"
                      >
                        <Volume2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => setOpen(false)}
                    className="text-slate-500 transition-colors hover:text-white"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {loading ? (
                  <div className="flex items-center gap-2 py-4 text-slate-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Looking it up…</span>
                  </div>
                ) : info ? (
                  <div className="space-y-2">
                    {showTranslit && info.transliteration && (
                      <p className="text-sm text-teal-300">{info.transliteration}</p>
                    )}
                    <p className="text-sm font-medium text-white">
                      {info.translation}
                      {info.partOfSpeech && (
                        <span className="ml-2 text-xs font-normal italic text-slate-400">
                          {info.partOfSpeech}
                        </span>
                      )}
                    </p>
                    {info.example && (
                      <p
                        className="text-xs text-slate-300"
                        dir={isRTLText(info.example) ? "rtl" : "ltr"}
                      >
                        {info.example}
                      </p>
                    )}
                    <p className="border-t border-slate-800 pt-2 text-xs italic text-slate-500">
                      “{sentenceContext}”
                    </p>

                    <button
                      onClick={handleSave}
                      disabled={saving || saved}
                      className={`mt-1 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-all ${
                        saved
                          ? "bg-teal-500/15 text-teal-300"
                          : "bg-teal-500 text-white hover:bg-teal-400 disabled:opacity-60"
                      }`}
                    >
                      {saving ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                        </>
                      ) : saved ? (
                        <>
                          <Check className="h-4 w-4" /> Added to Backpack
                        </>
                      ) : (
                        <>🎒 Add to Backpack</>
                      )}
                    </button>
                    <p className="text-center text-[11px] text-slate-500">
                      {saved
                        ? "Saved with its sentence for context"
                        : "The whole sentence is saved for context too"}
                    </p>
                  </div>
                ) : null}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}
