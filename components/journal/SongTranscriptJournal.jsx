"use client";

import React, { useState, useEffect } from "react";
import { base44 as base44Client } from "@/api/base44Client";

// base44Client is a JS shim whose entities/integrations are built dynamically,
// so we use it directly here (this is a .jsx file, no TS narrowing needed).
const base44 = base44Client;
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, ChevronRight, Eye, CheckCircle, RefreshCw, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { languageLabel, isRTLLanguage, usesNikud } from "@/lib/language";

/**
 * SongTranscriptJournal
 * Props:
 *   transcript: array of { transliteration, english, hebrew }
 *   songTitle: string
 *   userProfile: object
 *   onComplete: fn()
 */
export default function SongTranscriptJournal({ transcript = [], songTitle = "", userProfile, onComplete }) {
  const [questions, setQuestions] = useState([]); // [{question, hebrewAnswer, words, userInput, revealed, done}]
  const [generating, setGenerating] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [wordRevealCount, setWordRevealCount] = useState({}); // questionIdx -> number of words revealed

  const lang = userProfile?.language || "hebrew";

  // Generate personalized questions from the transcript
  useEffect(() => {
    if (!transcript?.length || questions.length > 0) return;
    generateQuestions();
  }, [transcript]);

  const generateQuestions = async () => {
    if (!transcript?.length) return;
    setGenerating(true);
    try {
      // Build a readable transcript summary
      const lines = transcript
        .filter(s => s.transliteration || s.english)
        .map(s => `- "${s.transliteration || s.english}" (${s.english || ""})`)
        .join("\n");

      const label = languageLabel(lang);
      const scriptNote = usesNikud(lang)
        ? "in Hebrew script with full nikud / vowel points"
        : `in ${label} (correct native spelling, including any accents or diacritics)`;
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `You are a warm ${label} language teacher helping a student reflect on a song they just heard.

Song: "${songTitle}"
Transcript lines:
${lines}

Create 4 personalized conversational questions about this song's content. Each question should:
- Be asked in ENGLISH (friendly, personal tone e.g. "What do you think the singer feels when they say...?")
- Have a ${label} answer sentence (${scriptNote}) that directly relates to the song lyrics
- Include the transliteration of that ${label} answer
- Include the English meaning of that answer
- Be grounded in specific lines from the transcript

Return JSON with a "questions" array. Each item has:
  - question: string (English question)
  - hebrew_answer: string (the answer sentence ${scriptNote})
  - transliteration: string (phonetic of the answer)
  - english_meaning: string (English meaning of the answer)`,
        response_json_schema: {
          type: "object",
          properties: {
            questions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  question: { type: "string" },
                  hebrew_answer: { type: "string" },
                  transliteration: { type: "string" },
                  english_meaning: { type: "string" }
                }
              }
            }
          }
        }
      });

      const qs = (result.questions || []).map(q => ({
        question: q.question,
        hebrewAnswer: q.hebrew_answer,
        transliteration: q.transliteration,
        englishMeaning: q.english_meaning,
        words: (q.hebrew_answer || "").split(/\s+/).filter(Boolean),
        userInput: "",
        revealed: false,
        done: false,
      }));
      setQuestions(qs);
    } catch (e) {
      toast.error("Could not generate questions");
    }
    setGenerating(false);
  };

  const currentQ = questions[currentIdx];

  const revealedCount = wordRevealCount[currentIdx] || 0;

  const revealNextWord = () => {
    if (!currentQ) return;
    const max = currentQ.words.length;
    setWordRevealCount(prev => ({
      ...prev,
      [currentIdx]: Math.min((prev[currentIdx] || 0) + 1, max)
    }));
  };

  const revealAll = () => {
    if (!currentQ) return;
    setWordRevealCount(prev => ({ ...prev, [currentIdx]: currentQ.words.length }));
    setQuestions(prev => prev.map((q, i) => i === currentIdx ? { ...q, revealed: true } : q));
  };

  const markDone = () => {
    setQuestions(prev => prev.map((q, i) => i === currentIdx ? { ...q, done: true } : q));
    if (currentIdx < questions.length - 1) {
      setCurrentIdx(i => i + 1);
    } else {
      onComplete?.();
    }
  };

  const updateInput = (val) => {
    setQuestions(prev => prev.map((q, i) => i === currentIdx ? { ...q, userInput: val } : q));
  };

  if (generating) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#9b7e5a" }} />
        <p className="text-sm" style={{ color: "#9b7e5a", fontFamily: "Jost, sans-serif" }}>
          Reading the lyrics and crafting questions for you...
        </p>
      </div>
    );
  }

  if (!questions.length) {
    return (
      <div className="text-center py-8">
        <p className="text-sm mb-3" style={{ color: "#9b7e5a" }}>No transcript available for questions.</p>
        <button
          onClick={generateQuestions}
          className="text-xs px-3 py-1.5 rounded-full flex items-center gap-1 mx-auto"
          style={{ background: "rgba(90,107,90,0.12)", color: "#5a6b5a", border: "1px solid rgba(90,107,90,0.3)" }}
        >
          <RefreshCw className="w-3 h-3" /> Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Progress dots */}
      <div className="flex items-center justify-center gap-2">
        {questions.map((q, i) => (
          <button
            key={i}
            onClick={() => setCurrentIdx(i)}
            className={`w-2.5 h-2.5 rounded-full transition-all ${
              i === currentIdx ? "scale-125" : ""
            }`}
            style={{
              background: q.done ? "#5a9a5a" : i === currentIdx ? "#9b7e5a" : "rgba(200,180,140,0.4)"
            }}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        {currentQ && (
          <motion.div
            key={currentIdx}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            className="rounded-2xl p-5 space-y-4"
            style={{ background: "rgba(255,252,240,0.9)", border: "1px solid rgba(200,180,140,0.5)" }}
          >
            {/* Question */}
            <div className="flex items-start gap-2">
              <MessageCircle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "#9b7e5a" }} />
              <p className="text-base font-medium" style={{ color: "#3d4a2e", fontFamily: "Georgia, serif", lineHeight: "1.6" }}>
                {currentQ.question}
              </p>
            </div>

            {/* User input */}
            <div>
              <p className="text-xs mb-1.5 font-semibold tracking-wide uppercase" style={{ color: "#9b7e5a", fontFamily: "Jost, sans-serif" }}>
                Your answer in {languageLabel(lang)}
              </p>
              <textarea
                value={currentQ.userInput}
                onChange={e => updateInput(e.target.value)}
                placeholder={isRTLLanguage(lang) ? "כתוב כאן..." : "Write here..."}
                dir={isRTLLanguage(lang) ? "rtl" : "ltr"}
                rows={2}
                className="w-full px-3 py-2 rounded-xl text-sm outline-none resize-none"
                style={{
                  background: "rgba(255,255,255,0.7)",
                  border: "1px solid rgba(200,180,140,0.6)",
                  fontFamily: "Georgia, serif",
                  color: "#2d3a1e",
                  lineHeight: "1.8"
                }}
              />
            </div>

            {/* Hint: word by word reveal */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold tracking-wide uppercase" style={{ color: "#9b7e5a", fontFamily: "Jost, sans-serif" }}>
                  💡 {languageLabel(lang)} answer — reveal word by word
                </p>
                <button
                  onClick={revealAll}
                  className="text-xs flex items-center gap-1 px-2 py-0.5 rounded-full transition-all"
                  style={{ color: "#9b7e5a", background: "rgba(200,180,140,0.2)" }}
                >
                  <Eye className="w-3 h-3" /> Show all
                </button>
              </div>

              {/* Word reveal tiles */}
              <div className="flex flex-wrap gap-2 justify-center" dir={isRTLLanguage(lang) ? "rtl" : "ltr"}>
                {currentQ.words.map((word, wi) => {
                  const shown = wi < revealedCount;
                  return (
                    <motion.div
                      key={wi}
                      animate={{ opacity: shown ? 1 : 0.3 }}
                      className="flex flex-col items-center px-3 py-1.5 rounded-xl min-w-[48px]"
                      style={{
                        background: shown ? "rgba(90,107,90,0.12)" : "rgba(200,180,140,0.15)",
                        border: shown ? "1px solid rgba(90,107,90,0.3)" : "1px solid rgba(200,180,140,0.3)",
                      }}
                    >
                      <span className="text-sm font-bold" style={{ color: shown ? "#3d4a2e" : "transparent", textShadow: shown ? "none" : "0 0 8px rgba(0,0,0,0.15)" }}>
                        {shown ? word : "◆"}
                      </span>
                    </motion.div>
                  );
                })}
              </div>

              {/* Transliteration — shown after all revealed */}
              <AnimatePresence>
                {revealedCount >= currentQ.words.length && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="mt-3 rounded-xl px-4 py-2.5 text-center"
                    style={{ background: "rgba(90,107,90,0.07)", border: "1px solid rgba(90,107,90,0.2)" }}
                  >
                    <p className="text-sm font-medium" style={{ color: "#5a6b5a", fontFamily: "Georgia, serif" }}>
                      {currentQ.transliteration}
                    </p>
                    <p className="text-xs mt-0.5 italic" style={{ color: "#9b7e5a" }}>
                      "{currentQ.englishMeaning}"
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Reveal next word button */}
              {revealedCount < currentQ.words.length && (
                <div className="mt-3 flex justify-center">
                  <button
                    onClick={revealNextWord}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
                    style={{ background: "rgba(155,126,90,0.15)", color: "#6b4e2a", border: "1px solid rgba(155,126,90,0.35)" }}
                  >
                    Reveal next word <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Next / Done */}
            <div className="flex justify-end pt-1">
              <button
                onClick={markDone}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all"
                style={{ background: "#5a6b5a", color: "white", fontFamily: "Jost, sans-serif" }}
              >
                {currentIdx < questions.length - 1 ? (
                  <><CheckCircle className="w-4 h-4" /> Got it — next question</>
                ) : (
                  <><CheckCircle className="w-4 h-4" /> Complete journal</>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
