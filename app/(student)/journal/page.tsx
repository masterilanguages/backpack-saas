"use client";

import React, { useState, useEffect, useMemo, Suspense, lazy } from "react";
import { base44 as base44Client } from "@/api/base44Client";

// base44Client is a JS shim whose `entities`/`integrations` are built dynamically
// in a loop, so TS can't see entity keys like `JournalEntry`. Cast to `any` for
// ergonomic access — the runtime shape is guaranteed by the shim.
const base44: any = base44Client;
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Link, createPageUrl } from "@/lib/router-compat";
import { ArrowLeft, BookOpen, Loader2, CheckCircle, X, Languages, Music } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import SongTranscriptJournal from "@/components/journal/SongTranscriptJournal";
import { isRTLLanguage } from "@/lib/language";

const SignaturePad = lazy(() => import("@/components/journal/SignaturePad"));

const languageNames: Record<string, string> = {
  hebrew: 'Hebrew', english: 'English', spanish: 'Spanish',
  french: 'French', portuguese: 'Portuguese', italian: 'Italian'
};

export default function Journal() {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [aiQuestion, setAiQuestion] = useState("");
  const [questionsAsked, setQuestionsAsked] = useState<string[]>([]);
  const [generatingQuestion, setGeneratingQuestion] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [usedWords, setUsedWords] = useState<any[]>([]);
  const [isPublic, setIsPublic] = useState(false);
  const [showPublicFeed, setShowPublicFeed] = useState(false);
  const [signature, setSignature] = useState("");
  const [wordTranslation, setWordTranslation] = useState<any>(null);
  const [translationPosition, setTranslationPosition] = useState({ x: 0, y: 0 });
  const [translatingWord, setTranslatingWord] = useState(false);
  const [translatingEntry, setTranslatingEntry] = useState(false);
  const [translatedText, setTranslatedText] = useState("");
  const [showTranslated, setShowTranslated] = useState(false);
  const [exercises, setExercises] = useState<any[]>([]); // [{english, answer, userInput, revealed}]
  const [generatingExercises, setGeneratingExercises] = useState(false);
  const [showPhonetics, setShowPhonetics] = useState(false);
  const [journalMode, setJournalMode] = useState("free"); // "free" | "song"
  const [songJournalDone, setSongJournalDone] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  const { data: userProfile } = useQuery({
    queryKey: ['userProfile', currentUser?.email],
    queryFn: async () => {
      const profiles = await base44.entities.UserProfile.filter({ created_by: currentUser.email });
      return profiles[0] || null;
    },
    enabled: !!currentUser?.email,
  });

  const { data: entries = [] } = useQuery({
    queryKey: ['journalEntries'],
    queryFn: () => base44.entities.JournalEntry.list('-date')
  });

  // Fetch latest 10 words from flashcards (wordbank), sorted by newest first
  const { data: backpackWords = [] } = useQuery({
    queryKey: ['backpackWords', userProfile?.language, currentUser?.email],
    queryFn: async () => {
      const allWords = await base44.entities.Word.filter({ category: "wordbank", created_by: currentUser.email });
      const userLang = userProfile?.language || 'hebrew';
      // Only show words matching current language
      return allWords.filter((w: any) => !w.language || w.language === userLang);
    },
    enabled: !!userProfile && !!currentUser?.email,
  });

  const { data: publicEntries = [] } = useQuery({
    queryKey: ['publicJournalEntries'],
    queryFn: async () => base44.entities.JournalEntry.filter({ is_public: true }, '-date', 10),
    staleTime: 60000,
  });

  // Fetch latest media item with a transcript for the song journal
  const { data: latestMedia } = useQuery({
    queryKey: ['latestMediaWithTranscript'],
    queryFn: async () => {
      const allMedia = await base44.entities.MediaLibrary.list('-created_date', 20);
      return allMedia.find((m: any) => m.processed_transcript?.length > 0) || null;
    },
    staleTime: 5 * 60 * 1000,
  });

  const todayEntry = useMemo(() => entries.find((e: any) => e.date === today), [entries, today]);

  // Get 10 most recently ADDED words to the backpack/flashcards
  const suggestedVocab = useMemo(() =>
    [...backpackWords]
      .sort((a: any, b: any) => new Date(b.created_date).getTime() - new Date(a.created_date).getTime())
      .slice(0, 10),
    [backpackWords]
  );

  const createEntryMutation = useMutation({
    mutationFn: (entry: any) => base44.entities.JournalEntry.create(entry),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
      queryClient.invalidateQueries({ queryKey: ['publicJournalEntries'] });
      setShowFeedback(true);
      toast.success("Journal entry saved! 📖");
    },
    onError: (e: any) => {
      console.error("Journal save failed", e);
      toast.error("Could not save your journal entry — please try again.");
    }
  });

  const updateEntryMutation = useMutation({
    mutationFn: ({ id, data }: { id: any; data: any }) => base44.entities.JournalEntry.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
      queryClient.invalidateQueries({ queryKey: ['publicJournalEntries'] });
      toast.success("Entry updated! ✓");
    },
    onError: (e: any) => {
      console.error("Journal update failed", e);
      toast.error("Could not save your journal entry — please try again.");
    }
  });

  // Load today's entry if exists
  useEffect(() => {
    if (todayEntry) {
      setText(todayEntry.text || "");
      setQuestionsAsked(todayEntry.ai_questions_asked || []);
      setUsedWords(todayEntry.used_vocab_ids || []);
      setIsPublic(todayEntry.is_public || false);
      setSignature(todayEntry.signature_data || "");
    }
  }, [todayEntry]);

  // Check which vocab words are used
  useEffect(() => {
    const timer = setTimeout(() => {
      const textLower = text.toLowerCase();
      const textWords = new Set(textLower.split(/\s+/).filter(w => w.length > 0));
      const found = suggestedVocab
        .filter((v: any) => {
          if (v.word && textWords.has(v.word.toLowerCase())) return true;
          if (v.phonetic && textWords.has(v.phonetic.toLowerCase())) return true;
          if (v.translation && textWords.has(v.translation.toLowerCase())) return true;
          return false;
        })
        .map((v: any) => v.id);
      setUsedWords(found);
    }, 300);
    return () => clearTimeout(timer);
  }, [text, suggestedVocab]);

  const generateQuestion = async () => {
    if (!text.trim()) return;
    setGeneratingQuestion(true);
    try {
      const sentences = text.split(/[.!?]+/).filter(s => s.trim());
      const lastSentence = sentences[sentences.length - 1]?.trim() || text.trim();
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `The user just wrote: "${lastSentence}"\nFull entry: "${text}"\nPrevious questions: ${questionsAsked.join(", ") || "none"}\nGenerate ONE simple follow-up question about their last sentence. Ask in English. Keep it short. Return just the question.`,
        response_json_schema: { type: "object", properties: { question: { type: "string" } } }
      });
      setAiQuestion(result.question);
      setQuestionsAsked([...questionsAsked, result.question]);
    } catch (e) {
      toast.error("Failed to generate question");
    }
    setGeneratingQuestion(false);
  };

  useEffect(() => {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim());
    if (sentences.length > 0 && text.length > 100 && !aiQuestion && !generatingQuestion) {
      const timer = setTimeout(() => generateQuestion(), 3000);
      return () => clearTimeout(timer);
    }
  }, [text]);

  // Auto-generate exercises when vocab words are ready
  useEffect(() => {
    if (suggestedVocab.length > 0 && exercises.length === 0 && !generatingExercises) {
      generateExercises();
    }
  }, [suggestedVocab.length]);

  // Translate the full entry to learning language
  const handleTranslateEntry = async () => {
    if (!text.trim()) return;
    const lang = userProfile?.language || 'hebrew';
    const langName = languageNames[lang] || lang;
    setTranslatingEntry(true);
    setShowTranslated(false);
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Translate the following English text to ${langName}. Keep it natural and conversational. Return only the translation:\n\n"${text}"`
      });
      setTranslatedText(result);
      setShowTranslated(true);
    } catch (e) {
      toast.error("Translation failed");
    }
    setTranslatingEntry(false);
  };

  const wordCount = text.trim().split(/\s+/).filter(w => w.length > 0).length;

  const handleSave = () => {
    if (!text.trim()) { toast.error("Please write something"); return; }
    if (wordCount < 100) { toast.error(`Write at least 100 words! (${wordCount}/100)`); return; }
    if (usedWords.length < Math.min(10, suggestedVocab.length)) {
      toast.error(`Use more vocab words before saving! (${usedWords.length}/${Math.min(10, suggestedVocab.length)} used)`);
      return;
    }

    const entryData = {
      date: today,
      text,
      used_vocab_ids: usedWords,
      suggested_vocab_ids: suggestedVocab.map((v: any) => v.id),
      ai_questions_asked: questionsAsked,
      last_edited_at: new Date().toISOString(),
      is_public: isPublic,
      author_name: userProfile?.avatar_name || "Anonymous",
      signature_data: signature,
    };

    if (todayEntry) {
      updateEntryMutation.mutate({ id: todayEntry.id, data: entryData });
    } else {
      createEntryMutation.mutate(entryData);
    }
  };

  const allWordsUsed = usedWords.length >= Math.min(10, suggestedVocab.length) && wordCount >= 100;

  const getWordAtPosition = (text: string, position: number) => {
    const before = text.slice(0, position);
    const after = text.slice(position);
    const wordBefore = before.match(/[֐-׿\w]+$/)?.[0] || "";
    const wordAfter = after.match(/^[֐-׿\w]+/)?.[0] || "";
    return wordBefore + wordAfter;
  };

  const handleTextClick = async (e: any) => {
    const textarea = e.target;
    const cursorPos = textarea.selectionStart;
    const clickedWord = getWordAtPosition(text, cursorPos);
    if (!clickedWord || clickedWord.length < 2) return;
    const rect = textarea.getBoundingClientRect();
    const textBeforeCursor = text.slice(0, cursorPos);
    const lines = textBeforeCursor.split('\n');
    const currentLine = lines.length - 1;
    const lineHeight = 28.8;
    const y = rect.top + (currentLine * lineHeight) + 40;
    const x = rect.left + 100;
    setTranslationPosition({ x, y });
    setTranslatingWord(true);
    try {
      const userLang = userProfile?.language || 'hebrew';
      const langName = languageNames[userLang];

      // Always get transliteration (phonetic form) first
      let transliterResult = clickedWord;
      if (userLang === 'hebrew') {
        const translit = await base44.integrations.Core.InvokeLLM({
          prompt: `Provide the transliteration (Latin phonetic spelling) of this Hebrew word: "${clickedWord}". Return only the transliteration.`
        });
        transliterResult = translit;
      }

      // Get translation to target language
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Translate this word to ${langName}: "${clickedWord}". Return only the translation.`
      });

      setWordTranslation({
        word: clickedWord,
        transliteration: transliterResult,
        translation: result,
        language: userLang
      });
    } catch (e) {
      toast.error("Translation failed");
    } finally {
      setTranslatingWord(false);
    }
  };

  const langName = languageNames[userProfile?.language] || 'target language';

  const generateExercises = async () => {
    if (!suggestedVocab.length) return;
    setGeneratingExercises(true);
    try {
      const lang = userProfile?.language || 'hebrew';
      const langNameFull = languageNames[lang] || lang;
      const wordList = suggestedVocab.slice(0, 10).map((w: any) => `${w.phonetic || w.word} (${w.translation})`).join(', ');
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Create one simple English sentence for each of these ${langNameFull} vocabulary words. The sentence should clearly illustrate the word's meaning. For each, also provide the ${langNameFull} translation of the full sentence.

Words: ${wordList}

Return JSON with an array "exercises" where each item has: word (the vocab word in ${langNameFull}), english (the English sentence), answer (the ${langNameFull} translation of the sentence).`,
        response_json_schema: {
          type: 'object',
          properties: {
            exercises: {
              type: 'array',
              items: { type: 'object', properties: { word: { type: 'string' }, english: { type: 'string' }, answer: { type: 'string' } } }
            }
          }
        }
      });
      setExercises((result.exercises || []).map((ex: any) => ({ ...ex, userInput: '', revealed: false })));
    } catch (e) {
      toast.error('Failed to generate exercises');
    }
    setGeneratingExercises(false);
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link to={createPageUrl("Home")} className="text-slate-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2 text-white">
              <BookOpen className="w-7 h-7 text-teal-400" />
              Daily Journal
            </h1>
            <p className="text-sm text-slate-400">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </div>



        {/* Song Transcript Journal Mode */}
        <AnimatePresence mode="wait">
          {journalMode === "song" && latestMedia && (
            <motion.div
              key="song-journal"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              className="mb-6 rounded-2xl overflow-hidden bg-slate-900 border border-slate-800"
            >
              {/* Header */}
              <div className="px-6 pt-5 pb-3 flex items-center gap-3 border-b border-slate-800">
                <Music className="w-4 h-4 text-teal-400" />
                <div>
                  <p className="text-xs font-semibold tracking-widest uppercase text-teal-400">
                    Song Journal
                  </p>
                  <p className="text-base font-medium text-white">
                    {latestMedia.title}
                  </p>
                </div>
                {songJournalDone && (
                  <span className="ml-auto flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-300">
                    <CheckCircle className="w-3 h-3" /> Done
                  </span>
                )}
              </div>
              <div className="px-6 py-5">
                <SongTranscriptJournal
                  transcript={latestMedia.processed_transcript || []}
                  songTitle={latestMedia.title}
                  userProfile={userProfile}
                  onComplete={() => { setSongJournalDone(true); toast.success("Great work! 🎉"); }}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── NOTEBOOK ── */}
        <AnimatePresence>
        {journalMode === "free" && <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative rounded-2xl overflow-hidden mb-6 bg-slate-900 border border-slate-800"
        >
          {/* Margin line */}
          <div className="absolute left-14 top-0 bottom-0 w-px" style={{ background: 'rgba(45,212,191,0.25)' }} />
          {/* Ruled lines */}
          {Array.from({ length: 30 }).map((_, i) => (
            <div
              key={i}
              className="absolute left-0 right-0"
              style={{
                top: `${80 + i * 32}px`,
                height: '1px',
                background: 'rgba(148,163,184,0.12)'
              }}
            />
          ))}

          {/* Notebook top strip */}
          <div className="relative z-10 flex items-center justify-between pl-16 pr-6 pt-5 pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-semibold tracking-widest uppercase text-slate-400">
                {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${wordCount >= 100 ? 'bg-teal-500/15 text-teal-300' : 'bg-slate-800 text-slate-400'}`}>
                {wordCount} / 100 words
              </span>
              {/* Translate to learning language button */}
              <button
                onClick={handleTranslateEntry}
                disabled={translatingEntry || !text.trim()}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all disabled:opacity-50 bg-teal-500/15 text-teal-300 border border-teal-500/30 hover:bg-teal-500/25"
                title={`Translate to ${langName}`}
              >
                {translatingEntry ? <Loader2 className="w-3 h-3 animate-spin" /> : <Languages className="w-3 h-3" />}
                {translatingEntry ? 'Translating...' : `→ ${langName}`}
              </button>
            </div>
          </div>

          {/* Translated text panel */}
          <AnimatePresence>
            {showTranslated && translatedText && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="relative z-10 ml-16 mr-6 mt-3 rounded-xl p-4 text-sm bg-slate-800 border border-slate-700 text-slate-200"
                style={{ lineHeight: '1.8' }}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-semibold tracking-wider uppercase text-teal-400">{langName} Translation</span>
                  <button onClick={() => setShowTranslated(false)} className="text-slate-400 hover:text-white transition-colors"><X className="w-3.5 h-3.5" /></button>
                </div>
                <p dir={isRTLLanguage(userProfile?.language) ? 'rtl' : 'ltr'}>{translatedText}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Vocab word bubbles — above the writing area */}
          {suggestedVocab.length > 0 && (
            <div className="relative z-10 pl-16 pr-6 pb-4 pt-4 border-b border-dashed border-slate-700">
              <p className="text-xs mb-3 text-center font-semibold tracking-wide uppercase text-slate-400">
                Your latest words — use them in your entry ({usedWords.length}/{suggestedVocab.length})
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {suggestedVocab.map((word: any) => {
                  const isUsed = usedWords.includes(word.id);
                  return (
                    <motion.div
                      key={word.id}
                      whileHover={{ scale: 1.05 }}
                      onClick={() => {
                        const textarea = document.querySelector('textarea');
                        if (textarea) {
                          const start = textarea.selectionStart;
                          const before = text.substring(0, start);
                          const after = text.substring(start);
                          const insert = word.phonetic || word.word;
                          setText(before + insert + ' ' + after);
                        } else {
                          setText(t => t + ' ' + (word.phonetic || word.word));
                        }
                      }}
                      className={`flex flex-col items-center justify-center rounded-2xl cursor-pointer transition-all px-3 py-2 min-w-[64px] border ${isUsed ? 'bg-teal-500/15 border-teal-500/50' : 'bg-slate-800 border-slate-700'}`}
                    >
                      {isUsed && <CheckCircle className="w-3 h-3 mb-0.5 text-teal-400" />}
                      <span className={`text-xs font-bold ${isUsed ? 'text-teal-300' : 'text-slate-200'}`}>
                        {word.phonetic || word.word}
                      </span>
                      <span className="text-[10px] text-slate-400">{word.translation}</span>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Writing area */}
          <div className="relative z-10 pl-16 pr-6 pt-4">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onClick={handleTextClick}
              placeholder={`Write about your day using your new words above. Try to include: what you did today, how you felt, something you learned, and a goal for tomorrow. Click a word above to insert it!`}
              className="w-full bg-transparent border-none shadow-none focus:outline-none focus:ring-0 resize-none text-white placeholder:text-slate-500"
              style={{
                lineHeight: '32px',
                fontSize: '15px',
                minHeight: '480px',
                padding: '4px 0',
              }}
            />
          </div>



          {/* Translation Exercises */}
          {suggestedVocab.length > 0 && (
            <div className="relative z-10 pl-16 pr-6 pb-4 pt-2 border-t border-dashed border-slate-700">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold tracking-wide uppercase text-slate-400">
                  📝 Rewrite in {langName}
                </p>
                {exercises.length > 0 && (
                  <button
                    onClick={() => setShowPhonetics(p => !p)}
                    className={`text-xs px-3 py-1 rounded-full transition-all flex items-center gap-1 border ${showPhonetics ? 'bg-teal-500/15 text-teal-300 border-teal-500/30' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'}`}
                  >
                    {showPhonetics ? '🔤 Hide phonetics' : '🔤 Show phonetics'}
                  </button>
                )}
              </div>
              {exercises.length > 0 && (
                <div className="space-y-3">
                  {exercises.map((ex, i) => (
                    <div key={i} className="rounded-xl p-3 space-y-2 bg-slate-800 border border-slate-700">
                      <div className="flex items-start gap-2">
                        <div className="flex flex-col items-start gap-0.5 flex-shrink-0">
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-300">{ex.word}</span>
                          {showPhonetics && suggestedVocab.find((w: any) => (w.phonetic || w.word) === ex.word)?.translation && (
                            <span className="text-[10px] px-2 text-slate-400">
                              {suggestedVocab.find((w: any) => (w.phonetic || w.word) === ex.word)?.translation}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-slate-200">{ex.english}</p>
                      </div>
                      <input
                        type="text"
                        value={ex.userInput}
                        onChange={e => setExercises(prev => prev.map((item, idx) => idx === i ? { ...item, userInput: e.target.value } : item))}
                        placeholder={`Translate to ${langName}...`}
                        className="w-full px-3 py-1.5 rounded-lg text-sm outline-none bg-slate-900 border border-slate-700 text-white placeholder:text-slate-500 focus:border-teal-500"
                        dir={isRTLLanguage(userProfile?.language) ? 'rtl' : 'ltr'}
                      />
                      {ex.revealed ? (
                        <p className="text-xs px-2 py-1 rounded-lg bg-teal-500/10 text-teal-300">
                          ✅ {ex.answer}
                        </p>
                      ) : (
                        <button
                          onClick={() => setExercises(prev => prev.map((item, idx) => idx === i ? { ...item, revealed: true } : item))}
                          className="text-xs px-2 py-0.5 rounded-full transition-all text-slate-300 bg-slate-700 hover:bg-slate-600"
                        >
                          👁 Reveal answer
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* AI Question bubble */}
          <AnimatePresence>
            {(aiQuestion || generatingQuestion) && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="relative z-10 ml-16 mr-6 mb-4 rounded-xl px-4 py-3 bg-teal-500/10 border border-teal-500/30"
              >
                {generatingQuestion ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin text-teal-400" />
                    <span className="text-xs text-slate-400">Thinking of a question…</span>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm italic text-teal-200">✍️ {aiQuestion}</p>
                    <button onClick={() => setAiQuestion("")} className="text-slate-400 hover:text-white transition-colors"><X className="w-3.5 h-3.5" /></button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Signature + controls */}
          <div className="relative z-10 pl-16 pr-6 pb-5 pt-2 flex items-end justify-between gap-4 border-t border-slate-800">
            <div className="flex items-center gap-2">
              <input type="checkbox" id="isPublic" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="w-4 h-4 accent-teal-500" />
              <label htmlFor="isPublic" className="text-xs cursor-pointer text-slate-400">Share publicly</label>
            </div>

            <div className="flex items-end gap-4">
              <div className="w-40">
                <Suspense fallback={<div className="h-16 rounded animate-pulse bg-slate-800" />}>
                  <SignaturePad value={signature} onChange={setSignature} disabled={wordCount < 100} />
                </Suspense>
              </div>
              <Button
                onClick={handleSave}
                disabled={createEntryMutation.isPending || updateEntryMutation.isPending || !text.trim() || !allWordsUsed}
                className={`font-semibold text-sm ${allWordsUsed ? 'bg-teal-500 text-white hover:bg-teal-400' : 'bg-slate-800 text-slate-500'}`}
              >
                {allWordsUsed ? (todayEntry ? "Update" : "Save Entry") : `⚠️ ${wordCount}/100 words · ${usedWords.length}/${suggestedVocab.length} vocab`}
              </Button>
            </div>
          </div>
        </motion.div>}
        </AnimatePresence>

        {/* Previous Entries */}
        {entries.filter((e: any) => e.date !== today).length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold tracking-wider uppercase text-slate-400">Previous Entries</h3>
            {entries.filter((e: any) => e.date !== today).slice(0, 5).map((entry: any, idx: number) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: idx * 0.05 }}
                className="rounded-2xl p-4 bg-slate-900 border border-slate-800"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-white">
                    {new Date(entry.date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                  </span>
                  <button
                    onClick={() => updateEntryMutation.mutate({ id: entry.id, data: { is_public: !entry.is_public, author_name: userProfile?.avatar_name || "Anonymous" } })}
                    className={`text-xs px-2 py-0.5 rounded-full ${entry.is_public ? 'bg-teal-500/15 text-teal-300' : 'bg-slate-800 text-slate-400'}`}
                  >
                    {entry.is_public ? '📢 Public' : '🔒 Private'}
                  </button>
                </div>
                <p className="text-sm line-clamp-3 text-slate-200" style={{ lineHeight: '1.7' }}>{entry.text}</p>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Word click translation tooltip */}
      {(wordTranslation || translatingWord) && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          style={{ position: 'fixed', left: translationPosition.x, top: translationPosition.y, zIndex: 1000 }}
          className="bg-slate-900 text-white rounded-lg shadow-2xl p-3 border border-teal-500"
        >
          {translatingWord ? (
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Translating...</span>
            </div>
          ) : (
            <div className="space-y-2">
              <div>
                <p className="text-teal-400 font-bold text-sm">{wordTranslation.word}</p>
                <p className="text-white text-xs">
                  {wordTranslation.language === 'hebrew' ? wordTranslation.transliteration : wordTranslation.translation}
                </p>
              </div>
              <div className="flex gap-1">
                {wordTranslation.language === 'hebrew' && (
                  <button
                    onClick={() => setWordTranslation((prev: any) => ({ ...prev, showHebrew: !prev.showHebrew }))}
                    className="text-xs px-2 py-1 rounded bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 transition-all"
                    title="Show Hebrew phonetics"
                  >
                    {wordTranslation.showHebrew ? 'א Transliterate' : 'א Hebrew'}
                  </button>
                )}
                <button onClick={() => setWordTranslation(null)} className="text-white/60 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {wordTranslation.showHebrew && wordTranslation.language === 'hebrew' && (
                <p className="text-white text-xs" dir="rtl">{wordTranslation.word}</p>
              )}
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
