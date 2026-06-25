"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Eye, EyeOff, Check, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { languageLabel, isRTLLanguage, usesNikud } from "@/lib/language";

export default function PostSessionJournal({ words, onClose }) {
  const queryClient = useQueryClient();
  // Target language comes from the words being practiced (each Word row carries .language).
  const lang = words?.find(w => w.language)?.language || 'hebrew';
  const [sentences, setSentences] = useState({}); // wordId -> { hebrew, transliteration, english }
  const [loading, setLoading] = useState(true);
  const [revealed, setRevealed] = useState({});
  const [userAnswers, setUserAnswers] = useState({});
  const [approved, setApproved] = useState({});
  const [cardIdx, setCardIdx] = useState(0);

  useEffect(() => {
    generateSentences();
  }, []);

  const generateSentences = async () => {
    setLoading(true);
    try {
      const wordList = words.map(w => `"${w.phonetic}" = "${w.translation}"`).join(", ");
      const label = languageLabel(lang);
      const sentenceNote = usesNikud(lang)
        ? `a short Hebrew sentence using the word (Hebrew script with nikud/vowels)`
        : `a short ${label} sentence using the word (correct native spelling, including any accents or diacritics)`;
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Create one simple ${label} sentence for each of these words that uses the word naturally.
Words: ${wordList}

For each word return:
- phonetic: the word's phonetic (exactly as given)
- hebrew: ${sentenceNote}
- transliteration: the sentence in Latin letters
- english: the English translation of the sentence

Keep sentences simple and beginner-friendly (5-8 words).`,
        response_json_schema: {
          type: "object",
          properties: {
            sentences: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  phonetic: { type: "string" },
                  hebrew: { type: "string" },
                  transliteration: { type: "string" },
                  english: { type: "string" }
                }
              }
            }
          }
        }
      });

      const map = {};
      (result.sentences || []).forEach(s => {
        const word = words.find(w => w.phonetic?.toLowerCase() === s.phonetic?.toLowerCase());
        if (word) {
          map[word.id || word.phonetic] = s;
        }
      });
      setSentences(map);
    } catch (e) {
      toast.error("Failed to generate sentences");
    }
    setLoading(false);
  };

  const handleApprove = async (word) => {
    const key = word.id || word.phonetic;
    const sentence = sentences[key];
    if (!sentence || !word.id) return;
    try {
      const existing = await base44.entities.Word.filter({ id: word.id });
      const wordData = existing[0];
      const saved = wordData?.saved_sentences || [];
      await base44.entities.Word.update(word.id, {
        saved_sentences: [...saved, {
          hebrew: sentence.hebrew,
          transliteration: sentence.transliteration,
          english: sentence.english
        }]
      });
      setApproved(prev => ({ ...prev, [key]: true }));
      queryClient.invalidateQueries({ queryKey: ['wordRatings'] });
      toast.success("Sentence saved! ✅");
    } catch (e) {
      console.error("Failed to save sentence", e);
      toast.error("Could not save sentence");
    }
  };

  const currentWord = words[cardIdx];
  const currentKey = currentWord ? (currentWord.id || currentWord.phonetic) : null;
  const currentSentence = currentKey ? sentences[currentKey] : null;

  const goNext = () => {
    if (cardIdx + 1 >= words.length) {
      onClose();
    } else {
      setCardIdx(i => i + 1);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex flex-col items-center justify-center px-4 py-6 overflow-y-auto"
      style={{ background: 'linear-gradient(160deg, #f0ece4 0%, #e8e4d8 100%)' }}>

      {loading ? (
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-10 h-10 text-purple-400 animate-spin" />
          <p className="text-stone-500 text-sm">Generating sentences for each word...</p>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={cardIdx}
            initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -60 }}
            className="w-full max-w-sm flex flex-col gap-4"
          >
            {/* Progress */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-stone-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-400 rounded-full transition-all"
                  style={{ width: `${((cardIdx + 1) / words.length) * 100}%` }}
                />
              </div>
              <span className="text-stone-400 text-xs">{cardIdx + 1} / {words.length}</span>
            </div>

            {/* Header */}
            <div className="text-center">
              <p className="text-stone-400 text-xs uppercase tracking-wide mb-1">Translate to English</p>
              <p className="text-cyan-500 font-bold text-xl">{currentWord?.phonetic}</p>
              <p className="text-stone-400 text-sm">= {currentWord?.translation}</p>
            </div>

            {/* Card */}
            <div className="bg-white rounded-3xl border border-stone-200 shadow-lg overflow-hidden">
              {/* Hebrew sentence */}
              <div className="p-6 text-center bg-stone-50 border-b border-stone-100">
                {currentSentence ? (
                  <>
                    <p className="text-2xl font-bold text-stone-800 leading-relaxed" dir={isRTLLanguage(lang) ? "rtl" : "ltr"} style={{ fontFamily: 'serif' }}>
                      {currentSentence.hebrew}
                    </p>
                    <p className="text-stone-400 text-sm mt-2 italic">{currentSentence.transliteration}</p>
                  </>
                ) : (
                  <p className="text-stone-300 text-sm">No sentence available</p>
                )}
              </div>

              {/* User answer input */}
              <div className="p-4 space-y-3">
                <input
                  value={userAnswers[currentKey] || ""}
                  onChange={e => setUserAnswers(prev => ({ ...prev, [currentKey]: e.target.value }))}
                  placeholder="Type the English translation..."
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 text-stone-700 text-sm outline-none focus:border-purple-300"
                />

                {/* Reveal answer */}
                <button
                  onClick={() => setRevealed(prev => ({ ...prev, [currentKey]: !prev[currentKey] }))}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-medium text-stone-400 hover:text-stone-600 transition-all"
                >
                  {revealed[currentKey] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  {revealed[currentKey] ? "Hide answer" : "Show answer"}
                </button>

                <AnimatePresence>
                  {revealed[currentKey] && currentSentence && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-center"
                    >
                      <p className="text-green-700 font-semibold text-sm">{currentSentence.english}</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Approve sentence */}
                {currentSentence && currentWord?.id && (
                  <button
                    onClick={() => handleApprove(currentWord)}
                    disabled={approved[currentKey]}
                    className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold transition-all border ${
                      approved[currentKey]
                        ? 'bg-green-100 border-green-200 text-green-600'
                        : 'bg-white border-stone-200 text-stone-400 hover:border-green-300 hover:text-green-500'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" />
                    {approved[currentKey] ? "Sentence saved!" : "Approve & save sentence"}
                  </button>
                )}
              </div>
            </div>

            {/* Next */}
            <button
              onClick={goNext}
              className="w-full py-4 rounded-2xl text-white font-bold text-base flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)' }}
            >
              {cardIdx + 1 >= words.length ? "Finish" : "Next word"}
              <ChevronRight className="w-5 h-5" />
            </button>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}