"use client";

// Duocards-style phone app shell. Everything lives inside the light rounded
// panel — a fixed-height "phone screen" with the menu pinned at the bottom
// and no page scrolling:
//   LEARNING  the cards home (turtle mascot, goal ring, stats, START, My cards)
//   PRACTICE  AI questions from the user's newest flashcard words + the
//             in-shell Journal (write → AI turns it into a lesson)
//   LIBRARY   the Content Library videos as an in-shell thumbnail grid
//   ACCOUNT   profile menu — Progress and Schedule live here
// The turtle mascot reacts (idle / happy / sad / cheer) like Duolingo's owl.

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { base44 as base44Client } from "@/api/base44Client";
const base44: any = base44Client;
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronRight, ChevronLeft, Plus, BarChart3, Palette, Loader2, X, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { languageLabel, isRTLText, usesNikud } from "@/lib/language";
import { mnemonicImagePrompt } from "@/lib/imageStyle";
import { generateLesson } from "@/lib/journal/generateLesson";
import JournalLessonView from "@/components/journal/JournalLessonView";
import WordCard from "@/components/backpack/WordCard";
import { transcribeMediaSource, youtubeSource } from "@/lib/transcription";
import { generateLessonAudio } from "@/lib/audio/lessonAudio";

// Strip punctuation from a tapped transcript token, keeping native letters.
const cleanToken = (t: string) => t.replace(/[.,!?;:"'()\[\]{}«»„“”…׀׃־]+/g, "").trim();

// Shared, memoized loader for the YouTube IFrame API (same pattern as the
// media page — a single global onYouTubeIframeAPIReady is last-writer-wins,
// so every consumer must chain through one promise).
let __ytApiPromise: any = null;
function loadYouTubeApi() {
  const w: any = window;
  if (w.YT && w.YT.Player) return Promise.resolve(w.YT);
  if (__ytApiPromise) return __ytApiPromise;
  __ytApiPromise = new Promise((resolve) => {
    const finish = () => { if (w.YT && w.YT.Player) resolve(w.YT); };
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      if (typeof prev === "function") { try { prev(); } catch (e) {} }
      finish();
    };
    if (!document.getElementById("youtube-iframe-api")) {
      const tag = document.createElement("script");
      tag.id = "youtube-iframe-api";
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }
    const poll = setInterval(() => {
      if (w.YT && w.YT.Player) { clearInterval(poll); resolve(w.YT); }
    }, 100);
  });
  return __ytApiPromise;
}

// Writing starters for the in-shell journal (same set the old page offered).
const JOURNAL_TOPICS: { label: string; starter: string }[] = [
  { label: "My day", starter: "Today I " },
  { label: "How I feel", starter: "Right now I feel " },
  { label: "Grateful for", starter: "I'm grateful for " },
  { label: "A goal", starter: "One thing I want to do is " },
];

const deriveTitle = (text: string) => {
  const first = (text || "").trim().split("\n")[0].trim();
  if (!first) return "Journal entry";
  return first.length > 48 ? first.slice(0, 48).trim() + "…" : first;
};

const extractYouTubeId = (url: string) => {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/shorts\/([^&\n?#]+)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
};

// Same topic set the full library's add dialog offers.
const VIDEO_TOPICS = [
  "Religion / Spirituality", "Sports / Fitness", "Cooking / Food", "Nutrition",
  "Health / Wellness", "Meditation / Mindfulness", "Music", "Travel", "Culture",
  "Education / Learning", "Business / Career", "Personal Growth", "Relationships", "News / Current Events",
];

const DAILY_GOAL = 15;

const LANGUAGE_FLAGS: Record<string, string> = {
  hebrew: "🇮🇱",
  english: "🇬🇧",
  spanish: "🇪🇸",
  french: "🇫🇷",
  portuguese: "🇵🇹",
  italian: "🇮🇹",
};

type Mood = "idle" | "happy" | "sad" | "cheer";

// ---------------------------------------------------------------------------
// Turtle mascot with Duolingo-owl-style reactions. Mood drives the animation
// and the reaction bubble next to it.
// ---------------------------------------------------------------------------
function Turtle({ mood, size = "text-6xl" }: { mood: Mood; size?: string }) {
  const animations: Record<Mood, any> = {
    idle: { y: [0, -3, 0], rotate: 0, scale: 1, transition: { repeat: Infinity, duration: 3 } },
    happy: { y: [0, -18, 0, -10, 0], rotate: [0, -8, 8, 0], scale: 1.08, transition: { duration: 0.9 } },
    cheer: { y: [0, -24, 0, -24, 0], rotate: [0, -12, 12, -12, 0], scale: 1.12, transition: { duration: 1.2 } },
    sad: { y: [0, 4, 0], rotate: [0, -6, 0], scale: 0.94, transition: { duration: 0.8 } },
  };
  const emote = mood === "happy" ? "🎉" : mood === "cheer" ? "🏆" : mood === "sad" ? "💧" : null;
  return (
    <div className="relative inline-flex items-end">
      <motion.span animate={animations[mood]} className={`${size} leading-none`}>
        🐢
      </motion.span>
      <AnimatePresence>
        {emote && (
          <motion.span
            key={mood}
            initial={{ opacity: 0, y: 6, scale: 0.5 }}
            animate={{ opacity: 1, y: -6, scale: 1 }}
            exit={{ opacity: 0 }}
            className="absolute -right-4 -top-2 text-2xl"
          >
            {emote}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [tab, setTab] = useState<"learning" | "practice" | "library" | "account">("learning");
  const [mood, setMood] = useState<Mood>("idle");

  // In-shell journal (lives inside the Practice tab)
  const [journalMode, setJournalMode] = useState<"off" | "list" | "compose" | "lesson">("off");
  const [journalText, setJournalText] = useState("");
  const [journalSelected, setJournalSelected] = useState<any>(null);
  const [journalBusy, setJournalBusy] = useState(false);
  // In-shell learning-language picker (lives inside the Account tab)
  const [langPickerOpen, setLangPickerOpen] = useState(false);
  // Sentence-proposal cloud in the journal compose view
  const [proposals, setProposals] = useState<string[]>([]);
  const [proposalsLoading, setProposalsLoading] = useState(false);
  // In-shell video player (Library tab): selected video, its transcript
  // segments, playback state for line-syncing, and the turtle slow mode.
  const [shellVideo, setShellVideo] = useState<any>(null);
  const [shellSegments, setShellSegments] = useState<any[]>([]);
  const [shellSegsLoading, setShellSegsLoading] = useState(false);
  const [shellPlaying, setShellPlaying] = useState(false);
  const [shellSlow, setShellSlow] = useState(false);
  const [shellTime, setShellTime] = useState(0);
  const shellPlayerRef = React.useRef<any>(null);
  const shellTimerRef = React.useRef<any>(null);
  const activeLineRef = React.useRef<HTMLButtonElement | null>(null);

  // Word popup over the in-shell transcript (tap a word → sound / edit / add
  // to backpack). Keyed by line+word index so tapping elsewhere moves it.
  const [wordPopup, setWordPopup] = useState<any>(null);

  // Backpack tab: one-by-one flashcards (full WordCard experience in-shell)
  const [cardIdx, setCardIdx] = useState(0);
  const [showAllEnglish, setShowAllEnglish] = useState(false);
  const [showHebrewCards, setShowHebrewCards] = useState(true);
  const [showTranslitCards, setShowTranslitCards] = useState(true);
  const [cardSentences, setCardSentences] = useState<any>({});
  const [generatingSentence, setGeneratingSentence] = useState<any>({});
  const [mnemonicExplanations, setMnemonicExplanations] = useState<any>({});
  const [suggestingMnemonic, setSuggestingMnemonic] = useState<any>(null);
  const [dismissedCards, setDismissedCards] = useState<Set<any>>(new Set());
  // WordCard checks membership; the shell has no auto-generate queue.
  const emptyMnemonicQueue = React.useRef(new Set()).current;

  // In-shell add-video form (Library tab)
  const [libAddOpen, setLibAddOpen] = useState(false);
  const emptyLibForm = { video_url: "", video_id: "", title: "", language: "", difficulty_level: "All", topics: [] as string[] };
  const [libForm, setLibForm] = useState<any>(emptyLibForm);
  const [libLoadingMeta, setLibLoadingMeta] = useState(false);
  const [libSaving, setLibSaving] = useState(false);

  // Practice (AI quiz) state
  const [quiz, setQuiz] = useState<any[]>([]);
  const [quizIdx, setQuizIdx] = useState(0);
  const [quizAnswer, setQuizAnswer] = useState<number | null>(null);
  const [quizScore, setQuizScore] = useState(0);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizDone, setQuizDone] = useState(false);

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
    document.title = "Home - Lashon Languages";
    // Deep-link support: /home?open=journal (old /journal links redirect here).
    const open = new URLSearchParams(window.location.search).get("open");
    if (open === "journal") {
      setTab("practice");
      setJournalMode("list");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Reactions decay back to idle.
  useEffect(() => {
    if (mood === "idle") return;
    const t = setTimeout(() => setMood("idle"), 1600);
    return () => clearTimeout(t);
  }, [mood]);

  const { data: userProfile } = useQuery({
    queryKey: ["userProfile", currentUser?.email],
    queryFn: async () => {
      const profiles = await base44.entities.UserProfile.filter({ created_by: currentUser.email });
      return profiles[0] || null;
    },
    enabled: !!currentUser?.email,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const language = userProfile?.language || "hebrew";

  const { data: words = [] } = useQuery({
    queryKey: ["wordRatings", language, currentUser?.email],
    queryFn: () => base44.entities.Word.filter({ category: "wordbank", language, created_by: currentUser.email }),
    enabled: !!userProfile && !!currentUser?.email,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Library tab: master-library videos in the learner's language + their own
  // personal videos, rendered as thumbnails inside the shell.
  const { data: libraryVideos = [] } = useQuery({
    queryKey: ["mediaLibrary"],
    queryFn: () => base44.entities.MediaLibrary.list(),
    enabled: !!currentUser && tab === "library",
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const { data: myVideos = [] } = useQuery({
    queryKey: ["userSavedVideos", currentUser?.email],
    queryFn: () => base44.entities.UserSavedVideo.list(),
    enabled: !!currentUser && tab === "library",
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Strictly the active language: in Spanish mode only Spanish videos appear —
  // both from the master catalog and the user's own additions.
  const shellVideos = useMemo(() => {
    const catalog = (libraryVideos as any[])
      .filter((v) => v.is_active !== false && v.language === language);
    const own = (myVideos as any[])
      .filter((v) => v.created_by === currentUser?.email && v.language === language)
      .map((v) => ({ ...v, _mine: true }));
    return [...own, ...catalog];
  }, [libraryVideos, myVideos, language, currentUser?.email]);

  // Journal entries (in-shell journal). Legacy daily-journal rows are left out.
  const { data: journalEntries = [] } = useQuery({
    queryKey: ["journalLessonEntries"],
    queryFn: () => base44.entities.JournalEntry.list("-created_date"),
    enabled: !!currentUser && journalMode !== "off",
  });
  const lessonEntries = useMemo(
    () => (journalEntries as any[]).filter((e) => e.target_language || e.lesson || e.status),
    [journalEntries]
  );

  const { toLearn, practiced, learned, practicedToday } = useMemo(() => {
    const today = new Date().toDateString();
    let toLearn = 0, practiced = 0, learned = 0, practicedToday = 0;
    for (const w of words as any[]) {
      const level = w.times_practiced || 0;
      if (level === 0) toLearn++;
      else if (level >= 5) learned++;
      else practiced++;
      if (level > 0 && w.updated_date && new Date(w.updated_date).toDateString() === today) {
        practicedToday++;
      }
    }
    return { toLearn, practiced, learned, practicedToday };
  }, [words]);

  const goalDone = Math.min(practicedToday, DAILY_GOAL);
  const ringRadius = 40;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const streak = userProfile?.daily_streak || 0;

  // Switch the learning language — same behavior the old sidebar switcher had:
  // update the profile and invalidate everything that filters by language.
  const changeLanguageMutation = useMutation({
    mutationFn: async (lang: string) => {
      const profiles = await base44.entities.UserProfile.filter({ created_by: currentUser?.email });
      if (profiles[0]) return base44.entities.UserProfile.update(profiles[0].id, { language: lang });
      return base44.entities.UserProfile.create({ language: lang, current_day: 1 });
    },
    onSuccess: (_data: any, lang: string) => {
      queryClient.invalidateQueries({ queryKey: ["userProfile"] });
      toast.success(`Language switched to ${lang.charAt(0).toUpperCase()}${lang.slice(1)}`);
      setLangPickerOpen(false);
    },
    onError: (e: any) => toast.error(`Couldn't switch language: ${e?.message || "unknown error"}`),
  });

  const bumpWordMutation = useMutation({
    mutationFn: ({ id, level }: any) =>
      base44.entities.Word.update(id, { times_practiced: level, mastered: level >= 5 }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["wordRatings"] }),
  });

  // -------------------------------------------------------------------------
  // Backpack flashcards: the same mutations/handlers the full Backpack page
  // wires into WordCard, in compact form (all cards here are the user's own).
  // -------------------------------------------------------------------------
  const updateWordMutation = useMutation({
    mutationFn: ({ id, data }: any) => base44.entities.Word.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["wordRatings"] }),
    onError: () => toast.error("Could not update word"),
  });

  const deleteWordMutation = useMutation({
    mutationFn: ({ id }: any) => base44.entities.Word.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wordRatings"] });
      toast.success("Word deleted!");
    },
    onError: () => toast.error("Could not delete word"),
  });

  const approveWordMutation = useMutation({
    mutationFn: ({ id, approved }: any) =>
      base44.entities.Word.update(id, {
        approved,
        approved_by: approved ? currentUser?.email : null,
        approved_at: approved ? new Date().toISOString() : null,
      }),
    onSuccess: (_: any, { approved }: any) => {
      queryClient.invalidateQueries({ queryKey: ["wordRatings"] });
      toast.success(approved ? "Card approved ✅" : "Approval removed");
    },
  });

  const handleRateWord = async (wordId: any, rating: any, event: any) => {
    event?.stopPropagation?.();
    await updateWordMutation.mutateAsync({
      id: wordId,
      data: { times_practiced: rating, mastered: rating >= 5 },
    });
    setMood(rating >= 5 ? "cheer" : "happy");
  };

  // Sound-anchor mnemonic image — same recipe as the full Backpack page.
  const suggestMnemonicForWord = async (word: any) => {
    setSuggestingMnemonic(word.id);
    try {
      const rawWord = word.phonetic || word.word;
      const mnemonicLang = word.language || language;
      // Strip Hebrew infinitive "l" prefix for verbs — Hebrew only.
      const targetWord =
        mnemonicLang === "hebrew" && (word.is_verb || word.phonetic?.startsWith("l")) && /^l/i.test(rawWord)
          ? rawWord.slice(1)
          : rawWord;
      const meaning = word.translation || "";

      const concept = await base44.integrations.Core.InvokeLLM({
        prompt: `You create sound-based visual mnemonics for language learning.

Target word: "${targetWord}" (meaning: "${meaning}")

STEP 1 — SOUND MATCH: Find a real, common English noun whose spelling/pronunciation sounds like "${targetWord}" or its first 1-2 syllables. Think of words that rhyme or start the same way. Examples: "ask" → "Ask-him" → "eskimo", "shalom" → "shallow", "kelev" → "collar". The noun must be a physical, concrete, everyday object or creature. IMPORTANT: Do NOT use colors (like ivory, red, blue, gold, etc.) as the sound anchor — use objects or animals only.

STEP 2 — SCENE: Place that physical noun object in a funny visual scene that ALSO shows the meaning "${meaning}". The object itself (not speech bubbles, not labels) should remind you of the sound. The MEANING "${meaning}" must be the BIG, obvious visual focus of the scene; the sound-anchor object is only a supporting prop inside it. Keep the scene MODERN, timeless and child-friendly — NEVER use historical/period or violent settings (no medieval, knights, soldiers, armor, battlefield, war, ancient, Victorian). If the sound-anchor would normally be historical or military (e.g. "armor"), reimagine it as a cute, modern, harmless cartoon version. NEVER write art-style or realism words (like "medieval", "realistic", "photograph", "oil painting", "cinematic", "render", "3D") inside the description — describe only WHAT happens, not how it is drawn.

CRITICAL: Do NOT name any character, creature, animal, or person in the scene with the sound-anchor word, the target word, or any variant. They are just generic characters performing the action.

STEP 3 — The image must show the OBJECT doing something related to the meaning. NO speech bubbles, NO text, NO characters speaking or calling out. PURE VISUAL ACTION ONLY — no mouths open to speak, no gesturing as if calling out.

Return JSON:
- sound_anchor: the English noun that sounds like "${targetWord}"
- explanation: one punchy sentence like "An ESKIMO (askeem=agree) shaking hands in the snow"
- image_prompt: a vivid description of the SCENE and ACTION only, where the meaning "${meaning}" is the clear centerpiece and the sound_anchor object is just a small prop. Modern/timeless setting. NO era/period words, NO art-style or realism words, no talking, no speech, no text, no naming any creatures.`,
        response_json_schema: {
          type: "object",
          properties: {
            sound_anchor: { type: "string" },
            explanation: { type: "string" },
            image_prompt: { type: "string" },
          },
        },
      });

      const imageResult = await base44.integrations.Core.GenerateImage({
        prompt: mnemonicImagePrompt(concept.image_prompt),
      });

      setMnemonicExplanations((prev: any) => ({ ...prev, [word.id]: concept.explanation }));
      await updateWordMutation.mutateAsync({
        id: word.id,
        data: { image_url: imageResult.url, mnemonic_explanation: concept.explanation },
      });
      toast.success("Mnemonic image created! 🎨");
    } catch (e) {
      toast.error("Failed to generate mnemonic");
    }
    setSuggestingMnemonic(null);
  };

  // One strict example sentence per card — session-only, same as the full page.
  const generateCardSentence = async (word: any) => {
    setGeneratingSentence((prev: any) => ({ ...prev, [word.id]: true }));
    setCardSentences((prev: any) => { const next = { ...prev }; delete next[word.id]; return next; });
    try {
      const lang = word.language || language;
      const label = languageLabel(lang);
      const nikud = usesNikud(lang);
      const hebrewScript = word.word && word.word !== word.phonetic ? word.word : null;
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `You are an expert ${label} linguist and language teacher creating example sentences for learners.

TARGET WORD: ${hebrewScript ? `${label}: "${hebrewScript}"` : ""} Transliteration: "${word.phonetic || word.word}" | English meaning: "${word.translation}"

TASK: Write ONE grammatically perfect, natural modern ${label} sentence that clearly demonstrates the meaning of "${word.translation}".

STRICT RULES:
1. The sentence MUST contain the word ${hebrewScript || word.phonetic} (or its correctly conjugated/declined form)
2. The ${label} sentence and the English translation MUST convey the EXACT same meaning — no creative liberties
3. Use correct ${nikud ? "nikud-less Hebrew script (standard modern written Hebrew)" : `${label} native spelling (including any accents or diacritics)`}
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
          type: "object",
          properties: {
            hebrew_sentence: { type: "string" },
            transliteration: { type: "string" },
            english: { type: "string" },
            words: { type: "array", items: { type: "object", properties: { hebrew: { type: "string" }, word: { type: "string" }, meaning: { type: "string" } } } },
          },
        },
      });
      setCardSentences((prev: any) => ({ ...prev, [word.id]: result }));
    } catch (e) {
      toast.error("Failed to generate sentence");
    }
    setGeneratingSentence((prev: any) => ({ ...prev, [word.id]: false }));
  };

  const handleAddWordFromSentence = async (wordText: any, meaning: any, hebrew: any) => {
    const exists = (words as any[]).find((w) => (w.phonetic || w.word)?.toLowerCase() === wordText.toLowerCase());
    if (exists) { toast.info("Already in backpack!"); return; }
    await base44.entities.Word.create({
      word: hebrew || wordText,
      translation: meaning,
      phonetic: wordText,
      category: "wordbank",
      language,
      times_practiced: 0,
      mastered: false,
    });
    queryClient.invalidateQueries({ queryKey: ["wordRatings"] });
    toast.success(`"${wordText}" added! 🎒`);
  };

  const handleDismissWord = (wordId: any) => {
    setDismissedCards((prev) => new Set([...prev, wordId]));
    toast.success("Removed from your view");
  };

  // Deck for the one-by-one pager: new cards first, then by level.
  const flashDeck = useMemo(() => {
    return (words as any[])
      .filter((w) => !dismissedCards.has(w.id))
      .slice()
      .sort(
        (a, b) =>
          (a.times_practiced || 0) - (b.times_practiced || 0) ||
          (a.phonetic || a.word || "").localeCompare(b.phonetic || b.word || "")
      );
  }, [words, dismissedCards]);
  const safeCardIdx = Math.min(cardIdx, Math.max(0, flashDeck.length - 1));

  // -------------------------------------------------------------------------
  // Practice: AI multiple-choice questions from the newest flashcard words.
  // -------------------------------------------------------------------------
  const startQuiz = async () => {
    const pool = (words as any[])
      .filter((w) => w.translation && (w.phonetic || w.word))
      .sort((a, b) => new Date(b.created_date || 0).getTime() - new Date(a.created_date || 0).getTime())
      .sort((a, b) => (a.times_practiced || 0) - (b.times_practiced || 0))
      .slice(0, 8);
    if (pool.length < 2) {
      toast.info("Add a few words to your cards first!");
      return;
    }
    setQuizLoading(true);
    setQuizDone(false);
    setQuiz([]);
    setQuizIdx(0);
    setQuizScore(0);
    setQuizAnswer(null);
    try {
      const label = languageLabel(language);
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `You are a ${label} tutor. Create one multiple-choice exercise per word for these ${label} flashcards the student recently added:

${pool.map((w) => `- "${w.phonetic || w.word}" = "${w.translation}"`).join("\n")}

Mix question styles: translate ${label}→English, translate English→${label}, and fill-the-blank in a short sentence. Each question has exactly 4 options with ONE correct. Distractors must be plausible but clearly wrong. Keep questions short.

Return JSON: { "questions": [ { "word": the flashcard word, "prompt": the question text, "options": [4 strings], "correct_index": 0-3, "explanation": one short sentence } ] }`,
        response_json_schema: {
          type: "object",
          properties: {
            questions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  word: { type: "string" },
                  prompt: { type: "string" },
                  options: { type: "array", items: { type: "string" } },
                  correct_index: { type: "number" },
                  explanation: { type: "string" },
                },
              },
            },
          },
        },
      });
      const qs = (result?.questions || []).filter((q: any) => Array.isArray(q.options) && q.options.length === 4);
      if (qs.length === 0) throw new Error("no questions");
      setQuiz(qs);
    } catch (e) {
      toast.error("Couldn't generate exercises — try again.");
    }
    setQuizLoading(false);
  };

  const answerQuiz = (idx: number) => {
    if (quizAnswer !== null) return;
    const q = quiz[quizIdx];
    const correct = idx === q.correct_index;
    setQuizAnswer(idx);
    if (correct) {
      setQuizScore((s) => s + 1);
      setMood("happy");
      // Correct answer counts as practice on that word (feeds the daily goal).
      const w = (words as any[]).find(
        (w) => (w.phonetic || w.word)?.toLowerCase() === (q.word || "").toLowerCase()
      );
      if (w) {
        const level = Math.min((w.times_practiced || 0) + 1, 4);
        bumpWordMutation.mutate({ id: w.id, level });
      }
    } else {
      setMood("sad");
    }
  };

  const nextQuiz = () => {
    if (quizIdx + 1 >= quiz.length) {
      setQuizDone(true);
      if (quizScore === quiz.length) setMood("cheer");
    } else {
      setQuizIdx((i) => i + 1);
      setQuizAnswer(null);
    }
  };

  // -------------------------------------------------------------------------
  // In-shell journal: write an entry, AI turns it into a target-language
  // lesson (same generateLesson module the old /journal page used).
  // -------------------------------------------------------------------------
  const generateJournalLesson = async () => {
    if (!journalText.trim()) {
      toast.info("Write a few sentences first!");
      return;
    }
    setJournalBusy(true);
    try {
      const lesson = await generateLesson({
        originalText: journalText,
        targetLanguage: language,
        invokeLLM: base44.integrations.Core.InvokeLLM,
      });
      const saved = await base44.entities.JournalEntry.create({
        title: deriveTitle(journalText),
        date: new Date().toISOString().split("T")[0],
        text: journalText,
        original_language: null,
        target_language: language,
        status: "generated",
        lesson,
      });
      queryClient.invalidateQueries({ queryKey: ["journalLessonEntries"] });
      // Shim may drop the lesson column pre-migration; keep the in-memory copy.
      setJournalSelected({ ...(saved || {}), lesson: saved?.lesson || lesson });
      setJournalMode("lesson");
      setJournalText("");
      setMood("happy");
    } catch (e) {
      console.error(e);
      toast.error("Couldn't generate the lesson — please try again.");
    }
    setJournalBusy(false);
  };

  // Propose short sentences the learner can tap into their journal entry.
  // Ideas continue whatever they've written and, when possible, sneak in
  // words from their backpack so the entry practices their own vocabulary.
  const proposeSentences = async () => {
    if (proposalsLoading) return;
    setProposalsLoading(true);
    try {
      const label = languageLabel(language);
      const recentWords = (words as any[])
        .slice()
        .sort((a, b) => new Date(b.created_date || 0).getTime() - new Date(a.created_date || 0).getTime())
        .slice(0, 8)
        .map((w) => `"${w.phonetic || w.word}" (${w.translation})`)
        .join(", ");
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `A ${label} learner is writing a short personal journal entry (they write in simple English; it later becomes a ${label} lesson).

Their entry so far:
"""
${journalText.trim() || "(empty — they haven't started yet)"}
"""
${recentWords ? `Words they are currently learning: ${recentWords}.` : ""}

Propose 3 DIFFERENT short first-person sentences (max 12 words each, simple English) they could add next. The sentences must fit naturally after what they wrote (or start the entry if empty), feel personal and concrete, and — where it fits naturally — use the ENGLISH meaning of one of the words they are learning. No numbering, no quotes.

Return JSON: { "sentences": ["...", "...", "..."] }`,
        response_json_schema: {
          type: "object",
          properties: { sentences: { type: "array", items: { type: "string" } } },
        },
      });
      const list = (result?.sentences || []).filter((s: any) => typeof s === "string" && s.trim()).slice(0, 3);
      if (list.length === 0) throw new Error("no sentences");
      setProposals(list);
    } catch (e) {
      toast.error("Couldn't think of ideas — try again.");
    }
    setProposalsLoading(false);
  };

  // Tap a proposal → it joins the entry, and fresh ideas can build on it.
  const addProposal = (sentence: string) => {
    setJournalText((txt) => {
      const base = txt.trim();
      if (!base) return sentence + " ";
      const needsPeriod = /[.!?…]$/.test(base) ? "" : ".";
      return `${base}${needsPeriod} ${sentence} `;
    });
    setProposals((p) => p.filter((s) => s !== sentence));
    setMood("happy");
  };

  // Fresh ideas whenever the compose view opens.
  useEffect(() => {
    if (journalMode === "compose" && proposals.length === 0 && !proposalsLoading) {
      proposeSentences();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journalMode]);

  // -------------------------------------------------------------------------
  // In-shell video player: open a library video inside the shell — YouTube
  // player on top, tap-to-seek transcript below, synced highlighting.
  // -------------------------------------------------------------------------
  const openShellVideo = async (v: any) => {
    setShellVideo(v);
    setShellSegments(Array.isArray(v.processed_transcript) ? v.processed_transcript : []);
    setShellPlaying(false);
    setShellSlow(false);
    setShellTime(0);

    // No saved transcript → transcribe the audio now (and persist it when we
    // own the row, so next open is instant).
    if (!v.processed_transcript?.length && v.video_id) {
      setShellSegsLoading(true);
      try {
        const data: any = await transcribeMediaSource(youtubeSource(v.video_id), { language: v.language || language });
        const segs = (data?.transcript || []).map((s: any) => ({
          text: s.text,
          transliteration: s.text,
          english: "",
          start: s.start,
        }));
        setShellSegments(segs);
        if (segs.length > 0) {
          const entity = v._mine
            ? base44.entities.UserSavedVideo
            : currentUser?.role === "admin"
            ? base44.entities.MediaLibrary
            : null;
          if (entity) {
            entity.update(v.id, { processed_transcript: segs }).catch(() => {});
          }
        }
      } catch (e) {
        console.error(e);
      }
      setShellSegsLoading(false);
    }
  };

  const closeShellVideo = () => {
    try { shellPlayerRef.current?.destroy?.(); } catch (e) {}
    shellPlayerRef.current = null;
    if (shellTimerRef.current) { clearInterval(shellTimerRef.current); shellTimerRef.current = null; }
    setShellVideo(null);
    setShellSegments([]);
    setShellPlaying(false);
    setWordPopup(null);
  };

  // Create/destroy the YouTube player with the in-shell view.
  useEffect(() => {
    if (!shellVideo?.video_id) return;
    let cancelled = false;
    loadYouTubeApi().then((YT: any) => {
      if (cancelled) return;
      const container = document.getElementById("shell-yt-player");
      if (!container) return;
      try { shellPlayerRef.current?.destroy?.(); } catch (e) {}
      container.innerHTML = "";
      shellPlayerRef.current = new YT.Player("shell-yt-player", {
        videoId: shellVideo.video_id,
        playerVars: { enablejsapi: 1, autoplay: 0, controls: 1, rel: 0 },
        events: {
          onStateChange: (event: any) => setShellPlaying(event.data === 1),
        },
      });
    });
    // Poll the playhead to highlight + auto-scroll the active transcript line.
    shellTimerRef.current = setInterval(() => {
      const p = shellPlayerRef.current;
      if (p?.getCurrentTime) {
        try { setShellTime(p.getCurrentTime()); } catch (e) {}
      }
    }, 500);
    return () => {
      cancelled = true;
      if (shellTimerRef.current) { clearInterval(shellTimerRef.current); shellTimerRef.current = null; }
      try { shellPlayerRef.current?.destroy?.(); } catch (e) {}
      shellPlayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shellVideo?.id]);

  // Active segment index for highlight/sync.
  const activeSegIdx = useMemo(() => {
    if (!shellSegments.length) return -1;
    let idx = -1;
    for (let i = 0; i < shellSegments.length; i++) {
      if ((shellSegments[i].start ?? 0) <= shellTime) idx = i;
      else break;
    }
    return idx;
  }, [shellSegments, shellTime]);

  useEffect(() => {
    activeLineRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeSegIdx]);

  const toggleShellPlay = () => {
    const p = shellPlayerRef.current;
    if (!p) return;
    if (shellPlaying) p.pauseVideo?.();
    else p.playVideo?.();
  };

  // Turtle button = slow mode (the turtle finally gets a job).
  const toggleShellSlow = () => {
    const p = shellPlayerRef.current;
    const next = !shellSlow;
    setShellSlow(next);
    try { p?.setPlaybackRate?.(next ? 0.7 : 1); } catch (e) {}
  };

  const seekShellTo = (seconds: number, play = true) => {
    const p = shellPlayerRef.current;
    if (!p?.seekTo) return;
    p.seekTo(seconds, true);
    if (play) p.playVideo?.();
  };

  // Tap a word in the transcript: pause the video and open the popup with
  // sound / edit / add-to-backpack. The translation is looked up in context.
  const vidLang = shellVideo?.language || language;
  const tapTranscriptWord = async (key: string, token: string, sentence: string) => {
    if (wordPopup?.key === key) { setWordPopup(null); return; }
    const clean = cleanToken(token);
    if (!clean) return;
    shellPlayerRef.current?.pauseVideo?.();
    const already = (words as any[]).some(
      (w) => w.word === clean || (w.phonetic || "").toLowerCase() === clean.toLowerCase()
    );
    setWordPopup({ key, clean, sentence, translation: "", phonetic: "", loading: true, editing: false, saving: false, added: already });
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Translate the ${languageLabel(vidLang)} word "${clean}" as used in this sentence: "${sentence}". Return JSON with: translation (English meaning, 1-4 words), phonetic (Latin-letter transliteration of the word).`,
        response_json_schema: {
          type: "object",
          properties: { translation: { type: "string" }, phonetic: { type: "string" } },
        },
      });
      setWordPopup((p: any) =>
        p?.key === key ? { ...p, translation: result?.translation || "", phonetic: result?.phonetic || "", loading: false } : p
      );
    } catch {
      setWordPopup((p: any) => (p?.key === key ? { ...p, loading: false } : p));
    }
  };

  const speakPopupWord = () => {
    if (!wordPopup?.clean) return;
    generateLessonAudio({ text: wordPopup.clean, language: vidLang }).play();
  };

  const savePopupWord = async () => {
    if (!wordPopup || wordPopup.saving || wordPopup.added) return;
    setWordPopup((p: any) => ({ ...p, saving: true }));
    try {
      await base44.entities.Word.create({
        word: wordPopup.clean,
        translation: wordPopup.translation || "",
        phonetic: wordPopup.phonetic || wordPopup.clean,
        category: "wordbank",
        language: vidLang,
        times_practiced: 0,
        mastered: false,
        // The sentence the word came from travels with the card, so the
        // flashcard can play it back.
        example_sentence: wordPopup.sentence,
      });
      queryClient.invalidateQueries({ queryKey: ["wordRatings"] });
      setWordPopup((p: any) => (p ? { ...p, saving: false, added: true } : p));
      setMood("happy");
      toast.success("Added to backpack! 🎒");
    } catch (e: any) {
      setWordPopup((p: any) => (p ? { ...p, saving: false } : p));
      toast.error("Couldn't add the word");
    }
  };

  // -------------------------------------------------------------------------
  // In-shell add-video (Library tab). Admins write to the master library;
  // everyone else adds to their personal collection (which also lands in the
  // admin approval queue on the full library page).
  // -------------------------------------------------------------------------
  const loadLibMeta = async () => {
    const vid = extractYouTubeId(libForm.video_url || "");
    if (!vid) {
      toast.error("Paste a valid YouTube link first");
      return;
    }
    setLibLoadingMeta(true);
    try {
      const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(libForm.video_url)}&format=json`);
      const meta = await res.json();
      setLibForm((f: any) => ({ ...f, video_id: vid, title: f.title || meta.title || "" }));
      toast.success("Video info loaded!");
    } catch {
      // oEmbed can fail for some videos — the id alone is enough to save.
      setLibForm((f: any) => ({ ...f, video_id: vid }));
    }
    setLibLoadingMeta(false);
  };

  const saveLibVideo = async () => {
    const vid = libForm.video_id || extractYouTubeId(libForm.video_url || "");
    if (!vid) { toast.error("Paste a YouTube link first"); return; }
    if (!libForm.title.trim()) { toast.error("Title is required"); return; }
    setLibSaving(true);
    const data = {
      title: libForm.title.trim(),
      language: libForm.language || language,
      video_url: libForm.video_url,
      video_id: vid,
      topics: libForm.topics,
      difficulty_level: libForm.difficulty_level || "All",
      thumbnail_url: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
    };
    try {
      if (currentUser?.role === "admin") {
        await base44.entities.MediaLibrary.create({ ...data, is_active: true, tags: "", notes: "" });
      } else {
        await base44.entities.UserSavedVideo.create(data);
      }
      queryClient.invalidateQueries({ queryKey: ["mediaLibrary"] });
      queryClient.invalidateQueries({ queryKey: ["userSavedVideos"] });
      toast.success("Video added!");
      setLibForm(emptyLibForm);
      setLibAddOpen(false);
      setMood("happy");
    } catch (e: any) {
      console.error(e);
      toast.error(`Couldn't add the video: ${e?.message || "unknown error"}`);
    }
    setLibSaving(false);
  };

  const goalPct = goalDone / DAILY_GOAL;

  return (
    // Full dark backdrop with an iPhone-looking frame centered on it.
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-3 py-4">
      {/* Bezel */}
      <div className="relative w-full max-w-md rounded-[3rem] border border-slate-700 bg-slate-900 p-2.5 shadow-[0_0_80px_rgba(45,212,191,0.07)]">
        {/* Notch / dynamic island */}
        <div className="absolute left-1/2 top-4 z-20 h-6 w-28 -translate-x-1/2 rounded-full bg-slate-900" />
        {/* The phone screen: fixed height, no page scroll, menu pinned bottom. */}
        <div className="flex h-[min(820px,calc(100dvh-3.5rem))] w-full flex-col overflow-hidden rounded-[2.4rem] bg-[#eef4fb]">

        {/* Top bar: palette · language · stats (padded below the notch) */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200/70 bg-white/80 px-5 pb-2.5 pt-8">
          <Palette className="h-5 w-5 text-slate-300" />
          <button
            onClick={() => { setTab("account"); setLangPickerOpen(true); }}
            className="flex items-center gap-2 text-lg font-semibold text-slate-800"
          >
            <span className="text-xl">{LANGUAGE_FLAGS[language] || "🌍"}</span>
            <span className="capitalize">{language}</span>
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </button>
          <button onClick={() => { setTab("account"); }} aria-label="Stats">
            <BarChart3 className="h-5 w-5 text-slate-400 transition hover:text-slate-600" />
          </button>
        </div>

        {/* ================= BACKPACK (cards one by one) ================= */}
        {tab === "learning" && (
          <div className="flex min-h-0 flex-1 flex-col px-4 pt-3">
            {/* Compact header: streak · daily goal · stats */}
            <div className="flex flex-shrink-0 items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-2 shadow-sm">
              <span className="relative flex h-8 w-8 items-center justify-center">
                <span className="text-2xl leading-none">🔥</span>
                <span className="absolute top-2.5 text-[10px] font-bold text-white">{streak}</span>
              </span>
              <div className="flex items-center gap-3 text-center">
                {[
                  { label: "NEW", value: toLearn, color: "text-sky-500" },
                  { label: "LEARNING", value: practiced, color: "text-green-600" },
                  { label: "LEARNED", value: learned, color: "text-amber-500" },
                ].map((s) => (
                  <span key={s.label} className="flex flex-col">
                    <span className={`text-[9px] font-semibold tracking-wide ${s.color}`}>{s.label}</span>
                    <span className={`text-lg font-bold leading-tight ${s.color}`}>{s.value}</span>
                  </span>
                ))}
              </div>
              <span className="flex flex-col items-center">
                <span className="text-lg leading-none">🏕️</span>
                <span className="text-[10px] font-semibold text-orange-600">{goalDone}/{DAILY_GOAL}</span>
              </span>
            </div>

            {flashDeck.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                <Turtle mood={mood} size="text-6xl" />
                <p className="font-medium text-slate-700">No cards yet</p>
                <p className="px-6 text-sm text-slate-500">
                  Tap words in a video transcript or add them in the Journal — they become flashcards here.
                </p>
                <button
                  onClick={() => setTab("library")}
                  className="mt-1 rounded-full bg-sky-500 px-5 py-2.5 font-semibold text-white shadow"
                >
                  Watch a video
                </button>
              </div>
            ) : (
              <>
                {/* Pager */}
                <div className="mt-2 flex flex-shrink-0 items-center justify-between px-1">
                  <button
                    onClick={() => setCardIdx((i) => Math.max(0, i - 1))}
                    disabled={safeCardIdx === 0}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-1.5 text-lg font-bold text-slate-500 shadow-sm disabled:opacity-30"
                  >
                    ←
                  </button>
                  <span className="text-xs font-semibold text-slate-400">
                    {safeCardIdx + 1} / {flashDeck.length}
                  </span>
                  <button
                    onClick={() => setCardIdx((i) => Math.min(flashDeck.length - 1, i + 1))}
                    disabled={safeCardIdx >= flashDeck.length - 1}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-1.5 text-lg font-bold text-slate-500 shadow-sm disabled:opacity-30"
                  >
                    →
                  </button>
                </div>

                {/* The full WordCard flashcard (mnemonic image, ratings,
                    sentence with clickable words, edit-in-place, …) */}
                <div className="mt-2 flex min-h-0 flex-1 justify-center overflow-y-auto pb-3">
                  <div className="h-fit">
                    <WordCard
                      word={flashDeck[safeCardIdx]}
                      language={flashDeck[safeCardIdx]?.language || language}
                      showAllEnglish={showAllEnglish}
                      onEnglishToggle={() => setShowAllEnglish((v) => !v)}
                      onHebrewToggle={() => setShowHebrewCards((v) => !v)}
                      onScriptToggle={() => setShowHebrewCards((v) => !v)}
                      onTranslitToggle={() => setShowTranslitCards((v) => !v)}
                      showHebrew={showHebrewCards}
                      showTransliteration={showTranslitCards}
                      isContentEditable={(w: any) => !w.approved}
                      mnemonicExplanations={mnemonicExplanations}
                      setMnemonicExplanations={setMnemonicExplanations}
                      cardSentences={cardSentences}
                      generatingSentence={generatingSentence}
                      fetchingTranslation={{}}
                      suggestingMnemonic={suggestingMnemonic}
                      mnemonicQueue={emptyMnemonicQueue}
                      isAdmin={currentUser?.role === "admin"}
                      updateWordMutation={updateWordMutation}
                      handleRateWord={handleRateWord}
                      suggestMnemonicForWord={suggestMnemonicForWord}
                      approveWordMutation={approveWordMutation}
                      handleDismissWord={handleDismissWord}
                      deleteWordMutation={deleteWordMutation}
                      handleAddWordFromSentence={handleAddWordFromSentence}
                      generateCardSentence={generateCardSentence}
                      sessionTitleMap={{}}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ================= PRACTICE / JOURNAL ================= */}
        {tab === "practice" && journalMode !== "off" && (
          <div className="flex min-h-0 flex-1 flex-col px-4 pt-4">
            {/* Journal header */}
            <div className="flex flex-shrink-0 items-center gap-2">
              <button
                onClick={() => {
                  if (journalMode === "list") setJournalMode("off");
                  else setJournalMode("list");
                  setJournalSelected(null);
                }}
                aria-label="Back"
                className="rounded-lg p-1 text-slate-400 hover:bg-white hover:text-slate-700"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="text-lg font-bold text-slate-800">📓 Journal</span>
              {journalMode === "list" && (
                <button
                  onClick={() => { setJournalText(""); setJournalMode("compose"); }}
                  className="ml-auto flex items-center gap-1 rounded-full bg-teal-500 px-3 py-1.5 text-xs font-semibold text-white shadow"
                >
                  <Plus className="h-3.5 w-3.5" /> New entry
                </button>
              )}
            </div>

            {journalMode === "list" && (
              <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pb-3">
                {lessonEntries.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white/60 px-4 py-8 text-center">
                    <span className="text-3xl">📓</span>
                    <p className="text-sm font-medium text-slate-700">No entries yet</p>
                    <p className="text-xs text-slate-500">Write about your real life — it becomes a lesson you can use.</p>
                    <button
                      onClick={() => { setJournalText(""); setJournalMode("compose"); }}
                      className="mt-1 rounded-full bg-teal-500 px-4 py-2 text-sm font-semibold text-white shadow"
                    >
                      + New entry
                    </button>
                  </div>
                ) : (
                  lessonEntries.map((e: any) => (
                    <button
                      key={e.id}
                      onClick={() => {
                        if (e.lesson) { setJournalSelected(e); setJournalMode("lesson"); }
                        else { setJournalText(e.text || ""); setJournalMode("compose"); }
                      }}
                      className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition hover:shadow-md"
                    >
                      <span className="text-xl">{e.lesson ? "✨" : "✏️"}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-800">{e.title || deriveTitle(e.text)}</span>
                        <span className="block text-xs text-slate-400">{e.date || ""}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-400" />
                    </button>
                  ))
                )}
                {/* Newest backpack words */}
                {(words as any[]).length > 0 && (
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">🎒 Newest words in your backpack</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(words as any[])
                        .slice()
                        .sort((a, b) => new Date(b.created_date || 0).getTime() - new Date(a.created_date || 0).getTime())
                        .slice(0, 6)
                        .map((w) => (
                          <span key={w.id} className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700">
                            {w.phonetic || w.word} · {w.translation}
                          </span>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {journalMode === "compose" && (
              <div className="mt-3 flex min-h-0 flex-1 flex-col pb-3">
                <div className="flex flex-shrink-0 flex-wrap items-center gap-1.5">
                  {JOURNAL_TOPICS.map((t) => (
                    <button
                      key={t.label}
                      onClick={() => setJournalText((txt) => (txt ? txt : t.starter))}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 shadow-sm hover:border-teal-400"
                    >
                      {t.label}
                    </button>
                  ))}
                  {/* Lesson creation moved up here — the big CTA slot below now
                      belongs to the sentence-proposal cloud. */}
                  <button
                    onClick={generateJournalLesson}
                    disabled={journalBusy || !journalText.trim()}
                    className="ml-auto flex items-center gap-1 rounded-full bg-teal-500 px-3 py-1 text-xs font-semibold text-white shadow disabled:opacity-40"
                  >
                    {journalBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {journalBusy ? "Creating…" : "Lesson"}
                  </button>
                </div>
                <textarea
                  value={journalText}
                  onChange={(e) => setJournalText(e.target.value)}
                  placeholder="Write about your day in English or Hebrew…"
                  className="mt-2 min-h-0 w-full flex-1 resize-none rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-teal-500 focus:outline-none"
                />

                {/* Sentence-proposal cloud: the turtle "thinks up" sentences the
                    learner can tap to add to the entry. */}
                <div className="relative mt-4 flex-shrink-0">
                  {/* thought-bubble dots */}
                  <span className="absolute -top-3 left-8 h-2.5 w-2.5 rounded-full bg-white shadow-sm" />
                  <span className="absolute -top-1 left-12 h-3.5 w-3.5 rounded-full bg-white shadow-sm" />
                  <div className="rounded-[1.75rem] border border-slate-200 bg-white px-4 py-3 shadow-sm">
                    <div className="flex items-center justify-between">
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                        <span className="text-lg">🐢💭</span> Sentence ideas — tap to add
                      </p>
                      <button
                        onClick={proposeSentences}
                        disabled={proposalsLoading}
                        aria-label="New ideas"
                        className="rounded-full px-2 py-1 text-sm text-slate-400 transition hover:bg-slate-50 hover:text-teal-600 disabled:opacity-40"
                      >
                        {proposalsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "🔄"}
                      </button>
                    </div>
                    <div className="mt-2 space-y-1.5">
                      {proposalsLoading && proposals.length === 0 ? (
                        <p className="py-2 text-center text-xs text-slate-400">Thinking of ideas…</p>
                      ) : proposals.length === 0 ? (
                        <button
                          onClick={proposeSentences}
                          className="w-full rounded-xl border border-dashed border-slate-300 py-2.5 text-xs text-slate-500 hover:border-teal-400 hover:text-teal-600"
                        >
                          ☁️ Get sentence ideas
                        </button>
                      ) : (
                        proposals.map((s, i) => (
                          <button
                            key={`${i}_${s.slice(0, 12)}`}
                            onClick={() => addProposal(s)}
                            className="flex w-full items-center gap-2 rounded-xl bg-sky-50 px-3 py-2 text-left text-xs font-medium text-sky-800 transition hover:bg-sky-100"
                          >
                            <Plus className="h-3.5 w-3.5 flex-shrink-0 text-sky-500" />
                            <span className="min-w-0 flex-1">{s}</span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {journalMode === "lesson" && journalSelected && (
              // JournalLessonView is dark-themed; give it a dark inset "reader"
              // so it stays legible inside the light shell.
              <div className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-2xl bg-slate-900 p-4 pb-6">
                {journalSelected.lesson ? (
                  <JournalLessonView
                    lesson={journalSelected.lesson}
                    language={String(journalSelected.target_language || language).toLowerCase()}
                    journalEntryId={journalSelected.id}
                    libraryLessonId={journalSelected.library_item_id || undefined}
                  />
                ) : (
                  <p className="text-sm text-slate-400">This entry has no lesson yet.</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ================= PRACTICE ================= */}
        {tab === "practice" && journalMode === "off" && (
          <div className="flex min-h-0 flex-1 flex-col px-4 pt-5">
            {quiz.length === 0 && !quizLoading ? (
              <>
                <div className="flex flex-shrink-0 flex-col items-center text-center">
                  <Turtle mood={mood} size="text-5xl" />
                  <h2 className="mt-2 text-lg font-bold text-slate-800">Practice</h2>
                  <p className="mt-1 px-4 text-sm text-slate-500">
                    AI questions and exercises built from the newest words in your cards.
                  </p>
                </div>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={startQuiz}
                  className="mt-5 w-full flex-shrink-0 rounded-full bg-gradient-to-b from-green-400 to-green-500 py-3 text-lg font-semibold text-white shadow-lg shadow-green-500/30"
                >
                  Start exercises
                </motion.button>

                {/* Journal lives inside Practice — opens in-shell */}
                <button
                  onClick={() => setJournalMode("list")}
                  className="mt-4 flex flex-shrink-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left shadow-sm transition hover:shadow-md"
                >
                  <span className="text-2xl">📓</span>
                  <span className="flex-1">
                    <span className="block font-medium text-slate-800">Journal</span>
                    <span className="block text-xs text-slate-500">Write entries and turn them into lessons</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </button>

                <button
                  onClick={() => router.push("/practice")}
                  className="mt-3 flex flex-shrink-0 items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left shadow-sm transition hover:shadow-md"
                >
                  <span className="text-2xl">🗣️</span>
                  <span className="flex-1">
                    <span className="block font-medium text-slate-800">Chat &amp; speaking</span>
                    <span className="block text-xs text-slate-500">Talk with the AI assistant</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </button>
              </>
            ) : quizLoading ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3">
                <Turtle mood="idle" size="text-5xl" />
                <Loader2 className="h-6 w-6 animate-spin text-green-500" />
                <p className="text-sm text-slate-500">Building exercises from your cards…</p>
              </div>
            ) : quizDone ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                <Turtle mood={quizScore === quiz.length ? "cheer" : "happy"} size="text-6xl" />
                <h2 className="text-2xl font-bold text-slate-800">
                  {quizScore} / {quiz.length}
                </h2>
                <p className="text-sm text-slate-500">
                  {quizScore === quiz.length ? "Perfect! The turtle is thrilled! 🏆" : "Nice work — keep practicing!"}
                </p>
                <div className="mt-2 flex gap-2">
                  <button onClick={startQuiz} className="rounded-full bg-green-500 px-5 py-2.5 font-semibold text-white shadow">
                    Practice again
                  </button>
                  <button onClick={() => { setQuiz([]); setQuizDone(false); }} className="rounded-full border border-slate-300 bg-white px-5 py-2.5 font-semibold text-slate-600">
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex flex-shrink-0 items-center justify-between">
                  <span className="text-xs font-semibold text-slate-400">
                    {quizIdx + 1} / {quiz.length}
                  </span>
                  <button onClick={() => { setQuiz([]); setQuizAnswer(null); }} aria-label="Quit practice">
                    <X className="h-4 w-4 text-slate-400" />
                  </button>
                </div>
                <div className="mt-1 h-1.5 flex-shrink-0 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${((quizIdx + (quizAnswer !== null ? 1 : 0)) / quiz.length) * 100}%` }} />
                </div>

                <div className="mt-4 flex flex-shrink-0 items-start gap-3">
                  <Turtle mood={mood} size="text-4xl" />
                  <div className="relative flex-1 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                    <p className="text-sm font-medium text-slate-800">{quiz[quizIdx].prompt}</p>
                  </div>
                </div>

                <div className="mt-4 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pb-2">
                  {quiz[quizIdx].options.map((opt: string, i: number) => {
                    const isCorrect = i === quiz[quizIdx].correct_index;
                    const chosen = quizAnswer === i;
                    let cls = "border-slate-200 bg-white text-slate-800 hover:border-sky-400";
                    if (quizAnswer !== null) {
                      if (isCorrect) cls = "border-green-500 bg-green-50 text-green-700";
                      else if (chosen) cls = "border-red-400 bg-red-50 text-red-600";
                      else cls = "border-slate-200 bg-white text-slate-400";
                    }
                    return (
                      <button
                        key={i}
                        onClick={() => answerQuiz(i)}
                        disabled={quizAnswer !== null}
                        className={`flex-shrink-0 rounded-xl border-2 px-4 py-3 text-left text-sm font-medium shadow-sm transition ${cls}`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                  {quizAnswer !== null && (
                    <div className="flex-shrink-0 pb-1">
                      {quiz[quizIdx].explanation && (
                        <p className="mb-2 text-xs text-slate-500">{quiz[quizIdx].explanation}</p>
                      )}
                      <button onClick={nextQuiz} className="w-full rounded-full bg-sky-500 py-3 font-semibold text-white shadow">
                        {quizIdx + 1 >= quiz.length ? "Finish" : "Next"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= LIBRARY / VIDEO PLAYER ================= */}
        {tab === "library" && shellVideo && (
          <div className="flex min-h-0 flex-1 flex-col">
            {/* Header */}
            <div className="flex flex-shrink-0 items-center gap-2 px-4 pt-2 pb-2">
              <button
                onClick={closeShellVideo}
                aria-label="Back"
                className="rounded-lg p-1 text-slate-400 hover:bg-white hover:text-slate-700"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-800">{shellVideo.title}</span>
            </div>

            {/* Player */}
            <div className="relative w-full flex-shrink-0 bg-black" style={{ aspectRatio: "16/9" }}>
              <div id="shell-yt-player" className="h-full w-full" />
            </div>

            {/* Floating controls: play/pause + turtle slow mode */}
            <div className="relative z-10 -mt-5 flex flex-shrink-0 justify-center gap-3">
              <button
                onClick={toggleShellPlay}
                aria-label={shellPlaying ? "Pause" : "Play"}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-lg shadow-lg"
              >
                {shellPlaying ? "⏸️" : "▶️"}
              </button>
              <button
                onClick={toggleShellSlow}
                aria-label="Slow mode"
                className={`flex h-11 w-11 items-center justify-center rounded-full border text-lg shadow-lg transition ${
                  shellSlow ? "border-teal-500 bg-teal-50" : "border-slate-200 bg-white"
                }`}
              >
                🐢
              </button>
            </div>

            {/* Transcript — tap a line to jump there; active line highlighted */}
            <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-3 pb-3">
              {shellSegsLoading ? (
                <div className="flex flex-col items-center gap-2 py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
                  <p className="text-xs text-slate-500">Transcribing the audio… this can take a minute.</p>
                </div>
              ) : shellSegments.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-400">No transcript available for this video.</p>
              ) : (
                <div className="space-y-1">
                  {shellSegments.map((s: any, i: number) => {
                    const main = s.hebrew || s.transliteration || s.text || "";
                    const rtl = isRTLText(main);
                    const active = i === activeSegIdx;
                    const tokens = main.split(/\s+/).filter(Boolean);
                    return (
                      <div
                        key={i}
                        ref={active ? (activeLineRef as any) : null}
                        className={`flex w-full items-start gap-2 rounded-xl px-3 py-2.5 text-left transition ${
                          active ? "bg-white shadow-sm" : "hover:bg-white/60"
                        }`}
                      >
                        <button
                          onClick={() => seekShellTo(s.start ?? 0)}
                          aria-label="Play from here"
                          className={`mt-0.5 flex-shrink-0 text-sm ${active ? "text-sky-500" : "text-sky-300"}`}
                        >
                          🔊
                        </button>
                        <span className="min-w-0 flex-1">
                          <span
                            dir={rtl ? "rtl" : "ltr"}
                            className={`block text-[15px] leading-relaxed ${rtl ? "text-right" : ""} ${
                              active ? "font-semibold text-slate-900" : "text-slate-700"
                            }`}
                          >
                            {/* Tap a word → popup with sound / edit / backpack */}
                            {tokens.map((tok: string, wi: number) => {
                              const key = `${i}_${wi}`;
                              const open = wordPopup?.key === key;
                              return (
                                <span key={key} className="relative inline-block">
                                  <span
                                    onClick={(e) => { e.stopPropagation(); tapTranscriptWord(key, tok, main); }}
                                    className={`cursor-pointer rounded px-0.5 transition ${
                                      open ? "bg-sky-100 text-sky-800" : "hover:bg-sky-50"
                                    }`}
                                  >
                                    {tok}
                                  </span>
                                  {open && wordPopup && (
                                    <span
                                      dir="ltr"
                                      onClick={(e) => e.stopPropagation()}
                                      className="absolute bottom-full left-1/2 z-30 mb-1.5 block w-48 -translate-x-1/2 rounded-2xl border border-slate-200 bg-white p-2.5 text-left shadow-xl"
                                    >
                                      {wordPopup.editing ? (
                                        <span className="block space-y-1.5">
                                          <input
                                            value={wordPopup.clean}
                                            onChange={(e) => setWordPopup((p: any) => ({ ...p, clean: e.target.value }))}
                                            dir={rtl ? "rtl" : "ltr"}
                                            className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm font-semibold text-slate-800 focus:border-teal-500 focus:outline-none"
                                          />
                                          <input
                                            value={wordPopup.translation}
                                            onChange={(e) => setWordPopup((p: any) => ({ ...p, translation: e.target.value }))}
                                            placeholder="Meaning"
                                            className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 focus:border-teal-500 focus:outline-none"
                                          />
                                        </span>
                                      ) : (
                                        <span className="block">
                                          <span dir={rtl ? "rtl" : "ltr"} className="block text-sm font-bold text-slate-800">
                                            {wordPopup.clean}
                                          </span>
                                          {wordPopup.loading ? (
                                            <span className="block text-xs text-slate-400">translating…</span>
                                          ) : (
                                            <>
                                              {wordPopup.phonetic && <span className="block text-[11px] text-sky-600">{wordPopup.phonetic}</span>}
                                              <span className="block text-xs text-slate-500">{wordPopup.translation || "—"}</span>
                                            </>
                                          )}
                                        </span>
                                      )}
                                      <span className="mt-2 flex items-center justify-between">
                                        <button onClick={speakPopupWord} aria-label="Listen" className="rounded-lg p-1 text-base hover:bg-slate-50">
                                          🔊
                                        </button>
                                        <button
                                          onClick={() => setWordPopup((p: any) => ({ ...p, editing: !p.editing }))}
                                          aria-label="Edit"
                                          className={`rounded-lg p-1 text-base hover:bg-slate-50 ${wordPopup.editing ? "bg-slate-100" : ""}`}
                                        >
                                          ✏️
                                        </button>
                                        <button
                                          onClick={savePopupWord}
                                          aria-label="Add to backpack"
                                          disabled={wordPopup.saving}
                                          className="relative rounded-lg p-1 text-base hover:bg-slate-50 disabled:opacity-50"
                                        >
                                          🎒
                                          {wordPopup.added && (
                                            <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-white">
                                              ✓
                                            </span>
                                          )}
                                          {wordPopup.saving && (
                                            <Loader2 className="absolute -right-0.5 -top-0.5 h-3 w-3 animate-spin text-teal-500" />
                                          )}
                                        </button>
                                        <button onClick={() => setWordPopup(null)} aria-label="Close" className="rounded-lg p-1 text-xs text-slate-400 hover:bg-slate-50">
                                          ✕
                                        </button>
                                      </span>
                                      {/* bubble tail */}
                                      <span className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-b border-r border-slate-200 bg-white" />
                                    </span>
                                  )}
                                </span>
                              );
                            }).reduce((acc: any[], el: any, idx: number) => (idx === 0 ? [el] : [...acc, " ", el]), [])}
                          </span>
                          {s.english && (
                            <span className={`block text-xs text-slate-400 ${rtl ? "text-right" : ""}`}>{s.english}</span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= LIBRARY / ADD VIDEO ================= */}
        {tab === "library" && !shellVideo && libAddOpen && (
          <div className="flex min-h-0 flex-1 flex-col px-4 pt-4">
            <div className="flex flex-shrink-0 items-center gap-2">
              <button
                onClick={() => setLibAddOpen(false)}
                aria-label="Back"
                className="rounded-lg p-1 text-slate-400 hover:bg-white hover:text-slate-700"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="text-lg font-bold text-slate-800">➕ Add video</span>
            </div>
            <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pb-3">
              {/* YouTube link */}
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">YouTube link</label>
                <div className="flex gap-2">
                  <input
                    value={libForm.video_url}
                    onChange={(e) => setLibForm((f: any) => ({ ...f, video_url: e.target.value }))}
                    placeholder="https://youtube.com/watch?v=…"
                    className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-teal-500 focus:outline-none"
                  />
                  <button
                    onClick={loadLibMeta}
                    disabled={libLoadingMeta || !libForm.video_url}
                    className="flex-shrink-0 rounded-xl bg-teal-500 px-4 text-sm font-semibold text-white shadow disabled:opacity-40"
                  >
                    {libLoadingMeta ? <Loader2 className="h-4 w-4 animate-spin" /> : "Load"}
                  </button>
                </div>
              </div>

              {/* Thumbnail preview */}
              {libForm.video_id && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`https://i.ytimg.com/vi/${libForm.video_id}/hqdefault.jpg`}
                  alt=""
                  className="aspect-video w-full rounded-xl object-cover shadow-sm"
                  onError={(e: any) => { e.target.style.display = "none"; }}
                />
              )}

              {/* Title */}
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">Title</label>
                <input
                  value={libForm.title}
                  onChange={(e) => setLibForm((f: any) => ({ ...f, title: e.target.value }))}
                  placeholder="Video title"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-teal-500 focus:outline-none"
                />
              </div>

              {/* Language + difficulty */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">Language</label>
                  <select
                    value={libForm.language || language}
                    onChange={(e) => setLibForm((f: any) => ({ ...f, language: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm capitalize text-slate-800 shadow-sm focus:border-teal-500 focus:outline-none"
                  >
                    {Object.entries(LANGUAGE_FLAGS).map(([id, flag]) => (
                      <option key={id} value={id} className="capitalize">{flag} {id}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">Difficulty</label>
                  <select
                    value={libForm.difficulty_level}
                    onChange={(e) => setLibForm((f: any) => ({ ...f, difficulty_level: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm focus:border-teal-500 focus:outline-none"
                  >
                    {["Beginner", "Intermediate", "Advanced", "All"].map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Topics */}
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">Topics</label>
                <div className="flex flex-wrap gap-1.5">
                  {VIDEO_TOPICS.map((t) => {
                    const on = libForm.topics.includes(t);
                    return (
                      <button
                        key={t}
                        onClick={() =>
                          setLibForm((f: any) => ({
                            ...f,
                            topics: on ? f.topics.filter((x: string) => x !== t) : [...f.topics, t],
                          }))
                        }
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                          on
                            ? "border-teal-500 bg-teal-50 text-teal-700"
                            : "border-slate-200 bg-white text-slate-500 hover:border-teal-300"
                        }`}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={saveLibVideo}
                disabled={libSaving}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-b from-teal-400 to-teal-500 py-3 font-semibold text-white shadow-lg shadow-teal-500/30 disabled:opacity-50"
              >
                {libSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                {libSaving ? "Adding…" : currentUser?.role === "admin" ? "Add to library" : "Add to my library"}
              </button>
            </div>
          </div>
        )}

        {/* ================= LIBRARY ================= */}
        {tab === "library" && !shellVideo && !libAddOpen && (
          <div className="flex min-h-0 flex-1 flex-col px-4 pt-4">
            <div className="flex flex-shrink-0 items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">📚 Library</h2>
              <button
                onClick={() => { setLibForm({ ...emptyLibForm, language }); setLibAddOpen(true); }}
                className="rounded-full bg-teal-500 px-3 py-1.5 text-xs font-semibold text-white shadow"
              >
                + Add video
              </button>
            </div>
            <div className="mt-3 min-h-0 flex-1 overflow-y-auto pb-3">
              {shellVideos.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white/60 px-4 py-10 text-center">
                  <span className="text-3xl">📺</span>
                  <p className="text-sm font-medium text-slate-700">No videos yet</p>
                  <p className="text-xs text-slate-500">Add a YouTube video to start learning from real content.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {shellVideos.map((v: any) => {
                    const vid = v.video_id || "";
                    const thumb = v.thumbnail_url || (vid ? `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` : "");
                    return (
                      <button
                        key={`${v._mine ? "mine" : "cat"}_${v.id}`}
                        onClick={() => openShellVideo(v)}
                        className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition hover:shadow-md"
                      >
                        <div className="aspect-video w-full bg-slate-200">
                          {thumb && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={thumb} alt={v.title} className="h-full w-full object-cover" onError={(e: any) => { e.target.style.display = "none"; }} />
                          )}
                        </div>
                        <div className="p-2.5">
                          <p className="line-clamp-2 text-xs font-semibold leading-snug text-slate-800">{v.title}</p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1">
                            {v.difficulty_level && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">{v.difficulty_level}</span>}
                            {v.duration_minutes && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">{v.duration_minutes} min</span>}
                            {v._mine && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600">My video</span>}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= ACCOUNT ================= */}
        {tab === "account" && (
          <div className="flex min-h-0 flex-1 flex-col px-4 pt-6">
            <div className="flex flex-shrink-0 flex-col items-center text-center">
              <Turtle mood={mood} size="text-5xl" />
              <p className="mt-2 font-semibold text-slate-800">{currentUser?.full_name || currentUser?.email}</p>
              <p className="text-xs text-slate-400">{currentUser?.email}</p>
            </div>
            <div className="mt-5 space-y-2.5 overflow-y-auto pb-3">
              {/* Learning language — expandable picker (was the sidebar switcher) */}
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <button
                  onClick={() => setLangPickerOpen((o) => !o)}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
                >
                  <span className="text-2xl">{LANGUAGE_FLAGS[language] || "🌍"}</span>
                  <span className="flex-1">
                    <span className="block font-medium capitalize text-slate-800">{language}</span>
                    <span className="block text-xs text-slate-500">Learning language</span>
                  </span>
                  <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${langPickerOpen ? "rotate-180" : ""}`} />
                </button>
                {langPickerOpen && (
                  <div className="border-t border-slate-100 px-2 py-2">
                    {Object.entries(LANGUAGE_FLAGS).map(([id, flag]) => (
                      <button
                        key={id}
                        onClick={() => changeLanguageMutation.mutate(id)}
                        disabled={changeLanguageMutation.isPending}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-slate-50 ${
                          id === language ? "font-semibold text-teal-600" : "text-slate-700"
                        }`}
                      >
                        <span className="text-lg">{flag}</span>
                        <span className="flex-1 capitalize">{id}</span>
                        {id === language && <span className="text-xs">✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {[
                { emoji: "📈", label: "Progress", desc: "Streaks, words and study time", href: "/progress" },
                { emoji: "🗓️", label: "Schedule", desc: "Your sessions and daily tasks", href: "/learn/lessons/days" },
                { emoji: "⚙️", label: "Settings", desc: "Account and preferences", href: "/settings" },
                ...(currentUser && ["admin", "coach", "owner"].includes(currentUser.role)
                  ? [{ emoji: "🛠️", label: "Admin console", desc: "Manage your school", href: "/dashboard" }]
                  : []),
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={() => router.push(item.href)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-left shadow-sm transition hover:shadow-md"
                >
                  <span className="text-2xl">{item.emoji}</span>
                  <span className="flex-1">
                    <span className="block font-medium text-slate-800">{item.label}</span>
                    <span className="block text-xs text-slate-500">{item.desc}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </button>
              ))}
              <button
                onClick={() => base44.auth.logout()}
                className="flex w-full items-center gap-3 rounded-2xl border border-red-100 bg-white px-4 py-3.5 text-left shadow-sm transition hover:bg-red-50"
              >
                <span className="text-2xl">🚪</span>
                <span className="flex-1 font-medium text-red-500">Sign out</span>
              </button>
            </div>
          </div>
        )}

        {/* ================= BOTTOM MENU (pinned) ================= */}
        <div className="flex flex-shrink-0 items-center justify-around border-t border-slate-200 bg-white px-2 py-2">
          {[
            { key: "learning", emoji: "🎒", label: "BACKPACK", onTap: () => { closeShellVideo(); setTab("learning"); } },
            { key: "practice", emoji: "💬", label: "PRACTICE", onTap: () => { closeShellVideo(); setTab("practice"); setJournalMode("off"); } },
            { key: "library", emoji: "📚", label: "LIBRARY", onTap: () => { closeShellVideo(); setLibAddOpen(false); setTab("library"); } },
            { key: "account", emoji: "👤", label: "ACCOUNT", onTap: () => { closeShellVideo(); setTab("account"); } },
          ].map((t) => (
            <button
              key={t.key}
              onClick={t.onTap}
              className={`flex flex-col items-center gap-0.5 rounded-lg px-3 py-1 text-[10px] font-semibold tracking-wide ${
                tab === t.key ? "text-slate-900" : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <span className="text-xl">{t.emoji}</span>
              {t.label}
            </button>
          ))}
        </div>
        </div>
        {/* Home indicator */}
        <div className="mx-auto mt-2 h-1 w-28 rounded-full bg-slate-700" />
      </div>
    </div>
  );
}
