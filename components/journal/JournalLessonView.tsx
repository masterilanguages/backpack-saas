"use client";

import React, { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Volume2, MessageCircle, Sparkles, BookMarked } from "lucide-react";
import JournalWord from "@/components/journal/JournalWord";
import JournalCorrections from "@/components/journal/JournalCorrections";
import {
  generateLessonAudio,
  type LessonAudioPlayer,
} from "@/lib/audio/lessonAudio";
import { isRTLLanguage, needsTransliteration } from "@/lib/language";
import type { GeneratedLesson, LessonVocab } from "@/lib/journal/generateLesson";

interface JournalLessonViewProps {
  lesson: GeneratedLesson;
  language: string;
  journalEntryId?: string;
  libraryLessonId?: string;
}

// A small pill toggle used for the Hide English / Hide transliteration options.
function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
        active
          ? "border-teal-500/40 bg-teal-500/15 text-teal-300"
          : "border-slate-700 text-slate-500 hover:bg-slate-800"
      }`}
    >
      {active ? "✓ " : ""}
      {children}
    </button>
  );
}

// Splits a target-language sentence into clickable word tokens. Word runs (any
// letters, including Hebrew, plus intra-word ' and -) become JournalWord; the
// gaps (spaces, punctuation) render as plain text.
function ClickableSentence({
  text,
  language,
  vocabByWord,
  journalEntryId,
  libraryLessonId,
}: {
  text: string;
  language: string;
  vocabByWord: Map<string, LessonVocab>;
  journalEntryId?: string;
  libraryLessonId?: string;
}) {
  const tokens = useMemo(() => text.split(/([\p{L}\p{M}'’\-]+)/gu), [text]);
  return (
    <>
      {tokens.map((tok, i) => {
        const isWord = /[\p{L}\p{M}]/u.test(tok);
        if (!isWord) return <React.Fragment key={i}>{tok}</React.Fragment>;
        return (
          <JournalWord
            key={i}
            word={tok}
            language={language}
            sentenceContext={text}
            journalEntryId={journalEntryId}
            libraryLessonId={libraryLessonId}
            vocabHint={vocabByWord.get(tok.toLowerCase())}
          />
        );
      })}
    </>
  );
}

export default function JournalLessonView({
  lesson,
  language,
  journalEntryId,
  libraryLessonId,
}: JournalLessonViewProps) {
  const rtl = isRTLLanguage(language);
  const showTranslit = needsTransliteration(language);
  const playerRef = useRef<LessonAudioPlayer | null>(null);

  // Display toggles. Transliteration only matters for non-Latin scripts.
  const [showEnglish, setShowEnglish] = useState(true);
  const [showTransliteration, setShowTransliteration] = useState(true);
  const targetOnly = !showEnglish && (!showTranslit || !showTransliteration);

  // Instant-lookup map: target word (lowercased) -> its vocab entry.
  const vocabByWord = useMemo(() => {
    const m = new Map<string, LessonVocab>();
    for (const v of lesson.vocab) {
      if (v.word) m.set(v.word.toLowerCase(), v);
    }
    return m;
  }, [lesson.vocab]);

  const audioSupported = useMemo(
    () =>
      generateLessonAudio({ text: lesson.generatedTargetText, language })
        .supported,
    [lesson.generatedTargetText, language]
  );

  const speak = (text: string) => {
    playerRef.current?.stop();
    const player = generateLessonAudio({ text, language });
    playerRef.current = player;
    player.play();
  };

  return (
    <div className="space-y-6">
      {/* Lesson header + play all */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-teal-400">
          <Sparkles className="h-4 w-4" /> Your Lesson
        </h2>
        {audioSupported && (
          <button
            onClick={() => speak(lesson.generatedTargetText)}
            className="flex items-center gap-2 rounded-full bg-teal-500/15 px-4 py-1.5 text-xs font-semibold text-teal-300 transition-colors hover:bg-teal-500/25"
          >
            <Volume2 className="h-3.5 w-3.5" /> Play all
          </button>
        )}
      </div>

      {/* Display toggles */}
      <div className="flex flex-wrap items-center gap-2">
        <Toggle active={showEnglish} onClick={() => setShowEnglish((v) => !v)}>
          English
        </Toggle>
        {showTranslit && (
          <Toggle
            active={showTransliteration}
            onClick={() => setShowTransliteration((v) => !v)}
          >
            Transliteration
          </Toggle>
        )}
        <button
          onClick={() => {
            setShowEnglish(false);
            setShowTransliteration(false);
          }}
          className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
            targetOnly
              ? "border-teal-500/40 bg-teal-500/15 text-teal-300"
              : "border-slate-700 text-slate-400 hover:bg-slate-800"
          }`}
        >
          Target only
        </button>
      </div>

      {/* Sentence groups */}
      <div className="space-y-3">
        {lesson.sentences.map((s, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className="group relative rounded-2xl border border-slate-800 bg-slate-900 p-4 pr-12"
          >
            {audioSupported && (
              <button
                onClick={() => speak(s.target)}
                className="absolute right-3 top-3 rounded-full p-2 text-slate-500 transition-colors hover:bg-teal-500/15 hover:text-teal-300"
                aria-label="Play sentence"
                title="Play sentence"
              >
                <Volume2 className="h-4 w-4" />
              </button>
            )}

            {/* Display order per language:
                Hebrew  -> transliteration, English, native script
                Latin   -> native (target), English  */}
            {showTranslit ? (
              <>
                {showTransliteration && s.transliteration && (
                  <p className="text-base font-medium text-teal-300">
                    {s.transliteration}
                  </p>
                )}
                {showEnglish && (
                  <p className="mt-0.5 text-sm text-slate-400">{s.english}</p>
                )}
                <p
                  dir={rtl ? "rtl" : "ltr"}
                  className="mt-1.5 text-xl leading-relaxed text-white"
                >
                  <ClickableSentence
                    text={s.target}
                    language={language}
                    vocabByWord={vocabByWord}
                    journalEntryId={journalEntryId}
                    libraryLessonId={libraryLessonId}
                  />
                </p>
              </>
            ) : (
              <>
                <p
                  dir={rtl ? "rtl" : "ltr"}
                  className="text-xl leading-relaxed text-white"
                >
                  <ClickableSentence
                    text={s.target}
                    language={language}
                    vocabByWord={vocabByWord}
                    journalEntryId={journalEntryId}
                    libraryLessonId={libraryLessonId}
                  />
                </p>
                {showEnglish && (
                  <p className="mt-1 text-sm text-slate-400">{s.english}</p>
                )}
              </>
            )}
          </motion.div>
        ))}
      </div>

      {/* Key vocabulary */}
      {lesson.vocab.length > 0 && (
        <section>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-slate-400">
            <BookMarked className="h-4 w-4" /> Key Vocabulary
          </h3>
          <div className="flex flex-wrap gap-2">
            {lesson.vocab.map((v, i) => (
              <div
                key={i}
                className="flex flex-col items-start rounded-2xl border border-slate-800 bg-slate-900 px-3 py-2"
              >
                <span className="text-base font-semibold text-white">
                  {/* Reuse the clickable-word popover (instant data via hint). */}
                  <JournalWord
                    word={v.word}
                    language={language}
                    sentenceContext={v.example || v.word}
                    journalEntryId={journalEntryId}
                    libraryLessonId={libraryLessonId}
                    vocabHint={v}
                  />
                </span>
                {showTranslit && v.transliteration && (
                  <span className="text-xs text-teal-300">
                    {v.transliteration}
                  </span>
                )}
                <span className="text-xs text-slate-400">{v.translation}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Tap any word to see its meaning and add it to your Backpack 🎒
          </p>
        </section>
      )}

      {/* Speaking prompts */}
      {lesson.speakingPrompts.length > 0 && (
        <section>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-slate-400">
            <MessageCircle className="h-4 w-4" /> Keep Talking
          </h3>
          <ul className="space-y-2">
            {lesson.speakingPrompts.map((p, i) => (
              <li
                key={i}
                className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-2.5 text-sm text-slate-200"
              >
                {p}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Mnemonic hooks */}
      {lesson.mnemonics.length > 0 && (
        <section>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-widest text-slate-400">
            <Sparkles className="h-4 w-4" /> Memory Hooks
          </h3>
          <ul className="space-y-2">
            {lesson.mnemonics.map((m, i) => (
              <li
                key={i}
                className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-2.5 text-sm text-slate-200"
              >
                <span className="font-semibold text-teal-300">{m.word}</span>
                <span className="mx-2 text-slate-600">—</span>
                {m.hook}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Optional AI corrections */}
      <JournalCorrections lesson={lesson} language={language} />
    </div>
  );
}
