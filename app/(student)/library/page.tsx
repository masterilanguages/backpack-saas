"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { base44 as base44Client } from "@/api/base44Client";

// base44Client is a JS shim whose `entities` are built dynamically in a loop, so
// TS can't see entity keys like `Word`. Cast to `any` for ergonomic access —
// the runtime shape is guaranteed by the shim.
const base44: any = base44Client;

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowLeft, Star, Loader2, X, Wand2, Check, Search, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Link, useLocation, createPageUrl } from "@/lib/router-compat";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import CoreVocabTab from "@/components/grammar/CoreVocabTab";
import VerbsTab from "@/components/backpack/VerbsTab";
import WordCard from "@/components/backpack/WordCard";
import TranslatorWidget from "@/components/TranslatorWidget";
import SessionFlashcardsSection from "@/components/backpack/SessionFlashcardsSection";
import PasteWordsList from "@/components/backpack/PasteWordsList";
import { languageLabel, usesNikud, nativeScriptInstruction, isRTLText } from "@/lib/language";
import { mnemonicImagePrompt } from "@/lib/imageStyle";

// Simple English singularizer for common plural patterns
function toSingular(word: any) {
  if (!word || typeof word !== 'string') return word;
  const w = word.trim();
  // Don't singularize short words or phrases with spaces that aren't simple nouns
  const lw = w.toLowerCase();
  if (lw.endsWith('ies') && lw.length > 4) return w.slice(0, -3) + (w[0] === w[0].toUpperCase() ? 'Y' : 'y');
  if (lw.endsWith('sses') || lw.endsWith('shes') || lw.endsWith('ches') || lw.endsWith('xes') || lw.endsWith('zes')) return w.slice(0, -2);
  if (lw.endsWith('ves') && lw.length > 4) return w.slice(0, -3) + (lw.endsWith('ves') ? (w[0] === w[0].toUpperCase() ? 'F' : 'f') : '') + 'e';
  if (lw.endsWith('s') && !lw.endsWith('ss') && !lw.endsWith('us') && !lw.endsWith('is') && lw.length > 3) return w.slice(0, -1);
  return w;
}

function singularizeTranslation(translation: any) {
  if (!translation) return translation;
  // Only singularize single-word translations
  const parts = translation.trim().split(' ');
  if (parts.length === 1) return toSingular(translation);
  // For multi-word, singularize the last word if it looks like a plain noun
  // e.g. "red flowers" → "red flower"
  const last = parts[parts.length - 1];
  const singularLast = toSingular(last);
  if (singularLast !== last) {
    return [...parts.slice(0, -1), singularLast].join(' ');
  }
  return translation;
}

