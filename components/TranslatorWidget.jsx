"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, ChevronDown, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { languageLabel, usesNikud, isRTLLanguage, isRTLText, nativeScriptInstruction } from "@/lib/language";

export default function TranslatorWidget() {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [inputText, setInputText] = useState("");
  const [translation, setTranslation] = useState(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [learningLanguage, setLearningLanguage] = useState("he");
  const [targetLanguage, setTargetLanguage] = useState("hebrew");
  const [wordAdded, setWordAdded] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [details, setDetails] = useState(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const me = await base44.auth.me();
        if (!me?.email) return;
        const profiles = await base44.entities.UserProfile.filter({ created_by: me.email });
        const lang = profiles[0]?.language;
        if (lang) {
          const langMap = { hebrew: "he", spanish: "es", french: "fr", portuguese: "pt", italian: "it" };
          setLearningLanguage(langMap[lang] || "he");
          setTargetLanguage(lang);
        }
      } catch { /* not signed in / no profile yet */ }
    })();
  }, []);

  const createWordMutation = useMutation({
    mutationFn: (wordData) => base44.entities.Word.create(wordData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wordRatings"] });
      toast.success("Added to backpack! 🎒");
      setWordAdded(true);
    },
  });

  const handleTranslate = async () => {
    if (!inputText.trim()) return;
    setIsTranslating(true);
    setTranslation(null);
    setWordAdded(false);
    setDetails(null);
    setShowDetails(false);

    try {
      const text = inputText.trim();
      const lang = targetLanguage || "hebrew";
      const langLabel = languageLabel(lang);
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `The user typed: "${text}"

This could be a ${langLabel} word (in ${langLabel} script), an English word, or a transliteration of a ${langLabel} word (Latin letters that sound like the ${langLabel} word).

Return JSON with:
- hebrew: ${nativeScriptInstruction(lang)}
- transliteration: phonetic Latin spelling of the ${langLabel} word
- english: English meaning
- example_sentence_hebrew: one short example sentence in ${langLabel}${usesNikud(lang) ? " (Hebrew script with nikud)" : " (native spelling with any accents/diacritics)"}
- example_sentence_transliteration: transliteration of the example sentence
- example_sentence_english: English translation of the example sentence`,
        response_json_schema: {
          type: "object",
          properties: {
            hebrew: { type: "string" },
            transliteration: { type: "string" },
            english: { type: "string" },
            example_sentence_hebrew: { type: "string" },
            example_sentence_transliteration: { type: "string" },
            example_sentence_english: { type: "string" },
          }
        }
      });
      setTranslation({ original: text, result: result });
    } catch (e) {
      toast.error("Translation failed");
    }
    setIsTranslating(false);
  };

  const handleGetDetails = async () => {
    if (!translation) return;
    setIsLoadingDetails(true);
    try {
      const lang = targetLanguage || "hebrew";
      const langLabel = languageLabel(lang);
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Translate and analyze the ${langLabel} word/phrase: "${translation.original}". Return JSON with: hebrew (${nativeScriptInstruction(lang)}), transliteration, english, part_of_speech, example_sentence_hebrew (the example sentence in ${langLabel}), example_sentence_english, notes, is_verb, infinitive.`,
        response_json_schema: {
          type: "object",
          properties: {
            hebrew: { type: "string" },
            transliteration: { type: "string" },
            english: { type: "string" },
            part_of_speech: { type: "string" },
            example_sentence_hebrew: { type: "string" },
            example_sentence_english: { type: "string" },
            notes: { type: "string" },
            is_verb: { type: "boolean" },
            infinitive: { type: "string" },
          }
        }
      });
      setDetails(result);
      setShowDetails(true);
    } catch (e) {
      toast.error("Failed to load details");
    }
    setIsLoadingDetails(false);
  };

  const handleAddToBackpack = async () => {
    if (!translation?.result) return;
    const r = translation.result;
    createWordMutation.mutate({
      word: r.hebrew,
      translation: r.english,
      phonetic: r.transliteration || r.hebrew,
      category: "wordbank",
      times_practiced: 0,
      mastered: false,
      vocab_level: 0,
    });
  };

  return (
    <React.Fragment>
      {!isOpen && (
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsOpen(true)}
          className="fixed bottom-4 left-4 z-50 px-4 py-2 rounded-xl bg-white text-slate-900 shadow-lg flex items-center gap-2 font-bold"
        >
          <Languages className="w-4 h-4" />
          Translate
        </motion.button>
      )}

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-20 left-4 z-50 w-80 bg-slate-950/95 backdrop-blur-xl border border-purple-500/30 rounded-2xl shadow-2xl flex flex-col"
            style={{ maxHeight: "85vh" }}
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-2 flex-shrink-0">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-white">
                <Languages className="w-4 h-4" />
                Translate
              </div>
              <button onClick={() => setIsOpen(false)} className="text-white/60 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-4 pb-4 space-y-3 pt-1">
              <form onSubmit={(e) => { e.preventDefault(); handleTranslate(); }} className="flex gap-2">
                <Input
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Type a word..."
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/40"
                />
                <Button
                  type="submit"
                  disabled={!inputText.trim() || isTranslating}
                  size="sm"
                  className="bg-amber-500 hover:bg-amber-600 flex-shrink-0 text-lg"
                >
                  {isTranslating ? <Loader2 className="w-4 h-4 animate-spin" /> : "🎒"}
                </Button>
              </form>

              {translation && translation.result && (
                <div className="bg-white/10 border border-white/20 rounded-xl p-3 space-y-2">
                  <p className="text-white/50 text-[10px] uppercase mb-0.5">{translation.original}</p>
                  <p className="text-cyan-300 text-xl font-bold" dir={(isRTLLanguage(targetLanguage) || isRTLText(translation.result.hebrew)) ? "rtl" : "ltr"}>{translation.result.hebrew}</p>
                  <p className="text-white/70 text-sm">{translation.original}</p>
                  <p className="text-white font-semibold text-base">{translation.result.english}</p>

                  {translation.result.example_sentence_hebrew && (
                    <div className="mt-2 pt-2 border-t border-white/10 space-y-1">
                      <p className="text-white/40 text-[10px] uppercase">Example</p>
                      <p className="text-emerald-300 text-sm" dir={(isRTLLanguage(targetLanguage) || isRTLText(translation.result.example_sentence_hebrew)) ? "rtl" : "ltr"}>{translation.result.example_sentence_hebrew}</p>
                      <p className="text-white/60 text-xs">{translation.result.example_sentence_transliteration}</p>
                      <p className="text-white/50 text-xs italic">"{translation.result.example_sentence_english}"</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </React.Fragment>
  );
}