export default function Backpack() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState("level0");
  const [addWordForm, setAddWordForm] = useState({ phonetic: '', translation: '' });
  const [addingWord, setAddingWord] = useState(false);
  const [expandedId, setExpandedId] = useState<any>(null);
  const [selectedWord, setSelectedWord] = useState<any>(null);
  const [sentences, setSentences] = useState<any>(null);
  const [loadingSentences, setLoadingSentences] = useState(false);
  const [newWords, setNewWords] = useState<any[]>([]);
  const [activeNewWord, setActiveNewWord] = useState<any>(null);
  const [showAllEnglish, setShowAllEnglish] = useState(false);
  const [showHebrew, setShowHebrew] = useState(true);
  const [showTransliteration, setShowTransliteration] = useState(true);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'single'
  const [singleCardIndex, setSingleCardIndex] = useState(0);
  const [activeSecondTab, setActiveSecondTab] = useState<any>(null); // 'verbs' | 'corevocab' | null
  const [flippedCards, setFlippedCards] = useState<any>({});
  const [pictureWordId, setPictureWordId] = useState<any>(null);
  const [mnemonicDescription, setMnemonicDescription] = useState("");
  const [generatingMnemonic, setGeneratingMnemonic] = useState(false);

  const [newWordImage, setNewWordImage] = useState<any>(null);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [newWordCustomMnemonic, setNewWordCustomMnemonic] = useState("");
  const [lastImagePrompt, setLastImagePrompt] = useState("");
  const [imageApproved, setImageApproved] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [lockedWords, setLockedWords] = useState<any>(() => {
    if (typeof window === 'undefined') return {};
    return JSON.parse(localStorage.getItem('lockedWords') || '{}');
  });
  const [dismissedWords, setDismissedWords] = useState<Set<any>>(() => {
    if (typeof window === 'undefined') return new Set();
    return new Set(JSON.parse(localStorage.getItem('dismissedWords') || '[]'));
  });
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestingMnemonic, setSuggestingMnemonic] = useState<any>(null); // wordId currently suggesting
  const [mnemonicQueue, setMnemonicQueue] = useState<Set<any>>(new Set()); // all wordIds queued for generation
  const [showPhonetics, setShowPhonetics] = useState(false); // global toggle for all cards
  const [cardSentences, setCardSentences] = useState<any>({});
  const [generatingSentence, setGeneratingSentence] = useState<any>({});
  const [fetchingTranslation, setFetchingTranslation] = useState<any>({});
  const [sessionFlashcardData, setSessionFlashcardData] = useState<any>(null); // { words, title }
  const [selectedSessionId, setSelectedSessionId] = useState<any>(null); // which session is highlighted

  // Load current user
  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  // Check for pending session flashcard data.
  // Reactive to the URL query (location.search) so navigating to the "All Words"
  // / session flashcard view updates without a manual page reload.
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search || window.location.search);
    const flashcardParam = urlParams.get('flashcard');
    if (flashcardParam === 'session' || flashcardParam === 'all') {
      const stored = sessionStorage.getItem('pendingFlashcardWords');
      if (stored) {
        const data = JSON.parse(stored);
        sessionStorage.removeItem('pendingFlashcardWords');
        if (data.allWords) {
          // Will load all words once wordRatings loads — flag it
          setSessionFlashcardData({ words: null, title: 'All Words', allWords: true });
        } else {
          setSessionFlashcardData(data);
        }
        // Land on the New tab where the flashcard single-card view is rendered.
        setActiveTab('level0');
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, [location.search]);

  // Migrate: move all "pictures" category words to "wordbank" level0
  useEffect(() => {
    const migrate = async () => {
      const pictureWords = await base44.entities.Word.filter({ category: "pictures" });
      for (const w of pictureWords) {
        await base44.entities.Word.update(w.id, { category: "wordbank", times_practiced: 0, mastered: false });
      }
      if (pictureWords.length > 0) queryClient.invalidateQueries({ queryKey: ['wordRatings'] });
    };
    migrate().catch(() => {});
  }, []);

  // Load pending words from localStorage on mount
  useEffect(() => {
    const pending = JSON.parse(localStorage.getItem('pendingBackpackWords') || '[]');
    if (pending.length > 0) {
      setNewWords(prev => [...prev, ...pending]);
      localStorage.removeItem('pendingBackpackWords');
      toast.success(`${pending.length} word(s) loaded from chat!`);
    }
  }, []);



  // Auto-generate image after user stops typing
  useEffect(() => {
    if (!activeNewWord || !newWordCustomMnemonic.trim() || newWordCustomMnemonic === lastImagePrompt) return;

    const timer = setTimeout(() => {
      generateImage(newWordCustomMnemonic);
    }, 500);

    return () => clearTimeout(timer);
  }, [newWordCustomMnemonic, activeNewWord]);

  const { data: userProfile } = useQuery({
    queryKey: ['userProfile', currentUser?.email],
    queryFn: async () => {
      const profiles = await base44.entities.UserProfile.filter({ created_by: currentUser.email });
      return profiles[0] || null;
    },
    enabled: !!currentUser?.email,
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const { data: mediaLibrary = [] } = useQuery({
    queryKey: ['mediaLibraryTitles'],
    queryFn: () => base44.entities.MediaLibrary.list(),
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Build map: "Session N" → video title
  const sessionTitleMap = useMemo(() => {
    const map: any = {};
    for (const v of mediaLibrary as any[]) {
      if (v.default_day) map[`Session ${v.default_day}`] = v.title;
    }
    return map;
  }, [mediaLibrary]);

  const { data: wordRatings = [] } = useQuery({
    queryKey: ['wordRatings', userProfile?.language, currentUser?.email],
    queryFn: async () => {
      const lang = userProfile?.language || 'hebrew';
      // Fetch only THIS user's own rated words in their selected language
      const ownWords = await base44.entities.Word.filter({ category: "wordbank", language: lang, created_by: currentUser.email });
      // Fetch all approved words in their selected language (shared by admin)
      const approvedWords = await base44.entities.Word.filter({ approved: true, language: lang });
      // Find approved words the user hasn't personally rated yet (by phonetic)
      const ownPhonetics = new Set(ownWords.map((w: any) => (w.phonetic || w.word).toLowerCase()));
      const unratedApproved = approvedWords.filter((w: any) => !ownPhonetics.has((w.phonetic || w.word).toLowerCase()));
      // Show these as shared cards with times_practiced = 0 so user can rank them
      const sharedCards = unratedApproved.map((w: any) => ({ ...w, _shared: true, times_practiced: 0, mastered: false }));
      return [...ownWords, ...sharedCards];
    },
    enabled: !!userProfile && !!currentUser?.email,
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const createWordMutation = useMutation({
    mutationFn: (word: any) => base44.entities.Word.create(word),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['wordRatings'] }),
    onError: (e: any) => {
      console.error("createWordMutation failed", e);
      toast.error("Could not add word");
    },
  });

  const updateWordMutation = useMutation({
    mutationFn: ({ id, data }: any) => base44.entities.Word.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wordRatings'] });
      toast.success("Word rating updated!");
    },
    onError: (e: any) => {
      console.error("updateWordMutation failed", e);
      toast.error("Could not update word — you may not have permission to edit this card");
    },
  });

  const deleteWordMutation = useMutation({
    mutationFn: async ({ id, phonetic, language }: any) => {
      // Delete the target word
      await base44.entities.Word.delete(id);
      // Also delete any duplicates with the same phonetic — but ONLY the current
      // user's own personal copies in the same language. Never delete other users'
      // words, words in other languages, or shared/approved cards.
      // Callers that don't pass a language fall back to the active view language.
      const dupeLang = language || userProfile?.language || 'hebrew';
      if (phonetic) {
        const dupes = (wordRatings as any[]).filter(w =>
          w.id !== id &&
          (w.phonetic || w.word)?.toLowerCase() === phonetic.toLowerCase() &&
          w.created_by === currentUser?.email &&
          w.language === dupeLang &&
          !w._shared && !w.approved
        );
        for (const dupe of dupes) {
          await base44.entities.Word.delete(dupe.id);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wordRatings'] });
      toast.success("Word deleted!");
    },
    onError: (e: any) => {
      console.error("deleteWordMutation failed", e);
      toast.error("Could not delete word");
    },
  });

  const approveWordMutation = useMutation({
    mutationFn: ({ id, approved }: any) => base44.entities.Word.update(id, {
      approved,
      approved_by: approved ? currentUser?.email : null,
      approved_at: approved ? new Date().toISOString() : null,
    }),
    onSuccess: (_: any, { approved }: any) => {
      queryClient.invalidateQueries({ queryKey: ['wordRatings'] });
      toast.success(approved ? "Card approved ✅ — now shared with all users" : "Approval removed");
    },
    onError: (e: any) => {
      console.error("approveWordMutation failed", e);
      toast.error("Could not update approval status");
    },
  });

  const handleRateWord = async (wordId: any, rating: any, event: any) => {
    event.stopPropagation();
    // Check if it's a shared (approved) card not yet owned by this user
    const word = (wordRatings as any[]).find(w => w.id === wordId);
    if (word?._shared) {
      // Optimistically reflect the rating on the shared card so the UI updates
      // immediately (the real personal copy is created below).
      const ratingsKey = ['wordRatings', userProfile?.language, currentUser?.email];
      const prevRatings = queryClient.getQueryData(ratingsKey);
      queryClient.setQueryData(ratingsKey, (old: any) =>
        Array.isArray(old)
          ? old.map(w => w.id === wordId ? { ...w, times_practiced: rating, mastered: rating >= 5 } : w)
          : old
      );
      try {
        // Save a copy for this user
        await createWordMutation.mutateAsync({
          word: word.word,
          translation: singularizeTranslation(word.translation),
          phonetic: word.phonetic,
          category: 'wordbank',
          language: word.language || userProfile?.language || 'hebrew',
          times_practiced: rating,
          mastered: rating >= 5,
          image_url: word.image_url || null,
        });
        toast.success(rating >= 5 ? "Saved to your backpack — Mastered! ⭐" : "Saved to your backpack!");
      } catch (e) {
        // Roll back the optimistic update on failure
        if (prevRatings !== undefined) queryClient.setQueryData(ratingsKey, prevRatings);
      }
      return;
    }
    // Tapping "3" represents the level-3 bucket, which also contains legacy
    // level-4 words (the "3" button is shown active for times_practiced 3 or 4).
    // Don't demote a level-4 word back to 3 when the user taps the active "3".
    const effectiveRating = (rating === 3 && word?.times_practiced === 4) ? 4 : rating;
    await updateWordMutation.mutateAsync({
      id: wordId,
      data: { times_practiced: effectiveRating, mastered: effectiveRating >= 5 }
    });
  };

  const generateMnemonicForWord = async (word: any) => {
    if (!mnemonicDescription.trim()) return;
    setGeneratingMnemonic(true);
    try {
      const lang = userProfile?.language || 'hebrew';
      const result = await base44.integrations.Core.GenerateImage({
        prompt: mnemonicImagePrompt(`A scene to help learn the ${languageLabel(lang)} word "${word.phonetic}" meaning "${word.translation}": ${mnemonicDescription}`)
      });
      await updateWordMutation.mutateAsync({
        id: word.id,
        data: { image_url: result.url }
      });
      toast.success("Picture saved!");
      setPictureWordId(null);
      setMnemonicDescription("");
    } catch (e) {
      toast.error("Failed to generate picture");
    }
    setGeneratingMnemonic(false);
  };

  const [mnemonicExplanations, setMnemonicExplanations] = useState<any>({});

  // Keep a ref so the queue always uses the latest version (avoids stale closure)
  const suggestMnemonicRef = React.useRef<any>(null);

  const suggestMnemonicForWord = async (word: any) => {
    setSuggestingMnemonic(word.id);
    try {
      const rawWord = word.phonetic || word.word;
      // Strip Hebrew infinitive "l" prefix for verbs (e.g. "lahavot" → "havot", "lehorot" → "horot").
      // Hebrew only — never chop the first letter of Latin words ("luna" → "una", "love" → "ove").
      const mnemonicLang = word.language || userProfile?.language || 'hebrew';
      const targetWord = mnemonicLang === 'hebrew' && (word.is_verb || word.phonetic?.startsWith('l')) && /^l/i.test(rawWord) ? rawWord.slice(1) : rawWord;
      const meaning = word.translation || '';

      const concept = await base44.integrations.Core.InvokeLLM({
        prompt: `You create sound-based visual mnemonics for language learning.

Target word: "${targetWord}" (meaning: "${meaning}")

STEP 1 — SOUND MATCH: Find a real, common English noun whose spelling/pronunciation sounds like "${targetWord}" or its first 1-2 syllables. Think of words that rhyme or start the same way. Examples: "ask" → "Ask-him" → "eskimo", "shalom" → "shallow", "kelev" → "collar". The noun must be a physical, concrete, everyday object or creature. IMPORTANT: Do NOT use colors (like ivory, red, blue, gold, etc.) as the sound anchor — use objects or animals only.

STEP 2 — SCENE: Place that physical noun object in a funny visual scene that ALSO shows the meaning "${meaning}". The object itself (not speech bubbles, not labels) should remind you of the sound. The MEANING "${meaning}" must be the BIG, obvious visual focus of the scene; the sound-anchor object is only a supporting prop inside it. Keep the scene MODERN, timeless and child-friendly — NEVER use historical/period or violent settings (no medieval, knights, soldiers, armor, battlefield, war, ancient, Victorian). If the sound-anchor would normally be historical or military (e.g. "armor"), reimagine it as a cute, modern, harmless cartoon version. NEVER write art-style or realism words (like "medieval", "realistic", "photograph", "oil painting", "cinematic", "render", "3D") inside the description — describe only WHAT happens, not how it is drawn.

CRITICAL: Do NOT name any character, creature, animal, or person in the scene with the sound-anchor word, the target word, or any variant. They are just generic characters performing the action.

STEP 3 — The image must show the OBJECT doing something related to the meaning. NO speech bubbles, NO text, NO characters speaking or calling out. PURE VISUAL ACTION ONLY — no mouths open to speak, no gesturing as if calling out.

Return JSON:
- sound_anchor: the English noun that sounds like "${targetWord}" (e.g. "eskimo" for "askeem")
- explanation: one punchy sentence like "An ESKIMO (askeem=agree) shaking hands in the snow"
- image_prompt: a vivid description of the SCENE and ACTION only, where the meaning "${meaning}" is the clear centerpiece and the sound_anchor object is just a small prop. Modern/timeless setting. NO era/period words, NO art-style or realism words, no talking, no speech, no text, no naming any creatures.`,
        response_json_schema: {
          type: 'object',
          properties: {
            sound_anchor: { type: 'string' },
            explanation: { type: 'string' },
            image_prompt: { type: 'string' },
          }
        }
      });

      const imageResult = await base44.integrations.Core.GenerateImage({
        prompt: mnemonicImagePrompt(concept.image_prompt)
      });

      setMnemonicExplanations((prev: any) => ({ ...prev, [word.id]: concept.explanation }));

      // For approved or shared cards, create a personal copy instead of modifying the original
      if (word.approved || word._shared) {
        // Check if user already has a personal copy
        const existingCopy = (wordRatings as any[]).find(w =>
          !w.approved && !w._shared &&
          (w.phonetic || w.word).toLowerCase() === (word.phonetic || word.word).toLowerCase()
        );
        if (existingCopy) {
          await updateWordMutation.mutateAsync({ id: existingCopy.id, data: { image_url: imageResult.url } });
        } else {
          await createWordMutation.mutateAsync({
            word: word.word,
            translation: word.translation,
            phonetic: word.phonetic,
            category: 'wordbank',
            language: word.language || userProfile?.language || 'hebrew',
            times_practiced: word.times_practiced || 0,
            mastered: word.mastered || false,
            image_url: imageResult.url,
            mnemonic_explanation: concept.explanation,
          });
        }
      } else {
        await updateWordMutation.mutateAsync({
          id: word.id,
          data: { image_url: imageResult.url, mnemonic_explanation: concept.explanation }
        });
      }

      toast.success('Mnemonic image created! 🎨');
      setPictureWordId(null);
    } catch (e) {
      toast.error('Failed to generate mnemonic');
    }
    setSuggestingMnemonic(null);
  };

  // Always keep ref up to date
  suggestMnemonicRef.current = suggestMnemonicForWord;

  const userLang = userProfile?.language || 'hebrew';
  const langFilteredRatings = (wordRatings as any[]).filter(w => w.language === userLang);

  // Track which word IDs have been queued for auto-generation (persists across re-renders)
  const queuedWordIds = React.useRef<Set<any>>(new Set());
  const isRunningQueue = React.useRef(false);

  // Keep a ref to all words so the running queue always sees latest data
  const allWordsRef = React.useRef<any[]>([]);
  allWordsRef.current = langFilteredRatings;

  // Auto-generate images for all words missing them — sequential queue
  useEffect(() => {
    const wordsNeedingImages = langFilteredRatings.filter(
      w => !w.image_url && w.id && !w.id.startsWith('session_') && !queuedWordIds.current.has(w.id)
    );
    if (wordsNeedingImages.length === 0) return;

    // Mark them as queued immediately to prevent duplicate queuing on re-renders
    wordsNeedingImages.forEach(w => queuedWordIds.current.add(w.id));
    setMnemonicQueue(prev => { const next = new Set(prev); wordsNeedingImages.forEach(w => next.add(w.id)); return next; });

    // If queue is already running, the newly queued words will be picked up automatically
    if (isRunningQueue.current) return;

    let cancelled = false;
    isRunningQueue.current = true;
    const runQueue = async () => {
      while (!cancelled) {
        // Always look up from the latest word list for next queued word without an image
        const nextWord = allWordsRef.current.find(
          w => !w.image_url && w.id && !w.id.startsWith('session_') && queuedWordIds.current.has(w.id)
        );
        if (!nextWord) break;
        queuedWordIds.current.delete(nextWord.id); // remove before processing to avoid re-pick
        await suggestMnemonicRef.current(nextWord);
        setMnemonicQueue(prev => { const next = new Set(prev); next.delete(nextWord.id); return next; });
        await new Promise(r => setTimeout(r, 500));
      }
      isRunningQueue.current = false;
    };
    runQueue();
    return () => { cancelled = true; isRunningQueue.current = false; };
  }, [langFilteredRatings.map(w => w.id + (w.image_url ? '1' : '0')).join(',')]); // eslint-disable-line

  // Populate allWords flashcard once wordRatings loads
  useEffect(() => {
    if (sessionFlashcardData?.allWords && langFilteredRatings.length > 0 && sessionFlashcardData.words === null) {
      const allFlashcardWords = langFilteredRatings.map(w => ({
        word: w.word,
        phonetic: w.phonetic,
        translation: w.translation,
        image_url: w.image_url,
        id: w.id,
      }));
      setSessionFlashcardData({ words: allFlashcardWords, title: 'All Words', allWords: true });
    }
  }, [langFilteredRatings.length, sessionFlashcardData?.allWords]); // eslint-disable-line
  const level0Words = langFilteredRatings.filter(w => (w.times_practiced || 0) === 0);
  const level1Words = langFilteredRatings.filter(w => w.times_practiced === 1);
  const level2Words = langFilteredRatings.filter(w => w.times_practiced === 2);
  const level3Words = langFilteredRatings.filter(w => w.times_practiced === 3 || w.times_practiced === 4);
  const level5Words = langFilteredRatings.filter(w => w.times_practiced >= 5);

  const coachWords = langFilteredRatings.filter(w => w.coach_folder === 'From Coach' && (w.times_practiced || 0) === 0);

  const tabs = [
    { id: "level0", label: "✨ New", color: "gray" },

    { id: "level1", label: "Level 1", color: "orange" },
    { id: "level2", label: "Level 2", color: "yellow" },
    { id: "level3", label: "Level 3", color: "purple" },
    { id: "level5", label: "Mastered", color: "green" },
  ];


  const getDisplayWords = () => {
    let words: any[] = [];
    if (activeTab === "level5") words = level5Words;
    else if (activeTab === "level3") words = level3Words;
    else if (activeTab === "level2") words = level2Words;
    else if (activeTab === "level1") words = level1Words;
    else if (activeTab === "level0") words = level0Words;
    else if (activeTab === "coach") words = coachWords;
    else return [];

    // Deduplicate by phonetic (keep highest times_practiced)
    const seen = new Map();
    for (const w of words) {
      const key = (w.phonetic || w.word).toLowerCase();
      if (!seen.has(key) || (w.times_practiced || 0) > (seen.get(key).times_practiced || 0)) {
        seen.set(key, w);
      }
    }
    let result = [...seen.values()]
      .filter(w => !dismissedWords.has(w.id))
      .sort((a, b) => (a.phonetic || a.word).localeCompare(b.phonetic || b.word));

    // Apply search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(w =>
        (w.phonetic || "").toLowerCase().includes(q) ||
        (w.word || "").toLowerCase().includes(q) ||
        (w.translation || "").toLowerCase().includes(q)
      );
    }
    return result;
  };

  // Auto-fetch missing translations — throttled one at a time
  useEffect(() => {
    const words = getDisplayWords().filter(word => {
      if (!word.id || fetchingTranslation[word.id]) return false;
      const missingTranslation = !word.translation || word.translation.toLowerCase() === (word.phonetic || word.word).toLowerCase();
      return missingTranslation;
    });
    if (words.length === 0) return;
    let cancelled = false;
    const runSequentially = async () => {
      for (const word of words) {
        if (cancelled) break;
        setFetchingTranslation((prev: any) => ({ ...prev, [word.id]: true }));
        try {
          const lang = word.language || userProfile?.language || 'hebrew';
          const result = await base44.integrations.Core.InvokeLLM({
            prompt: `What is the English meaning of the ${languageLabel(lang)} word "${word.phonetic || word.word}"? Return JSON with just: translation (English meaning, 1-4 words max).`,
            response_json_schema: { type: 'object', properties: { translation: { type: 'string' } } }
          });
          if (result?.translation) {
            updateWordMutation.mutate({ id: word.id, data: { translation: result.translation } });
          }
        } finally {
          setFetchingTranslation((prev: any) => ({ ...prev, [word.id]: false }));
        }
        await new Promise(r => setTimeout(r, 300));
      }
    };
    runSequentially();
    return () => { cancelled = true; };
  }, [activeTab, wordRatings]); // eslint-disable-line

  // Auto-generate sentences for displayed words when tab changes — throttled one at a time
  useEffect(() => {
    const words = getDisplayWords().filter(w => w.id && !cardSentences[w.id] && !generatingSentence[w.id]);
    if (words.length === 0) return;
    let cancelled = false;
    const runSequentially = async () => {
      for (const word of words) {
        if (cancelled) break;
        if (!cardSentences[word.id] && !generatingSentence[word.id]) {
          await generateCardSentence(word);
          await new Promise(r => setTimeout(r, 300));
        }
      }
    };
    runSequentially();
    return () => { cancelled = true; };
  }, [activeTab, wordRatings.length]); // eslint-disable-line

  const handleWordClick = async (word: any) => {
    setSelectedWord(word);
    setSentences(null);
    setLoadingSentences(true);
    try {
      const lang = word.language || userProfile?.language || 'hebrew';
      const label = languageLabel(lang);
      const nikud = usesNikud(lang);
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Create 3 simple sentences in ${label} using the word "${word.phonetic || word.word}" which means "${word.translation}".
                      For each sentence provide the transliterated version (Latin letters, not ${label} script) and English translation.
                      List each word separately with ${nativeScriptInstruction(lang)}, transliteration, and meaning.${nikud ? `
                      CRITICAL: All ${label} words MUST include vowel points (nikkud).` : ''}`,
                      response_json_schema: {
                        type: "object",
                        properties: {
                          sentences: {
                            type: "array",
                            items: {
                              type: "object",
                              properties: {
                                transliterated: { type: "string" },
                                english: { type: "string" },
                                words: {
                                  type: "array",
                                  items: {
                                    type: "object",
                                    properties: {
                                      hebrew: { type: "string", description: `the word in ${label} native script${nikud ? ' WITH FULL vowels/nikkud marks' : ''}` },
                                      word: { type: "string", description: "Transliteration" },
                                      meaning: { type: "string" }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
      });
      setSentences(result.sentences);
    } catch (e) {
      console.error(e);
    }
    setLoadingSentences(false);
  };

  const addToNewWords = (word: any, meaning: any, hebrew: any) => {
    const exists = (wordRatings as any[]).find(w => w.phonetic?.toLowerCase() === word.toLowerCase());
    if (exists) {
      toast.info("Already in backpack!");
      return;
    }
    const alreadyQueued = newWords.find(w => w.word.toLowerCase() === word.toLowerCase());
    if (alreadyQueued) {
      toast.info("Already added!");
      return;
    }
    setNewWords(prev => [...prev, { word, meaning, hebrew }]);
    toast.success(`"${word}" added to New Words! 📝`);
  };

  const handleNewWordRate = async (rating: any) => {
    if (!activeNewWord) return;

    const newWord = await createWordMutation.mutateAsync({
      word: activeNewWord.hebrew || activeNewWord.word,
      translation: singularizeTranslation(activeNewWord.meaning),
      phonetic: activeNewWord.word,
      category: "wordbank",
      language: userProfile?.language || 'hebrew',
      times_practiced: rating,
      mastered: rating >= 5,
      image_url: newWordImage || null,
    });

    // NOTE: no inline image generation here. If the user didn't already make a
    // custom image (newWordImage), the global "auto-generate missing images"
    // effect (suggestMnemonicForWord) creates one once the word appears without
    // an image_url. Generating inline too would race that effect and produce a
    // second, different image ("the photo changed" bug).

    if (rating >= 5) {
      toast.success("Added to Fluent! ⭐");
    } else {
      toast.success("Word saved!");
    }
    finishNewWord();
  };



  const generateImage = async (prompt: any) => {
    setGeneratingImage(true);
    setLastImagePrompt(prompt);
    try {
      const result = await base44.integrations.Core.GenerateImage({
        prompt: mnemonicImagePrompt(`A scene to help remember the word "${activeNewWord.word}" meaning "${activeNewWord.meaning}": ${prompt}`)
      });
      setNewWordImage(result.url);

      const savedWord = (wordRatings as any[]).find(w => w.phonetic?.toLowerCase() === activeNewWord.word.toLowerCase());
      if (savedWord) {
        await updateWordMutation.mutateAsync({
          id: savedWord.id,
          data: { image_url: result.url }
        });
      }
      toast.success("Image saved!");
    } catch (e) {
      toast.error("Failed to generate image");
    }
    setGeneratingImage(false);
  };

  const finishNewWord = () => {
    setNewWords(prev => prev.filter(w => w.word !== activeNewWord.word));
    setActiveNewWord(null);
    setNewWordImage(null);
    setImageApproved(false);
    setNewWordCustomMnemonic("");
    setLastImagePrompt("");
  };

  const generateMissingMnemonics = async (words: any[]) => {
    for (const word of words) {
      try {
        setGeneratingMnemonic(true);
        const lang = word.language || userProfile?.language || 'hebrew';
        const mnemonicPrompt = mnemonicImagePrompt(`A scene to help learn the ${languageLabel(lang)} word "${word.phonetic}" meaning "${word.translation}", visually representing the meaning`);

        const result = await base44.integrations.Core.GenerateImage({
          prompt: mnemonicPrompt
        });

        await updateWordMutation.mutateAsync({
          id: word.id,
          data: { image_url: result.url }
        });
      } catch (e) {
        console.error("Failed to auto-generate mnemonic for", word.phonetic);
      }
    }
    setGeneratingMnemonic(false);
  };

  const generateCardSentence = async (word: any) => {
    // NOTE: Generated example sentences are intentionally kept session-only in
    // `cardSentences` (keyed by word.id) rather than persisted to the Word entity.
    // Persisting is unsafe here: session/flashcard cards use synthetic ids
    // (e.g. "session_N") that aren't real DB rows, and the schema must not change.
    // They simply regenerate on reload — no crash, no data written.
    setGeneratingSentence((prev: any) => ({ ...prev, [word.id]: true }));
    setCardSentences((prev: any) => { const next = { ...prev }; delete next[word.id]; return next; });
    try {
      const lang = word.language || userProfile?.language || 'hebrew';
      const label = languageLabel(lang);
      const nikud = usesNikud(lang);
      // Native-script form of the word, if the stored word.word differs from its transliteration.
      const hebrewScript = word.word && word.word !== word.phonetic ? word.word : null;
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `You are an expert ${label} linguist and language teacher creating example sentences for learners.

TARGET WORD: ${hebrewScript ? `${label}: "${hebrewScript}"` : ''} Transliteration: "${word.phonetic || word.word}" | English meaning: "${word.translation}"

TASK: Write ONE grammatically perfect, natural modern ${label} sentence that clearly demonstrates the meaning of "${word.translation}".

STRICT RULES:
1. The sentence MUST contain the word ${hebrewScript || word.phonetic} (or its correctly conjugated/declined form)
2. The ${label} sentence and the English translation MUST convey the EXACT same meaning — no creative liberties
3. Use correct ${nikud ? 'nikud-less Hebrew script (standard modern written Hebrew)' : `${label} native spelling (including any accents or diacritics)`}
4. 4–7 words only
5. The English translation must be a direct, accurate translation of the ${label} — not a paraphrase
6. Each word in the "words" array must map 1-to-1 to the actual ${label} words in the sentence in order
7. Do NOT invent words or use placeholder meanings — every ${label} word must have its real translation

Return JSON with:
- hebrew_sentence: the full sentence in ${label} native script
- transliteration: the full sentence in Latin letters (natural pronunciation)
- english: the direct English translation of the ${label} sentence
- words: array (one per ${label} word, in order) of { hebrew: the word in ${label} native script, word: its transliteration, meaning: its English meaning }`,
        response_json_schema: {
          type: 'object',
          properties: {
            hebrew_sentence: { type: 'string' },
            transliteration: { type: 'string' },
            english: { type: 'string' },
            words: { type: 'array', items: { type: 'object', properties: { hebrew: { type: 'string' }, word: { type: 'string' }, meaning: { type: 'string' } } } }
          }
        }
      });
      setCardSentences((prev: any) => ({ ...prev, [word.id]: result }));
    } catch (e) {
      toast.error('Failed to generate sentence');
    }
    setGeneratingSentence((prev: any) => ({ ...prev, [word.id]: false }));
  };

  const handleAddWordFromSentence = async (wordText: any, meaning: any, hebrew: any) => {
    const exists = (wordRatings as any[]).find(w => (w.phonetic || w.word)?.toLowerCase() === wordText.toLowerCase());
    if (exists) { toast.info('Already in backpack!'); return; }
    await createWordMutation.mutateAsync({
      word: hebrew || wordText, translation: singularizeTranslation(meaning), phonetic: wordText,
      category: 'wordbank', language: userProfile?.language || 'hebrew',
      times_practiced: 0, mastered: false,
    });
    toast.success(`"${wordText}" added! 🎒`);
  };

  const toggleWordLock = (wordId: any) => {
    const updated = { ...lockedWords, [wordId]: !lockedWords[wordId] };
    setLockedWords(updated);
    localStorage.setItem('lockedWords', JSON.stringify(updated));
    toast.success(updated[wordId] ? "Word locked 🔒" : "Word unlocked 🔓");
  };

  const isWordLocked = (wordId: any) => lockedWords[wordId];
  const isAdmin = currentUser?.role === 'admin';
  // Content editable = not approved AND (not locally locked OR is admin)
  const isContentEditable = (word: any) => !word.approved && (!isWordLocked(word.id) || isAdmin);

  const handleDismissWord = (wordId: any) => {
    const updated = new Set([...dismissedWords, wordId]);
    setDismissedWords(updated);
    localStorage.setItem('dismissedWords', JSON.stringify([...updated]));
    toast.success('Removed from your view');
  };

  const handleAddNewWord = async () => {
    if (!addWordForm.phonetic.trim() && !addWordForm.translation.trim()) return;
    setAddingWord(true);

    const lang = userProfile?.language || 'hebrew';
    const langLabel = languageLabel(lang);
    let translation = addWordForm.translation.trim();
    let phonetic = addWordForm.phonetic.trim();
    let hebrewWord = '';

    // Auto-lookup when either field is missing
    if (!phonetic || !translation) {
      try {
        const input = phonetic || translation;
        const isEnglishOnly = !phonetic && !!translation;
        const lookup = await base44.integrations.Core.InvokeLLM({
          prompt: `The user typed "${input}" which is ${isEnglishOnly ? `an English meaning for a ${langLabel} word` : `a transliteration of a ${langLabel} word`}.
Identify the ${langLabel} word, its correct phonetic transliteration, and its English meaning.
Return JSON with: translation (English, 1-4 words), phonetic (clean Latin transliteration), hebrew (${nativeScriptInstruction(lang)}).`,
          response_json_schema: {
            type: 'object',
            properties: {
              translation: { type: 'string' },
              phonetic: { type: 'string' },
              hebrew: { type: 'string' },
            }
          }
        });
        if (!translation) translation = lookup.translation || '';
        if (!phonetic) phonetic = lookup.phonetic || '';
        hebrewWord = lookup.hebrew || '';
        setAddWordForm(prev => ({
          phonetic: phonetic || prev.phonetic,
          translation: translation || prev.translation,
        }));
      } catch (e) {
        toast.error('Could not find word automatically');
      }
    }

    const finalTranslation = translation; // capture before form clear
    // Deduplicate check — scope to this user's own words only (word_sel is world-readable)
    const existingCheck = await base44.entities.Word.filter({ phonetic, created_by: currentUser?.email });
    if (existingCheck.length > 0) {
      toast.info(`"${phonetic}" is already in your backpack!`);
      setAddWordForm({ phonetic: '', translation: '' });
      setAddingWord(false);
      return;
    }

    const isVerb = /^l[aeiou]/i.test(phonetic);
    const newWord = await createWordMutation.mutateAsync({
      word: hebrewWord || phonetic,
      translation: singularizeTranslation(finalTranslation),
      phonetic,
      category: 'wordbank',
      language: userProfile?.language || 'hebrew',
      times_practiced: 0,
      mastered: false,
      is_verb: isVerb,
    });
    setAddWordForm({ phonetic: '', translation: '' });
    toast.success('Word added! Generating mnemonic... 🎨');
    // NOTE: no inline mnemonic/image generation here. The global
    // "auto-generate missing images" effect (suggestMnemonicForWord) creates the
    // sound-based concept + Pixar image once this new word appears without an
    // image_url. Generating inline too would race that effect and overwrite it
    // with a second, different image ("the photo changed" bug).
    setAddingWord(false);
  };

  return (
    <>
    <div className="min-h-screen bg-slate-950">

      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center gap-4 mb-4">
          <Link to={createPageUrl("Home")} className="text-slate-400 hover:text-white">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <h1 className="text-3xl font-bold text-white">🎒 My Backpack</h1>
        </div>

        {/* Add new word */}
        <div className="mb-5 bg-slate-900 rounded-2xl border border-slate-800 p-4">
          <h3 className="text-sm font-semibold mb-3 text-white">+ Add New Word</h3>
          <div className="flex gap-2 flex-wrap">
            <Input
              value={addWordForm.phonetic}
              onChange={(e) => setAddWordForm(prev => ({ ...prev, phonetic: e.target.value }))}
              placeholder="Transliteration (e.g. shalom)"
              className="flex-1 min-w-[140px] bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 text-sm focus:border-teal-500"
              onKeyDown={(e) => e.key === 'Enter' && handleAddNewWord()}
            />
            <Input
              value={addWordForm.translation}
              onChange={(e) => setAddWordForm(prev => ({ ...prev, translation: e.target.value }))}
              placeholder="English meaning"
              className="flex-1 min-w-[140px] bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 text-sm focus:border-teal-500"
              onKeyDown={(e) => e.key === 'Enter' && handleAddNewWord()}
            />
            <Button
              onClick={handleAddNewWord}
              disabled={addingWord || (!addWordForm.phonetic.trim() && !addWordForm.translation.trim())}
              className="bg-teal-500 text-white hover:bg-teal-400"
            >
              {addingWord ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}
            </Button>
          </div>

          {/* Paste bulk words */}
          <PasteWordsList userProfile={userProfile} onWordsAdded={() => queryClient.invalidateQueries({ queryKey: ['wordRatings'] })} />
        </div>

        {/* Session Flashcards Section */}
        {userProfile && (
          <SessionFlashcardsSection
            userProfile={userProfile}
            onSessionSelect={(words: any, title: any, autoStart: any) => {
              setSessionFlashcardData({ words, title });
              setActiveTab("level0");
              if (autoStart) setSingleCardIndex(0);
            }}
          />
        )}

        {/* Tabs - Single Row + Phonetics Toggle */}
        <div className="flex gap-1 mb-2 justify-center overflow-x-auto flex-wrap items-center">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                activeTab === tab.id
                  ? tab.id === 'coach' ? 'bg-teal-500 text-white border border-teal-400' : 'bg-teal-500 text-white border border-teal-400'
                  : 'bg-slate-900 text-slate-400 hover:bg-slate-800 border border-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>


        {/* Search input */}
        {searchOpen && (
          <div className="mb-4 max-w-xs mx-auto">
            <Input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by word or translation..."
              className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus:border-teal-500"
            />
          </div>
        )}



        {/* Second Tab Content */}
        {activeSecondTab === 'corevocab' && (
          <div>
            <VerbsTab words={langFilteredRatings} />
            <CoreVocabTab />
          </div>
        )}

        {/* Content */}
        {!activeSecondTab && <div>
          {sessionFlashcardData && activeTab === "level0" ? (
            // Show session flashcards single card view
            (sessionFlashcardData.words || []).length === 0 ? (
              <div className="text-center py-12">
                <p className="text-slate-400 text-lg">No words in this session yet</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <div className="flex items-center gap-2 w-full max-w-xs justify-between">
                  <button
                    onClick={() => { setSessionFlashcardData(null); setSingleCardIndex(0); }}
                    className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 font-bold text-lg"
                  >
                    ←
                  </button>
                  <span className="text-slate-400 text-sm">{singleCardIndex + 1} / {sessionFlashcardData.words.length}</span>
                  <button
                    onClick={() => setSingleCardIndex(i => Math.min(sessionFlashcardData.words.length - 1, i + 1))}
                    disabled={singleCardIndex === sessionFlashcardData.words.length - 1}
                    className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 disabled:opacity-30 font-bold text-lg"
                  >
                    →
                  </button>
                </div>
                <WordCard
                  word={{
                    id: `session_${singleCardIndex}`,
                    word: sessionFlashcardData.words[singleCardIndex]?.word || sessionFlashcardData.words[singleCardIndex]?.hebrew || sessionFlashcardData.words[singleCardIndex]?.phonetic,
                    translation: sessionFlashcardData.words[singleCardIndex]?.translation,
                    phonetic: sessionFlashcardData.words[singleCardIndex]?.phonetic,
                    category: 'wordbank',
                    // Carry the target language so Latin-script words render LTR
                    // (WordCard derives direction from word.language).
                    language: sessionFlashcardData.words[singleCardIndex]?.language || userProfile?.language || 'hebrew',
                    times_practiced: 0,
                    mastered: false,
                  }}
                  showAllEnglish={showAllEnglish}
                  onEnglishToggle={() => setShowAllEnglish(v => !v)}
                  onHebrewToggle={() => setShowHebrew(v => !v)}
                  showHebrew={showHebrew}
                  showTransliteration={showTransliteration}
                  isContentEditable={() => false}
                  mnemonicExplanations={mnemonicExplanations}
                  setMnemonicExplanations={setMnemonicExplanations}
                  cardSentences={cardSentences}
                  generatingSentence={generatingSentence}
                  fetchingTranslation={fetchingTranslation}
                  suggestingMnemonic={suggestingMnemonic}
                  mnemonicQueue={mnemonicQueue}
                  isAdmin={isAdmin}
                  updateWordMutation={updateWordMutation}
                  handleRateWord={handleRateWord}
                  suggestMnemonicForWord={suggestMnemonicForWord}
                  approveWordMutation={approveWordMutation}
                  handleDismissWord={handleDismissWord}
                  deleteWordMutation={deleteWordMutation}
                  handleAddWordFromSentence={handleAddWordFromSentence}
                  generateCardSentence={generateCardSentence}
                  sessionTitleMap={sessionTitleMap}
                />
              </div>
            )
          ) : getDisplayWords().length === 0 ? (
            <div className="text-center py-12">
              <p className="text-slate-400 text-lg">No words at this level yet!</p>
            </div>
          ) : activeTab === 'level5' ? (
            <div className="flex flex-wrap gap-4 justify-center">
              {getDisplayWords().map((word) => (
                <WordCard
                  key={word.id}
                  word={word}
                  showAllEnglish={showAllEnglish}
                  onEnglishToggle={() => setShowAllEnglish(v => !v)}
                  onHebrewToggle={() => setShowHebrew(v => !v)}
                  showHebrew={showHebrew}
                  showTransliteration={showTransliteration}
                  isContentEditable={isContentEditable}
                  mnemonicExplanations={mnemonicExplanations}
                  setMnemonicExplanations={setMnemonicExplanations}
                  cardSentences={cardSentences}
                  generatingSentence={generatingSentence}
                  fetchingTranslation={fetchingTranslation}
                  suggestingMnemonic={suggestingMnemonic}
                  mnemonicQueue={mnemonicQueue}
                  isAdmin={isAdmin}
                  updateWordMutation={updateWordMutation}
                  handleRateWord={handleRateWord}
                  suggestMnemonicForWord={suggestMnemonicForWord}
                  approveWordMutation={approveWordMutation}
                  handleDismissWord={handleDismissWord}
                  deleteWordMutation={deleteWordMutation}
                  handleAddWordFromSentence={handleAddWordFromSentence}
                  generateCardSentence={generateCardSentence}
                  sessionTitleMap={sessionTitleMap}
                />
              ))}
            </div>
          ) : activeTab !== 'level0' ? (() => {
            const words = getDisplayWords();
            const idx = Math.min(singleCardIndex, words.length - 1);
            const word = words[idx];
            return (
              <div className="flex flex-col items-center gap-4">
                <div className="flex items-center gap-2 w-full max-w-xs justify-between">
                  <button onClick={() => setSingleCardIndex(i => Math.max(0, i - 1))} disabled={idx === 0} className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 disabled:opacity-30 font-bold text-lg">←</button>
                  <span className="text-slate-400 text-sm">{idx + 1} / {words.length}</span>
                  <button onClick={() => setSingleCardIndex(i => Math.min(words.length - 1, i + 1))} disabled={idx === words.length - 1} className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 disabled:opacity-30 font-bold text-lg">→</button>
                </div>
                <WordCard
                  word={word}
                  showAllEnglish={showAllEnglish}
                  onEnglishToggle={() => setShowAllEnglish(v => !v)}
                  onHebrewToggle={() => setShowHebrew(v => !v)}
                  showHebrew={showHebrew}
                  showTransliteration={showTransliteration}
                  isContentEditable={isContentEditable}
                  mnemonicExplanations={mnemonicExplanations}
                  setMnemonicExplanations={setMnemonicExplanations}
                  cardSentences={cardSentences}
                  generatingSentence={generatingSentence}
                  fetchingTranslation={fetchingTranslation}
                  suggestingMnemonic={suggestingMnemonic}
                  mnemonicQueue={mnemonicQueue}
                  isAdmin={isAdmin}
                  updateWordMutation={updateWordMutation}
                  handleRateWord={handleRateWord}
                  suggestMnemonicForWord={suggestMnemonicForWord}
                  approveWordMutation={approveWordMutation}
                  handleDismissWord={handleDismissWord}
                  deleteWordMutation={deleteWordMutation}
                  handleAddWordFromSentence={handleAddWordFromSentence}
                  generateCardSentence={generateCardSentence}
                  sessionTitleMap={sessionTitleMap}
                />
              </div>
            );
          })() : (
            <div className="flex flex-wrap gap-4 justify-center">
              {getDisplayWords().map((word) => (
                <WordCard
                  key={word.id}
                  word={word}
                  showAllEnglish={showAllEnglish}
                  onEnglishToggle={() => setShowAllEnglish(v => !v)}
                  onHebrewToggle={() => setShowHebrew(v => !v)}
                  showHebrew={showHebrew}
                  showTransliteration={showTransliteration}
                  isContentEditable={isContentEditable}
                  mnemonicExplanations={mnemonicExplanations}
                  setMnemonicExplanations={setMnemonicExplanations}
                  cardSentences={cardSentences}
                  generatingSentence={generatingSentence}
                  fetchingTranslation={fetchingTranslation}
                  suggestingMnemonic={suggestingMnemonic}
                  mnemonicQueue={mnemonicQueue}
                  isAdmin={isAdmin}
                  updateWordMutation={updateWordMutation}
                  handleRateWord={handleRateWord}
                  suggestMnemonicForWord={suggestMnemonicForWord}
                  approveWordMutation={approveWordMutation}
                  handleDismissWord={handleDismissWord}
                  deleteWordMutation={deleteWordMutation}
                  handleAddWordFromSentence={handleAddWordFromSentence}
                  generateCardSentence={generateCardSentence}
                  sessionTitleMap={sessionTitleMap}
                />
              ))}
            </div>
          )}
        </div>}

      {/* Word Sentences Dialog */}
      <Dialog open={!!selectedWord} onOpenChange={() => setSelectedWord(null)}>
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-200 max-w-sm max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-teal-400">{selectedWord?.phonetic || selectedWord?.word}</span>
              <span className="text-slate-500">=</span>
              <span className="text-teal-300">{selectedWord?.translation}</span>
            </DialogTitle>
          </DialogHeader>

          {loadingSentences ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
            </div>
          ) : sentences ? (
            <div className="space-y-4">
              <p className="text-slate-400 text-sm">Tap words to add to New Words:</p>
              {sentences.map((sentence: any, idx: number) => (
                <div key={idx} className="bg-slate-800 border border-slate-700 rounded-xl p-3">
                  <div className="flex flex-wrap gap-x-1 gap-y-2 mb-2">
                                            {sentence.transliterated.split(' ').map((word: any, widx: number) => {
                                              const wordInfo = sentence.words?.find((w: any) =>
                                                w.word.toLowerCase() === word.toLowerCase().replace(/[.,!?]/g, '')
                                              );
                                              const isQueued = newWords.find(w => w.word.toLowerCase() === wordInfo?.word?.toLowerCase());
                                              return (
                                                <button
                                                  key={widx}
                                                  onClick={() => {
                                                    const cleanWord = word.replace(/[.,!?]/g, '');
                                                    const meaning = wordInfo?.meaning || "";
                                                    const hebrew = wordInfo?.hebrew || "";
                                                    addToNewWords(cleanWord, meaning, hebrew);
                                                  }}
                                                  className={`inline-flex flex-col items-start px-0.5 rounded ${
                                                    isQueued
                                                      ? "text-teal-300 bg-teal-500/20"
                                                      : "hover:bg-teal-500/20 cursor-pointer"
                                                  }`}
                                                >
                                                  <span className="text-slate-300 text-[13px] h-[15px] leading-[15px]" dir={isRTLText(wordInfo?.hebrew) ? "rtl" : "ltr"}>{wordInfo?.hebrew || ""}</span>
                                                  <span className={`text-teal-400 text-[13px] h-[15px] leading-[15px] ${isQueued ? "" : "underline decoration-dotted"}`}>{word}</span>
                                                </button>
                                              );
                                            })}
                                          </div>
                  <p className="text-slate-400 text-sm mt-1">{sentence.english}</p>
                </div>
              ))}

              {newWords.length > 0 && (
                <div className="pt-2 border-t border-slate-700">
                  <p className="text-teal-400 text-sm mb-2">📝 New Words: {newWords.length}</p>
                  <Button
                    onClick={() => { setSelectedWord(null); setActiveTab("level0"); }}
                    className="w-full bg-teal-500 text-white hover:bg-teal-400"
                  >
                    Rate New Words
                  </Button>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>



      {/* New Word Rating Dialog */}
      <Dialog open={!!activeNewWord} onOpenChange={() => setActiveNewWord(null)}>
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-200 max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-center">
              <span className="text-slate-300 text-lg block" dir={isRTLText(activeNewWord?.hebrew) ? "rtl" : "ltr"}>{activeNewWord?.hebrew}</span>
              <span className="text-teal-400 text-2xl">{activeNewWord?.word}</span>
              <span className="text-slate-400 text-lg block">= {activeNewWord?.meaning}</span>
            </DialogTitle>
          </DialogHeader>

          {/* Mnemonic section - First */}
          <p className="text-slate-400 text-sm mb-2">Describe your own picture to remember this word:</p>

          {/* Custom input */}
          <div className="mb-3">
            <Textarea
              value={newWordCustomMnemonic}
              onChange={(e) => setNewWordCustomMnemonic(e.target.value)}
              placeholder="e.g. A dog eating an apple..."
              className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus:border-teal-500 text-sm resize-none h-16 w-full"
            />
            {generatingImage && (
              <div className="flex items-center justify-center gap-2 mt-2 text-slate-400 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating picture...
              </div>
            )}
          </div>

          {/* Generated Image */}
          {newWordImage && (
            <div className="flex justify-center mb-3">
              <div className="relative inline-block">
                <img src={newWordImage} alt="Mnemonic" className="w-48 rounded-xl border border-white/20" />
                <button
                  onClick={() => generateImage(newWordCustomMnemonic)}
                  disabled={generatingImage}
                  className="absolute bottom-2 left-2 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center"
                >
                  {generatingImage ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <span>🔄</span>}
                </button>
                <button
                  onClick={() => {
                    setImageApproved(true);
                    toast.success("Image saved! ✓");
                  }}
                  className={`absolute bottom-2 right-2 w-8 h-8 rounded-full flex items-center justify-center ${
                    imageApproved ? "bg-teal-500" : "bg-white/20 hover:bg-white/30"
                  }`}
                >
                  <Check className={`w-4 h-4 ${imageApproved ? "text-white" : "text-white/60"}`} />
                </button>
              </div>
            </div>
          )}

          {/* Rating - After picture */}
          <p className="text-slate-400 text-sm mb-2 text-center">How well do you know this word?</p>
          <div className="flex gap-2 justify-center mb-4">
            {[{ value: 1, label: "1" }, { value: 2, label: "2" }, { value: 3, label: "3" }, { value: 5, label: "M ⭐" }].map(({ value, label }) => (
              <motion.button
                key={value}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleNewWordRate(value)}
                className={`w-12 h-12 rounded-xl font-bold ${
                  value === 5 ? "bg-teal-600 text-white"
                  : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                }`}
              >
                {label}
              </motion.button>
            ))}
          </div>

          {/* Next Word button */}
          <Button onClick={finishNewWord} className="w-full bg-teal-500 text-white hover:bg-teal-400">
            Next Word →
          </Button>
        </DialogContent>
      </Dialog>

      {/* Translator Widget */}
      <TranslatorWidget />
    </div>
  </div>


  </>
  );
}
