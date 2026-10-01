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

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { base44 as base44Client } from "@/api/base44Client";
const base44: any = base44Client;
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronRight, ChevronLeft, Plus, BarChart3, Loader2, X, Sparkles, Backpack, Route, Library, CircleUser, Play, Pause, RotateCcw, SkipBack, SkipForward, Languages, Check, FileText, Clock, Star, CaptionsOff } from "lucide-react";
import { toast } from "sonner";
import { languageLabel, isRTLText, usesNikud } from "@/lib/language";
import { mnemonicImagePrompt } from "@/lib/imageStyle";
import {
  MNEMONIC_EXPLANATION_RULE,
  ensureShortMnemonicExplanation,
  isShortMnemonicExplanation,
} from "@/lib/mnemonicExplanation";
import { generateLesson } from "@/lib/journal/generateLesson";
import JournalLessonView from "@/components/journal/JournalLessonView";
import WordCard from "@/components/backpack/WordCard";
import AddWordsSheet from "@/components/home/AddWordsSheet";
import PhotoWordCapture from "@/components/home/PhotoWordCapture";
import { transcribeMediaSource, youtubeSource, stripCaptionNoise } from "@/lib/transcription";
import { splitIntoSentences } from "@/lib/chapterSentences";
import { fetchLetrasLyrics } from "@/lib/lyrics";
import { buildLyricSegments, chapterContentKey, splitScriptLine } from "@/lib/songLyrics";
import { alignLinesToWords, fitSungLines, wordsFromFragments } from "@/lib/lyricAlign";

// The app teaches no Arabic — any Arabic script in a transcript is corruption
// left over from YouTube's wrong-language caption tracks (e.g. "[موسيقى]").
const ARABIC_RE = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]+/g;
const countArabic = (t: string) => (t.match(ARABIC_RE) || []).join("").length;
const countHebrew = (t: string) => (t.match(/[֐-׿]/g) || []).join("").length;
const scrubSegmentText = (t: any) =>
  stripCaptionNoise(String(t ?? "")).replace(ARABIC_RE, " ").replace(/\s+/g, " ").trim();
import { generateLessonAudio } from "@/lib/audio/lessonAudio";

// Strip punctuation from a tapped transcript token, keeping native letters.
const cleanToken = (t: string) => t.replace(/[.,!?;:"'()\[\]{}«»„“”…׀׃־]+/g, "").trim();

// Transliteration is where a small model fails in Hebrew (written without
// vowels, it guessed "Nikansta lekhayay" for נכנסת לחיי = "Nichnast lechayai").
// Translations shown to students use the stronger model, with the cheap one as
// a fallback so nothing is left untranslated if it errors.
const QUALITY_MODEL = "claude-opus-5-5"; // measured: Sonnet 5.5 still misreads forms (sheviatarti)
async function invokeQuality(args: any) {
  try { return await base44.integrations.Core.InvokeLLM({ ...args, model: QUALITY_MODEL }); }
  catch { return await base44.integrations.Core.InvokeLLM(args); }
}
// Simple style, like the lyric videos students compare with: no hyphens or
// apostrophes, one-letter prefixes joined to their word (Mark's choice).
const HEBREW_TRANSLIT_RULES = `Transliterate Hebrew exactly as it is pronounced in modern Israeli Hebrew (for song lyrics, as it is sung), in a simple everyday style: "ch" for ח and for כ without dagesh, "tz" for צ, "sh" for ש, every vowel that is actually spoken, and no hyphens or apostrophes. Work out each word's grammatical form from the context (person, gender, tense) before transliterating it, and use its real pronunciation, never a letter-by-letter guess. Keep one Latin word per Hebrew word, with a one-letter prefix (ו ה ב כ ל מ ש) joined to its word. Examples: נכנסת לחיי = nichnast lechayai; לפני שוויתרתי = lifnei shevitarti; הערת את הלב בים של צבעים = heart et halev beyam shel tzvaim; בן אדם, מה לך נרדם = ben adam, ma lecha nirdam.`;
const translitRules = (label: string) => (/hebrew/i.test(label) ? `
${HEBREW_TRANSLIT_RULES}` : "");

// Chapter sentences carry a gloss per word ({ w, phonetic, meaning }), made
// with the sentence translation, so a tapped word shows its meaning at once.
const glossPrompt = (label: string, texts: string[]) => `For each ${label} sentence below give its Latin-letter transliteration, a natural English translation, and every word of it (split on spaces, in order) with its transliteration and its English meaning in this context (1-4 words).${translitRules(label)}
${texts.map((t, i) => `${i}: ${t}`).join("\n")}
Return JSON: { "items": [ { "i": number, "transliteration": string, "english": string, "words": [ { "w": the word exactly as written, "phonetic": string, "meaning": string } ] } ] }`;
const GLOSS_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          i: { type: "number" },
          transliteration: { type: "string" },
          english: { type: "string" },
          words: { type: "array", items: { type: "object", properties: { w: { type: "string" }, phonetic: { type: "string" }, meaning: { type: "string" } } } },
        },
      },
    },
  },
};
const cleanGlosses = (words: any) =>
  (Array.isArray(words) ? words : [])
    .filter((g: any) => g?.w && g?.meaning)
    .map((g: any) => ({ w: String(g.w), phonetic: String(g.phonetic || ""), meaning: String(g.meaning) }));
const normGloss = (t: string) => cleanToken(t || "").replace(/[\u0591-\u05C7]/g, "");
// An averaged colour is muddy; keep its hue but give it some saturation and a
// mid lightness so the tinted screens read as "the cover's colour".
function vividTint(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h = 0;
  const d = mx - mn;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  let l = (mx + mn) / 2;
  let sat = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  sat = Math.min(0.5, Math.max(sat, 0.28));
  l = Math.min(0.55, Math.max(l, 0.42));
  const c = (1 - Math.abs(2 * l - 1)) * sat, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [R, G, B] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return `${Math.round((R + m) * 255)},${Math.round((G + m) * 255)},${Math.round((B + m) * 255)}`;
}

// A YouTube title ("Avinu Music & Productions - Chaim Shelly Lyrics - Mark
// Levine cover") turned into what the designs show: a short name in Latin
// letters ("Chaim Shelly"), a subtitle (artist, or a short description for a
// lesson) and whether it's a song or a lesson. Asked once per video and kept in
// the browser; the full title shows until then.
type VideoMeta = { name: string; artist: string; kind: "song" | "lesson" };
const META_KEY = (vid: string) => `bp_meta_v2_${vid}`;
const metaInflight = new Map<string, Promise<VideoMeta | null>>();
const readMeta = (vid?: string): VideoMeta | null => {
  if (!vid) return null;
  try { return JSON.parse(localStorage.getItem(META_KEY(vid)) || "null"); } catch { return null; }
};
const clean = (t: any) => {
  const v = String(t || "").trim();
  return /^(<?unknown>?|n\/a|none|null|all|-)$/i.test(v) ? "" : v;
};
function fetchVideoMeta(video: any): Promise<VideoMeta | null> {
  const vid = video?.video_id;
  if (!vid || !video?.title) return Promise.resolve(null);
  const cached = readMeta(vid);
  if (cached) return Promise.resolve(cached);
  if (!metaInflight.has(vid)) {
    metaInflight.set(vid, base44.integrations.Core.InvokeLLM({
      prompt: `A YouTube video in a language-learning app. Title: "${video.title}". Return JSON:
- "name": the song or lesson name only, in Latin letters: the English title if the title gives one, else a transliteration. No channel name, "lyrics", "official video" or production credits. Short (1-5 words).
- "artist": for a song, the performer in Latin letters (keep words like "cover"), then " · " and the song name in its original script if that script isn't Latin. For a lesson, a short description (2-5 words, e.g. "Easy Hebrew for beginners"). Never "unknown".
- "kind": "song" or "lesson".
Examples: "שמואל - תן לי תפילה | Shmuel - Give Me One Prayer" -> {"name":"Give Me One Prayer","artist":"Shmuel · תן לי תפילה","kind":"song"}; "Avinu Music & Productions - Chaim Shelly Lyrics - Mark Levine cover" -> {"name":"Chaim Shelly","artist":"Mark Levine cover","kind":"song"}.`,
      response_json_schema: {
        type: "object",
        properties: { name: { type: "string" }, artist: { type: "string" }, kind: { type: "string", enum: ["song", "lesson"] } },
      },
    })
      .then((r: any) => {
        const name = clean(r?.name);
        if (!name) return null;
        const meta: VideoMeta = { name, artist: clean(r?.artist), kind: r?.kind === "song" ? "song" : "lesson" };
        try { localStorage.setItem(META_KEY(vid), JSON.stringify(meta)); } catch {}
        return meta;
      })
      .catch(() => null)
      .finally(() => metaInflight.delete(vid)));
  }
  return metaInflight.get(vid)!;
}
function useDisplayTitle(video: any) {
  const [meta, setMeta] = useState<VideoMeta | null>(() => readMeta(video?.video_id));
  useEffect(() => {
    let off = false;
    setMeta(readMeta(video?.video_id));
    fetchVideoMeta(video).then((m) => { if (!off && m) setMeta(m); });
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video?.video_id, video?.title]);
  return meta;
}
// The same for a list (Library filters need every video's kind).
function useVideoMetas(videos: any[]) {
  const [metas, setMetas] = useState<Record<string, VideoMeta>>({});
  const ids = videos.map((v) => v?.video_id).filter(Boolean).join(",");
  useEffect(() => {
    let off = false;
    const start: Record<string, VideoMeta> = {};
    for (const v of videos) { const m = readMeta(v?.video_id); if (m) start[v.video_id] = m; }
    setMetas(start);
    for (const v of videos) {
      if (!v?.video_id || start[v.video_id]) continue;
      fetchVideoMeta(v).then((m) => { if (!off && m) setMetas((prev) => ({ ...prev, [v.video_id]: m })); });
    }
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);
  return metas;
}

// "No pausing": a pause sign struck through.
const NoPauseIcon = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className={className} aria-hidden="true">
    <path d="M9 6v12M15 6v12M4 4l16 16" />
  </svg>
);

// The cover's average colour (like Spotify's now-playing screen), as "r,g,b".
// YouTube thumbnails are served with CORS, so the canvas can read them.
function useCoverTint(videoId?: string) {
  const [tint, setTint] = useState<string | null>(null);
  useEffect(() => {
    setTint(null);
    if (!videoId) return;
    let off = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = 32; c.height = 18;
        const ctx = c.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, 32, 18);
        const d = ctx.getImageData(0, 0, 32, 18).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) {
          const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
          if (mx < 35 || mn > 230) continue; // skip black bars and blown-out white
          const w = 1 + (mx - mn) / 48;       // favour coloured pixels over grey
          r += d[i] * w; g += d[i + 1] * w; b += d[i + 2] * w; n += w;
        }
        if (n && !off) setTint(vividTint(r / n, g / n, b / n));
      } catch {}
    };
    img.src = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
    return () => { off = true; };
  }, [videoId]);
  return tint;
}
// A chapter's position in the 4-step PATH: 1–4, or 5 when it's complete.
const chapterStep = (p: any) =>
  !p?.baseline_score ? 1 : !p.discovery_completed_at ? 2 : !p.comprehension_completed_at ? 3 : !p.final_score ? 4 : 5;
const fmtMinutes = (m: any) => {
  const sec = Math.round(Number(m) * 60);
  return sec > 0 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}` : "";
};
const fmtTime = (sec: number) => {
  const t = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

const findGloss = (words: any[] | undefined, token: string) => {
  const t = normGloss(token);
  return t ? (words || []).find((g: any) => normGloss(g.w) === t) || null : null;
};

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

// Suggested YouTube searches per learning language (first chip is in the
// target language — searching natively finds better material).
const SEARCH_CHIPS: Record<string, string[]> = {
  hebrew: ["שיחה קלה, הגייה בעברית", "Hebrew language lesson", "Hebrew for beginners"],
  spanish: ["Conversación fácil en español", "Spanish language lesson", "Spanish for beginners"],
  english: ["Easy English conversation", "English language lesson", "English for beginners"],
  french: ["Conversation facile en français", "French language lesson", "French for beginners"],
  portuguese: ["Conversa fácil em português", "Portuguese language lesson", "Portuguese for beginners"],
  italian: ["Conversazione facile in italiano", "Italian language lesson", "Italian for beginners"],
};

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
  // Sign-in lands on the PATH: the video journey is the first thing a student
  // sees (product decision — thumbnails → video + transcript).
  const [tab, setTab] = useState<"learning" | "practice" | "path" | "library" | "account">("path");
  // Videos the user has opened on this device — drives the Path's progress.
  const [watchedIds, setWatchedIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try { return new Set(JSON.parse(localStorage.getItem("watchedShellVideos") || "[]")); } catch { return new Set(); }
  });

  // PATH chapters: step 1 "Watch for Meaning" is shown the first time a video is
  // opened from the path; its "How much did you understand?" answer is the
  // chapter's baseline score (chapter_progress, migration 1600).
  const [chapterWatch, setChapterWatch] = useState<any>(null);
  // Step 2 "Sentence-by-Sentence Discovery": runs inside the in-shell video view.
  const [discovery, setDiscovery] = useState(false); // a sentence-by-sentence pass is on
  // Which pass: step 2 "discovery" (words tappable) or step 3 "comprehension"
  // (less help: translation hidden, words not tappable).
  const [passKind, setPassKind] = useState<"discovery" | "comprehension">("discovery");
  // Step 4 "Final Uninterrupted Pass" and the Before → After result.
  const [chapterFinal, setChapterFinal] = useState<any>(null);
  const [chapterResult, setChapterResult] = useState<{ title: string; before: number; after: number } | null>(null);
  const [discIdx, setDiscIdx] = useState(0);
  const [discRevealed, setDiscRevealed] = useState(false);
  const [discTranslations, setDiscTranslations] = useState<Record<number, { english: string; phonetic: string }>>({});
  const [discTranslating, setDiscTranslating] = useState(false);
  const discStopAtRef = useRef<number | null>(null);
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
  // Per-proposal target-language translations, keyed by the English sentence.
  const [proposalTranslations, setProposalTranslations] = useState<Record<string, { text?: string; translit?: string; loading?: boolean }>>({});
  // In-shell video player (Library tab): selected video, its transcript
  // segments, playback state for line-syncing, and the turtle slow mode.
  const [shellVideo, setShellVideo] = useState<any>(null);
  const [shellSegments, setShellSegments] = useState<any[]>([]);
  const [shellSegsLoading, setShellSegsLoading] = useState(false);
  const [shellPlaying, setShellPlaying] = useState(false);
  // Until the video has played once, YouTube shows its own thumbnail (often
  // with other lyric lines printed on it): the sentence frame stays dark.
  const [shellStarted, setShellStarted] = useState(false);
  const [shellSlow, setShellSlow] = useState(false);
  const [shellTime, setShellTime] = useState(0);
  // Transcript row visibility toggles (translation / transliteration)
  const [shellShowEnglish, setShellShowEnglish] = useState(true);
  const [shellShowTranslit, setShellShowTranslit] = useState(true);
  const [lyricsImporting, setLyricsImporting] = useState(false);
  const shellPlayerRef = React.useRef<any>(null);
  const shellTimerRef = React.useRef<any>(null);
  const activeLineRef = React.useRef<HTMLButtonElement | null>(null);
  // Transliteration repair bookkeeping: which video is open, and whether a
  // repair pass is already running (one per open).
  const shellVideoIdRef = React.useRef<any>(null);
  const shellRepairRef = React.useRef(false);

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

  // Library tab add-flow: search YouTube (query or pasted link, with topic
  // suggestion chips) → results by popularity → publish screen (level+topics).
  const [libView, setLibView] = useState<"grid" | "search" | "publish">("grid");
  const [libFilter, setLibFilter] = useState<"all" | "song" | "lesson" | "mine">("all");
  const [libSearch, setLibSearch] = useState("");
  const [libResults, setLibResults] = useState<any[]>([]);
  const [libSearching, setLibSearching] = useState(false);
  const [libPick, setLibPick] = useState<any>(null);
  const [libLevel, setLibLevel] = useState("Beginner");
  const [libTopics, setLibTopics] = useState<string[]>([]);
  const [libLang, setLibLang] = useState("");
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

  const { data: chapterProgress = [] } = useQuery({
    queryKey: ["chapterProgress", currentUser?.email],
    queryFn: () => base44.entities.ChapterProgress.filter({ created_by: currentUser.email }),
    enabled: !!currentUser?.email,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const chapterByVideo = useMemo(
    () => new Map((chapterProgress as any[]).map((p: any) => [p.video_id, p])),
    [chapterProgress]
  );

  const { data: words = [] } = useQuery({
    queryKey: ["wordRatings", language, currentUser?.email],
    queryFn: () => base44.entities.Word.filter({ category: "wordbank", language, created_by: currentUser.email }),
    enabled: !!userProfile && !!currentUser?.email,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Library tab: master-library videos in the learner's language + their own
  // personal videos, rendered as thumbnails inside the shell.
  // Fetched whenever the user is signed in (not just on the Library tab):
  // the PATH tab is the landing surface and builds its journey from these.
  const { data: libraryVideos = [] } = useQuery({
    queryKey: ["mediaLibrary"],
    queryFn: () => base44.entities.MediaLibrary.list(),
    enabled: !!currentUser,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const { data: myVideos = [] } = useQuery({
    queryKey: ["userSavedVideos", currentUser?.email],
    queryFn: () => base44.entities.UserSavedVideo.list(),
    enabled: !!currentUser,
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
    // Highlight the tapped number immediately instead of after the round-trip
    // (~1 s), so the rating doesn't look ignored; roll back if the save fails.
    const key = ["wordRatings", language, currentUser?.email];
    const previous = queryClient.getQueryData(key);
    queryClient.setQueryData(key, (old: any) =>
      Array.isArray(old)
        ? old.map((w: any) => (w.id === wordId ? { ...w, times_practiced: rating, mastered: rating >= 5 } : w))
        : old
    );
    try {
      await updateWordMutation.mutateAsync({
        id: wordId,
        data: { times_practiced: rating, mastered: rating >= 5 },
      });
      setMood(rating >= 5 ? "cheer" : "happy");
    } catch {
      queryClient.setQueryData(key, previous);
    }
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

STEP 1 — SOUND MATCH (BEGINNING OF THE WORD): Find a real, common English noun that sounds like the BEGINNING — the first 1-2 syllables — of "${targetWord}". The match must be to how the word STARTS when spoken aloud; never anchor on the middle or end. Examples: "chatunah" → "HAT" (cha-tunah opens like "hat"), "shalom" → "shallow", "kelev" → "collar", "askeem" → "eskimo". PRONUNCIATION RULE for Hebrew: the "ch"/"kh" sound (ח/כ) is a breathy H — treat it as English "h" (so "chatunah" starts like "hat", "chaver" like "have"), NEVER as the "ch" in "chair" and NEVER as "k"/"c" (do NOT turn "chatunah" into "cat"). The noun must be a physical, concrete, everyday object or creature. IMPORTANT: Do NOT use colors (like ivory, red, blue, gold, etc.) as the sound anchor — use objects or animals only.

STEP 2 — SCENE: Place that physical noun object in a funny visual scene that ALSO shows the meaning "${meaning}". The object itself (not speech bubbles, not labels) should remind you of the sound. The MEANING "${meaning}" must be the BIG, obvious visual focus of the scene; the sound-anchor object is only a supporting prop inside it. Keep the scene MODERN, timeless and child-friendly — NEVER use historical/period or violent settings (no medieval, knights, soldiers, armor, battlefield, war, ancient, Victorian). If the sound-anchor would normally be historical or military (e.g. "armor"), reimagine it as a cute, modern, harmless cartoon version. NEVER write art-style or realism words (like "medieval", "realistic", "photograph", "oil painting", "cinematic", "render", "3D") inside the description — describe only WHAT happens, not how it is drawn.

CRITICAL: Do NOT name any character, creature, animal, or person in the scene with the sound-anchor word, the target word, or any variant. They are just generic characters performing the action.

STEP 3 — The image must show the OBJECT doing something related to the meaning. NO speech bubbles, NO text, NO characters speaking or calling out. PURE VISUAL ACTION ONLY — no mouths open to speak, no gesturing as if calling out.

Return JSON:
- sound_anchor: the English noun that sounds like "${targetWord}"
- explanation: ${MNEMONIC_EXPLANATION_RULE}
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

      const explanation = await ensureShortMnemonicExplanation(concept.explanation);
      setMnemonicExplanations((prev: any) => ({ ...prev, [word.id]: explanation }));
      await updateWordMutation.mutateAsync({
        id: word.id,
        data: { image_url: imageResult.url, mnemonic_explanation: explanation },
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

  // Deck for the one-by-one pager: new cards first, then by level — sorted once,
  // then kept in that order while the student studies. Re-sorting after every
  // rating moved the rated card away and put a different word under the same
  // "1 / 16", so it looked like the rating hadn't saved. Cards added later join
  // at the end; deleted/dismissed ones drop out. Switching language re-sorts.
  // Backpack opens on a deck menu: "Practice all" + one deck per source video
  // + "Other words". null = menu; "all"; "yt:<youtubeId>"; "other".
  const [deckKey, setDeckKey] = useState<string | null>(null);
  const openDeck = (key: string | null) => {
    setDeckKey(key);
    setCardIdx(0);
  };
  useEffect(() => {
    setDeckKey(null);
  }, [language]);

  // Words still waiting for the Learn/Skip decision, or skipped, aren't studied.
  const inStudy = (w: any) => w.learn_status !== "new" && w.learn_status !== "skipped";
  const newWords = useMemo(() => (words as any[]).filter((w) => w.learn_status === "new"), [words]);
  const [triageOpen, setTriageOpen] = useState(false);

  const backpackDecks = useMemo(() => {
    const visible = (words as any[]).filter((w) => !dismissedCards.has(w.id) && inStudy(w));
    const byVideo = new Map<string, { key: string; videoId: string; title: string; words: any[]; latest: string }>();
    const other: any[] = [];
    for (const w of visible) {
      const vid = w.source_video_id;
      if (!vid) { other.push(w); continue; }
      let g = byVideo.get(vid);
      if (!g) {
        g = { key: `yt:${vid}`, videoId: vid, title: w.source_video_title || "Video", words: [], latest: "" };
        byVideo.set(vid, g);
      }
      g.words.push(w);
      const at = String(w.created_date || "");
      if (at > g.latest) g.latest = at;
    }
    const videos = Array.from(byVideo.values()).sort((a, b) => b.latest.localeCompare(a.latest));
    return { all: visible, videos, other };
  }, [words, dismissedCards]);

  const deckTitle =
    deckKey === "all" ? "All flashcards"
    : deckKey === "other" ? "Other words"
    : backpackDecks.videos.find((g) => g.key === deckKey)?.title || "Video";

  const deckOrderRef = useRef<{ language: string; ids: any[] }>({ language: "", ids: [] });
  const flashDeck = useMemo(() => {
    const visible = (words as any[]).filter(
      (w) =>
        !dismissedCards.has(w.id) &&
        inStudy(w) &&
        (deckKey === null || deckKey === "all"
          ? true
          : deckKey === "other"
          ? !w.source_video_id
          : w.source_video_id === deckKey.slice(3))
    );
    const byLevel = (a: any, b: any) =>
      (a.times_practiced || 0) - (b.times_practiced || 0) ||
      (a.phonetic || a.word || "").localeCompare(b.phonetic || b.word || "");
    const order = deckOrderRef.current;
    const orderKey = `${language}|${deckKey}`;
    if (order.language !== orderKey) {
      order.language = orderKey;
      order.ids = [];
    }
    const byId = new Map(visible.map((w) => [w.id, w]));
    const kept = order.ids.filter((id) => byId.has(id));
    const keptSet = new Set(kept);
    const added = visible.filter((w) => !keptSet.has(w.id)).sort(byLevel).map((w) => w.id);
    order.ids = [...kept, ...added];
    return order.ids.map((id) => byId.get(id));
  }, [words, dismissedCards, language, deckKey]);
  const safeCardIdx = Math.min(cardIdx, Math.max(0, flashDeck.length - 1));

  // Safety net: many save paths (journal, songs, translator, older video
  // flows…) create a word without an image. When such a card is shown in
  // Backpack, generate its AI mnemonic once. Reviewed cards (approved /
  // rejected) are left untouched.
  const autoImageTried = useRef<Set<any>>(new Set());
  const currentCard: any = flashDeck[safeCardIdx];
  useEffect(() => {
    const w = currentCard;
    if (tab !== "learning" || deckKey === null || !w?.id || w.image_url || w.review_status || w.approved) return;
    if (suggestingMnemonic || autoImageTried.current.has(w.id)) return;
    autoImageTried.current.add(w.id);
    suggestMnemonicForWord(w);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, deckKey, currentCard?.id, currentCard?.image_url, suggestingMnemonic]);

  // Older cards may carry a long 💡 explanation (2–3 lines). When one is shown,
  // rewrite it once into a complete sentence of at most 9 words and save it.
  // Approved/rejected cards are locked and left as they are.
  // Three short usage examples per card (shown under the word, phonetic on
  // top). Generated once when a card without them is shown, then saved on the
  // word (usage_examples, migration 1500) so they aren't regenerated each visit.
  const examplesTried = useRef<Set<any>>(new Set());
  const [generatingExamples, setGeneratingExamples] = useState<Record<string, boolean>>({});
  const generateUsageExamples = async (word: any) => {
    setGeneratingExamples((prev) => ({ ...prev, [word.id]: true }));
    try {
      const lang = word.language || language;
      const label = languageLabel(lang);
      const nativeWord = word.word && word.word !== word.phonetic ? word.word : null;
      const result: any = await base44.integrations.Core.InvokeLLM({
        prompt: `You are an expert ${label} teacher writing usage examples for a flashcard.

TARGET WORD: ${nativeWord ? `${label}: "${nativeWord}"` : ""} Transliteration: "${word.phonetic || word.word}" | English meaning: "${word.translation || ""}"

Write 3 DIFFERENT, natural, everyday modern ${label} sentences that use this word (or its correctly conjugated/declined form).
Rules:
- Each sentence 3 to 6 words, simple enough for a learner, each showing a different typical use.
- Standard modern written ${label} (${usesNikud(lang) ? "no nikud" : "native spelling"}).
- The English translation must say exactly the same as the ${label} sentence.
- "words" maps 1-to-1, in order, to the ${label} words of the sentence, each with its transliteration and English meaning.

Return JSON: { "examples": [ { "hebrew_sentence": the sentence in ${label} script, "transliteration": the whole sentence in Latin letters, "english": its translation, "words": [ { "hebrew": word in ${label} script, "word": its transliteration, "meaning": its English meaning } ] } ] }`,
        response_json_schema: {
          type: "object",
          properties: {
            examples: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  hebrew_sentence: { type: "string" },
                  transliteration: { type: "string" },
                  english: { type: "string" },
                  words: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: { hebrew: { type: "string" }, word: { type: "string" }, meaning: { type: "string" } },
                    },
                  },
                },
              },
            },
          },
        },
      });
      const examples = (result?.examples || [])
        .filter((e: any) => e?.hebrew_sentence && e?.transliteration)
        .slice(0, 3);
      if (examples.length) {
        await updateWordMutation.mutateAsync({ id: word.id, data: { usage_examples: examples } });
      }
    } catch (e) {
      console.error("[usage examples] generation failed", e);
    }
    setGeneratingExamples((prev) => {
      const next = { ...prev };
      delete next[word.id];
      return next;
    });
  };
  useEffect(() => {
    const w = currentCard;
    if (tab !== "learning" || deckKey === null || !w?.id || String(w.id).startsWith("session_")) return;
    if (Array.isArray(w.usage_examples) && w.usage_examples.length) return;
    if (examplesTried.current.has(w.id)) return;
    examplesTried.current.add(w.id);
    generateUsageExamples(w);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, deckKey, currentCard?.id]);

  const shortenTried = useRef<Set<any>>(new Set());
  useEffect(() => {
    const w = currentCard;
    if (tab !== "learning" || deckKey === null || !w?.id || w.review_status || w.approved) return;
    if (!w.mnemonic_explanation || isShortMnemonicExplanation(w.mnemonic_explanation)) return;
    if (shortenTried.current.has(w.id)) return;
    shortenTried.current.add(w.id);
    ensureShortMnemonicExplanation(w.mnemonic_explanation).then((short) => {
      if (!short || !isShortMnemonicExplanation(short)) return;
      setMnemonicExplanations((prev: any) => ({ ...prev, [w.id]: short }));
      updateWordMutation.mutate({ id: w.id, data: { mnemonic_explanation: short } });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, deckKey, currentCard?.id, currentCard?.mnemonic_explanation]);

  // "+" above the flashcard: type one or many words → one card each. After a
  // save, jump to the first new card once the refetched deck contains it.
  const [addWordsOpen, setAddWordsOpen] = useState(false);
  const [jumpToWordId, setJumpToWordId] = useState<string | null>(null);
  useEffect(() => {
    if (!jumpToWordId) return;
    const idx = flashDeck.findIndex((w: any) => w.id === jumpToWordId);
    if (idx >= 0) { setCardIdx(idx); setJumpToWordId(null); }
  }, [jumpToWordId, flashDeck]);

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
      // The 1–5 level is the student's own rating; the quiz no longer changes it.
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
  // Translate a proposed English sentence into the learning language, shown
  // inline under the sentence (native script + transliteration).
  const translateProposal = async (sentence: string) => {
    const existing = proposalTranslations[sentence];
    if (existing?.loading || existing?.text) return;
    setProposalTranslations((m) => ({ ...m, [sentence]: { loading: true } }));
    try {
      const label = languageLabel(language);
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Translate this sentence into natural, simple ${label}: "${sentence}". Return JSON with: translation (the sentence in ${label} native script), transliteration (the full sentence in Latin letters, natural pronunciation).`,
        response_json_schema: {
          type: "object",
          properties: { translation: { type: "string" }, transliteration: { type: "string" } },
        },
      });
      setProposalTranslations((m) => ({
        ...m,
        [sentence]: { text: result?.translation || "", translit: result?.transliteration || "" },
      }));
    } catch {
      setProposalTranslations((m) => ({ ...m, [sentence]: {} }));
      toast.error("Couldn't translate — try again.");
    }
  };

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
  // From the PATH: a chapter without a baseline starts with step 1.
  const openChapter = (v: any) => {
    const progress = v?.video_id ? chapterByVideo.get(v.video_id) : null;
    if (!v?.video_id) { openShellVideo(v); return; }
    if (!progress?.baseline_score) setChapterWatch(v);                         // 1 · Watch for meaning
    else if (!progress.discovery_completed_at) startPass(v, "discovery");      // 2 · Discovery
    else if (!progress.comprehension_completed_at) startPass(v, "comprehension"); // 3 · Comprehension
    else if (!progress.final_score) setChapterFinal(v);                       // 4 · Final pass
    else startPass(v, null);                                                   // chapter done: plain view
  };
  const startPass = (v: any, kind: "discovery" | "comprehension" | null, markWatched = true) => {
    setDiscovery(kind !== null);
    if (kind) setPassKind(kind);
    setDiscIdx(0);
    setDiscRevealed(false);
    setDiscTranslations({});
    openShellVideo(v, markWatched);
  };
  const saveChapterBaseline = async (v: any, score: number) => {
    const existing = chapterByVideo.get(v.video_id);
    const data = { baseline_score: score, baseline_at: new Date().toISOString(), video_title: v.title || null };
    try {
      if (existing?.id) await base44.entities.ChapterProgress.update(existing.id, data);
      else await base44.entities.ChapterProgress.create({ video_id: v.video_id, ...data });
      queryClient.invalidateQueries({ queryKey: ["chapterProgress"] });
      toast.success(`Baseline saved: ${score}%`);
    } catch (e) {
      console.error("[chapter] could not save baseline", e);
      toast.error("Couldn't save your answer — please try again.");
      throw e;
    }
    setChapterWatch(null);
    startPass(v, "discovery"); // next: step 2, sentence-by-sentence discovery
  };

  const saveChapterFinal = async (v: any, score: number) => {
    const existing = chapterByVideo.get(v.video_id);
    try {
      if (!existing?.id) throw new Error("no chapter progress");
      await base44.entities.ChapterProgress.update(existing.id, { final_score: score, final_at: new Date().toISOString() });
      queryClient.invalidateQueries({ queryKey: ["chapterProgress"] });
    } catch (e) {
      console.error("[chapter] could not save final score", e);
      toast.error("Couldn't save your answer — please try again.");
      throw e;
    }
    setChapterFinal(null);
    setChapterResult({ title: v.title || "", before: existing.baseline_score, after: score });
  };

  // Backpack Words · Select: Learn → the word joins study and Masteri builds its
  // memory (mnemonic image + explanation); Skip → it's set aside.
  const decideWord = async (w: any, learn: boolean, priority: number | null) => {
    try {
      await base44.entities.Word.update(w.id, {
        learn_status: learn ? "learning" : "skipped",
        learn_decided_at: new Date().toISOString(),
        ...(learn && priority ? { priority } : {}),
      });
      queryClient.invalidateQueries({ queryKey: ["wordRatings"] });
      if (learn && !w.image_url) {
        autoImageTried.current.add(w.id);
        suggestMnemonicForWord(w);
      }
    } catch (e) {
      console.error("[backpack] learn/skip failed", e);
      toast.error("Couldn't save — please try again.");
    }
  };

  const openShellVideo = async (v: any, markWatched = true) => {
    setShellVideo(v);
    shellVideoIdRef.current = v.id;
    if (v.video_id && markWatched) {
      setWatchedIds((prev) => {
        const next = new Set(prev);
        next.add(v.video_id);
        try { localStorage.setItem("watchedShellVideos", JSON.stringify([...next])); } catch {}
        return next;
      });
    }
    setShellPlaying(false);
    setShellStarted(false);
    setShellSlow(false);
    setShellTime(0);

    // Scrub the stored transcript: drop caption-noise markers and ALL Arabic
    // script (legacy wrong-language caption data — the app teaches no Arabic).
    // Beyond-repair transcripts are discarded and re-transcribed:
    //  - majority-Arabic (old wrong caption tracks), or
    //  - a Hebrew video whose transcript has essentially no Hebrew script
    //    (e.g. a translated FRENCH track that slipped in upstream).
    const stored: any[] = Array.isArray(v.processed_transcript) ? v.processed_transcript : [];
    const joined = stored.map((s) => `${s.hebrew || ""} ${s.transliteration || ""} ${s.text || ""}`).join(" ");
    const vidLangIsHebrew = (v.language || language) === "hebrew";
    const corrupt =
      (countArabic(joined) > countHebrew(joined) && countArabic(joined) > 20) ||
      (vidLangIsHebrew && joined.replace(/\s/g, "").length > 200 && countHebrew(joined) < 20);
    const cleaned = corrupt
      ? []
      : stored
          .map((s) => ({
            ...s,
            text: scrubSegmentText(s.text),
            hebrew: s.hebrew ? scrubSegmentText(s.hebrew) : s.hebrew,
            transliteration: s.transliteration ? scrubSegmentText(s.transliteration) : s.transliteration,
          }))
          .filter((s) => (s.hebrew || s.transliteration || s.text || "").trim().length > 0);
    setShellSegments(cleaned);

    const writeEntity = v._mine
      ? base44.entities.UserSavedVideo
      : currentUser?.role === "admin"
      ? base44.entities.MediaLibrary
      : null;

    // Persist the scrub when it actually removed something (self-healing —
    // the Arabic never comes back for the next viewer).
    if (!corrupt && cleaned.length > 0 && writeEntity && JSON.stringify(cleaned) !== JSON.stringify(stored)) {
      writeEntity.update(v.id, { processed_transcript: cleaned }).catch(() => {});
    }

    // No usable transcript (missing or corrupt) → transcribe the audio now
    // (and persist when we own the row, so next open is instant).
    let displaySegs = cleaned;
    if (cleaned.length === 0 && v.video_id) {
      setShellSegsLoading(true);
      try {
        const data: any = await transcribeMediaSource(youtubeSource(v.video_id), { language: v.language || language });
        const segs = (data?.transcript || [])
          .map((s: any) => ({
            text: scrubSegmentText(s.text),
            transliteration: scrubSegmentText(s.text),
            english: "",
            start: s.start,
          }))
          .filter((s: any) => s.text.length > 0);
        setShellSegments(segs);
        displaySegs = segs;
        if (segs.length > 0 && writeEntity) {
          writeEntity.update(v.id, { processed_transcript: segs }).catch(() => {});
        }
      } catch (e) {
        console.error(e);
      }
      setShellSegsLoading(false);
    }

    // Hebrew videos must show a LATIN transliteration row ("ha-sipur shelanu…"),
    // not Hebrew script in the transliteration field. Legacy transcripts stored
    // the native script there — repair them once in the background.
    if (vidLangIsHebrew && displaySegs.length > 0) {
      const violations = displaySegs.filter(
        (s: any) => !s.transliteration || isRTLText(s.transliteration)
      ).length;
      if (violations > 0) repairShellTranscript(v, displaySegs, writeEntity);
    }
  };

  // Batched LLM repair pass (same contract the media page reader uses):
  // per line → hebrew WITH nikud + Latin transliteration (modern Israeli).
  // Progressive display updates; one persist at the end; one pass per open.
  const repairShellTranscript = async (v: any, segs: any[], writeEntity: any) => {
    if (shellRepairRef.current) return;
    shellRepairRef.current = true;
    try {
      const out = segs.map((s) => ({ ...s }));
      for (let i = 0; i < out.length; i += 20) {
        if (shellVideoIdRef.current !== v.id) return; // user moved on
        const chunk = out.slice(i, i + 20);
        const result = await base44.integrations.Core.InvokeLLM({
          prompt: `You are an expert Hebrew linguist. For each numbered sentence below you get the best available source (Hebrew script and/or a transliteration, with an English hint). Return for EACH one:
- hebrew: the sentence in Hebrew script WITH full nikud (vowel points), punctuation preserved.
- transliteration: a Latin-letter transliteration of that Hebrew, following modern Israeli pronunciation, with punctuation matching the Hebrew.

Rules:
- Return JSON with a "segments" array in the same order, each object: { hebrew: string, transliteration: string }
- Never leave a field empty; derive the missing form from whichever source exists.

${chunk.map((s: any, j: number) => `${j + 1}. Source: "${s.hebrew || s.transliteration || s.text}"${s.english ? ` | English meaning: "${s.english}"` : ""}`).join("\n")}`,
          response_json_schema: {
            type: "object",
            properties: {
              segments: {
                type: "array",
                items: { type: "object", properties: { hebrew: { type: "string" }, transliteration: { type: "string" } } },
              },
            },
          },
        });
        chunk.forEach((s: any, j: number) => {
          const fixed = result?.segments?.[j];
          if (!fixed) return;
          if (fixed.hebrew && isRTLText(fixed.hebrew)) s.hebrew = fixed.hebrew;
          if (fixed.transliteration && !isRTLText(fixed.transliteration)) s.transliteration = fixed.transliteration;
        });
        if (shellVideoIdRef.current === v.id) setShellSegments([...out]);
      }
      if (shellVideoIdRef.current === v.id && writeEntity) {
        writeEntity.update(v.id, { processed_transcript: out }).catch(() => {});
      }
    } catch (e) {
      console.error("transliteration repair failed", e);
    } finally {
      shellRepairRef.current = false;
    }
  };

  // A song's published lyrics are a better textual source than speech-to-text.
  // We keep the timed transcript only as an alignment guide, then replace the
  // text sent to the translator and word-glossing flows with the imported lines.
  const importSongLyrics = async () => {
    if (!shellVideo) return;
    const url = window.prompt("Paste the Letras.com URL for this song:");
    if (!url?.trim()) return;
    if (!shellSegments.length) {
      toast.error("Wait for the audio transcript before importing lyrics.");
      return;
    }

    setLyricsImporting(true);
    try {
      const imported = await fetchLetrasLyrics(url.trim());
      const lines = imported.lines.slice(0, 120);
      const timed = shellSegments
        .map((s: any, i: number) => ({ i, text: scrubSegmentText(s.hebrew || s.text), start: Number(s.start) || 0 }))
        .filter((s: any) => s.text);
      if (!timed.length) throw new Error("No timed transcript is available yet.");

      // Ask the model only to align the two representations; it never creates
      // the lyric text. Invalid/missing matches fall back to even timing slots.
      const alignment: any = await base44.integrations.Core.InvokeLLM({
        prompt: `Match published song lyric lines (A) to the best matching timed speech-to-text fragments (B). The speech transcript may contain errors, but both lists are the same song. Return only where each A line STARTS. Numbers must be non-decreasing. Do not rewrite either list.

A (published lyrics):
${lines.map((line, i) => `${i}: ${line}`).join("\n")}

B (timed transcript):
${timed.slice(0, 160).map((segment: any, i: number) => `${i}: ${segment.text}`).join("\n")}

Return JSON: { "starts": [{ "line": number, "fragment": number }] }`,
        response_json_schema: {
          type: "object",
          properties: { starts: { type: "array", items: { type: "object", properties: { line: { type: "number" }, fragment: { type: "number" } } } } },
        },
        max_tokens: 4000,
      });
      const matched = new Map<number, number>();
      for (const item of alignment?.starts || []) {
        const line = Math.round(Number(item?.line));
        const fragment = Math.round(Number(item?.fragment));
        if (line >= 0 && line < lines.length && fragment >= 0 && fragment < timed.length) {
          matched.set(line, fragment);
        }
      }
      let previous = 0;
      const starts = lines.map((_, line) => {
        const fallback = Math.min(timed.length - 1, Math.floor((line * timed.length) / lines.length));
        previous = Math.max(previous, matched.get(line) ?? fallback);
        return timed[previous].start;
      });
      const duration = Number(shellPlayerRef.current?.getDuration?.()) || Math.max(starts[starts.length - 1] || 0, timed[timed.length - 1]?.start || 0) + 5;
      const segments = buildLyricSegments(lines, starts, duration);
      setShellSegments(segments);

      const writeEntity = shellVideo._mine
        ? base44.entities.UserSavedVideo
        : currentUser?.role === "admin"
        ? base44.entities.MediaLibrary
        : null;
      if (writeEntity) {
        await writeEntity.update(shellVideo.id, {
          processed_transcript: segments,
          lyrics_source_url: imported.source_url,
        });
      }
      const existingChapters = await base44.entities.ChapterContent.filter({ video_id: shellVideo.video_id });
      await Promise.all((existingChapters || []).map((chapter: any) => base44.entities.ChapterContent.delete(chapterContentKey(chapter))));
      prepareTried.current.delete(shellVideo.video_id);
      queryClient.invalidateQueries({ queryKey: ["chapterContent", shellVideo.video_id] });
      toast.success(`${segments.length} lyric lines imported. Start the chapter to translate them.`);
    } catch (error: any) {
      console.error("lyric import failed", error);
      toast.error(error?.message || "Could not import lyrics.");
    } finally {
      setLyricsImporting(false);
    }
  };

  const closeShellVideo = () => {
    setDiscovery(false);
    discStopAtRef.current = null;
    shellVideoIdRef.current = null;
    try { shellPlayerRef.current?.destroy?.(); } catch (e) {}
    shellPlayerRef.current = null;
    if (shellTimerRef.current) { clearInterval(shellTimerRef.current); shellTimerRef.current = null; }
    setShellVideo(null);
    setShellSegments([]);
    setShellPlaying(false);
    setShellStarted(false);
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
        // Sentence passes (steps 2–3): no YouTube controls or captions — the
        // app plays sentence by sentence and covers the paused frame itself.
        playerVars: discovery
          ? { enablejsapi: 1, autoplay: 0, controls: 0, disablekb: 1, fs: 0, rel: 0, iv_load_policy: 3, cc_load_policy: 0, playsinline: 1 }
          : { enablejsapi: 1, autoplay: 0, controls: 1, rel: 0 },
        events: {
          onReady: (event: any) => { if (discovery) hideCaptions(event.target); },
          onApiChange: (event: any) => { if (discovery) hideCaptions(event.target); },
          onStateChange: (event: any) => {
            // Buffering (3) counts as playing: covering the video for a
            // loading hiccup flashed the thumbnail mid-sentence.
            setShellPlaying(event.data === 1 || event.data === 3);
            if (event.data === 1) setShellStarted(true);
            if (discovery && event.data === 1) hideCaptions(event.target);
          },
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

  // ---- Step 2: Sentence-by-Sentence Discovery -------------------------------
  // Only the chapter's content (first 3:30). A sentence ends where the next begins.
  // The chapter's sentences with REAL timings (chapter_content, migration 1900):
  // prepared once per video from timed captions grouped into full sentences.
  // The stored transcript has AI-estimated starts, so "play this sentence"
  // played the wrong audio; it's only used if preparation fails.
  const [chapterPreparing, setChapterPreparing] = useState(false);
  const { data: chapterContent = null, isFetched: chapterContentFetched } = useQuery({
    queryKey: ["chapterContent", shellVideo?.video_id],
    queryFn: async () => (await base44.entities.ChapterContent.filter({ video_id: shellVideo.video_id }))?.[0] || null,
    enabled: discovery && !!shellVideo?.video_id,
    staleTime: Infinity,
  });
  const prepareTried = useRef<Set<string>>(new Set());
  // Only a failed preparation falls back to the stored transcript (for lyric
  // imports its times are rough). Once the sentences exist, a later deletion
  // of them prepares them again instead of falling back.
  const [chapterPrepFailed, setChapterPrepFailed] = useState<string | null>(null);
  useEffect(() => {
    if (chapterContent && shellVideo?.video_id) prepareTried.current.delete(shellVideo.video_id);
  }, [chapterContent, shellVideo?.video_id]);
  useEffect(() => {
    const vid = shellVideo?.video_id;
    // Wait for the lookup: while it loads chapterContent is null too, and
    // preparing then re-transcribed (and re-billed) an already prepared video.
    if (!discovery || !vid || !chapterContentFetched || chapterContent || prepareTried.current.has(vid)) return;
    prepareTried.current.add(vid);
    (async () => {
      setChapterPreparing(true);
      try {
        const lang = shellVideo.language || language;
        // Songs with imported lyrics: the lyrics give the words, the audio the
        // times. Lines are timed word by word against the transcription below.
        // (Imports made before the marker existed are recognised by the
        // Hebrew+romanization lines Letras.com produced.)
        const savedLines = (Array.isArray(shellVideo.processed_transcript) ? shellVideo.processed_transcript : [])
          .map((segment: any) => {
            const { native, latin } = splitScriptLine(stripCaptionNoise(segment?.hebrew || segment?.text));
            return { text: native, transliteration: segment?.transliteration || latin, english: segment?.english || "", lyric: !!segment?.lyric, glued: !!latin };
          })
          .filter((line: any) => line.text);
        const lyricLines = savedLines.some((l: any) => l.lyric) || savedLines.filter((l: any) => l.glued).length >= 3 ? savedLines : [];
        // Supadata's free plan rejects simultaneous requests ("Limit Exceeded")
        // — e.g. the shell transcribing the same new video at the same time —
        // so wait and retry a couple of times.
        let res: any = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          if (attempt) await new Promise((r) => setTimeout(r, 6000 * attempt));
          res = await transcribeMediaSource(youtubeSource(vid), { language: lang, allowTimingOnly: true });
          if (!/limit/i.test(String(res?.error || ""))) break;
        }
        const frags = (res?.transcript || [])
          .map((f: any) => ({ text: stripCaptionNoise(f.text), start: Number(f.start) || 0, end: (Number(f.start) || 0) + (Number(f.duration) || 0) }))
          .filter((f: any) => f.text && f.start < CHAPTER_MAX_SECONDS);
        if (!frags.length) throw new Error(res?.error || "no timed transcript");

        let sentences: any[] = [];
        if (lyricLines.length) {
          // Every spoken word with its time (ElevenLabs); other engines only
          // time fragments, whose words are spread evenly.
          const words = Array.isArray(res?.words) && res.words.length
            ? res.words
            : wordsFromFragments((res?.transcript || []).map((f: any) => ({
                text: stripCaptionNoise(f.text), start: Number(f.start) || 0, end: (Number(f.start) || 0) + (Number(f.duration) || 0),
              })));
          const timing = fitSungLines(alignLinesToWords(lyricLines.map((l: any) => l.text), words));
          sentences = lyricLines
            .map((l: any, i: number) => ({
              start: timing[i].start,
              end: Math.min(timing[i].end, CHAPTER_MAX_SECONDS),
              hebrew: l.text,
              text: l.text,
              transliteration: l.transliteration,
              english: l.english,
            }))
            .filter((x: any) => x.start < CHAPTER_MAX_SECONDS - 1 && x.end > x.start);
          if (!sentences.length) throw new Error("could not time the lyrics");
        } else if (res?.timing_only) {
          // The only timed track is in another language (e.g. a French dub —
          // checked: it follows the original speech sentence by sentence). Pair
          // its timings with the video's stored transcript: the model returns
          // only index ranges, the Hebrew text is ours.
          const lines = (Array.isArray(shellVideo.processed_transcript) ? shellVideo.processed_transcript : [])
            .map((s: any) => stripCaptionNoise(s?.hebrew || s?.text))
            .filter(Boolean);
          if (!lines.length) throw new Error("no stored transcript to pair with the timings");
          // The model only says in which fragment each line STARTS (asking for
          // ranges on both sides made it produce overlapping ranges).
          const a: any = await base44.integrations.Core.InvokeLLM({
            prompt: `A ${languageLabel(lang)} video. List A: its original ${languageLabel(lang)} lines, in order. List B: timed fragments of a translation of the same video (${res.language || "other language"}), in order. B covers only the beginning of the video, so the last A lines may not be in B at all.
A:
${lines.map((t: string, i: number) => `${i}: ${t}`).join("\n")}

B:
${frags.map((f: any, i: number) => `${i}: ${f.text}`).join("\n")}

For every A line that is said within B, give the number of the B fragment where that line STARTS being said. Several A lines can start in the same fragment. Numbers never go backwards. Leave out A lines that come after the end of B.
Return JSON: { "starts": [ { "a": A line number, "b": B fragment number } ] }`,
            response_json_schema: {
              type: "object",
              properties: { starts: { type: "array", items: { type: "object", properties: { a: { type: "number" }, b: { type: "number" } } } } },
            },
            max_tokens: 4000,
          });
          const given = new Map<number, number>();
          for (const x of a?.starts || []) {
            const ai = Math.round(Number(x?.a)), bi = Math.round(Number(x?.b));
            if (ai >= 0 && ai < lines.length && bi >= 0 && bi < frags.length) given.set(ai, bi);
          }
          const lastLine = given.size ? Math.max(...Array.from(given.keys())) : -1;
          // Fragment each line starts in: a skipped line inherits the previous
          // one's, and it never goes backwards.
          const lineFrag: number[] = [];
          for (let i = 0; i <= lastLine; i++) {
            const prev = i ? lineFrag[i - 1] : 0;
            lineFrag.push(Math.max(prev, given.get(i) ?? prev));
          }
          // Lines starting in the same fragment share its time by length.
          const starts: number[] = [];
          for (let i = 0; i <= lastLine; ) {
            let j = i;
            while (j + 1 <= lastLine && lineFrag[j + 1] === lineFrag[i]) j++;
            const f = frags[lineFrag[i]];
            const lens = lines.slice(i, j + 1).map((t: string) => Math.max(1, t.length));
            const total = lens.reduce((x: number, y: number) => x + y, 0);
            let t = f.start;
            for (let k = i; k <= j; k++) { starts.push(t); t += ((f.end - f.start) * lens[k - i]) / total; }
            i = j + 1;
          }
          for (let i = 0; i <= lastLine; i++) {
            const end = i < lastLine ? starts[i + 1] : frags[frags.length - 1].end;
            sentences.push({
              start: starts[i],
              end: Math.min(end, CHAPTER_MAX_SECONDS),
              hebrew: lines[i],
              text: lines[i],
              transliteration: "",
              english: "",
            });
          }
          sentences = sentences.filter((x: any) => x.start < CHAPTER_MAX_SECONDS && x.end > x.start);
          if (!sentences.length) throw new Error("could not pair the transcript with the timings");
        } else {
        // 1 · Sentences cut on the fragments' real edges (see
        // lib/chapterSentences; AI grouping merged whole dialogues into
        // 20–30 s blocks).
        sentences = splitIntoSentences(frags, CHAPTER_MAX_SECONDS).map((x) => ({
          start: x.start,
          end: x.end,
          hebrew: x.text,
          text: x.text,
          transliteration: "",
          english: "",
        }));
        }
        if (!sentences.length) throw new Error("no sentences");

        // 2 · Phonetic + English + a gloss per word (so tapping a word is
        // instant), in batches of 8 run in parallel. A failed batch is filled
        // per sentence when shown.
        const batches: any[][] = [];
        for (let b = 0; b < sentences.length; b += 8) batches.push(sentences.slice(b, b + 8));
        await Promise.all(batches.map(async (batch) => {
          try {
            const t: any = await invokeQuality({
              prompt: glossPrompt(languageLabel(lang), batch.map((x: any) => x.text)),
              response_json_schema: GLOSS_SCHEMA,
              max_tokens: 8000,
            });
            for (const it of t?.items || []) {
              const x = batch[Math.round(Number(it?.i))];
              if (!x) continue;
              x.transliteration = x.transliteration || it.transliteration || "";
              x.english = x.english || it.english || "";
              x.words = cleanGlosses(it.words);
            }
          } catch (e) {
            console.warn("[chapter] translation batch failed", e);
          }
        }));
        await base44.entities.ChapterContent.create({ video_id: vid, language: lang, sentences, source: `${res?.source || ""}${lyricLines.length ? "+lyrics" : ""}` });
        queryClient.invalidateQueries({ queryKey: ["chapterContent", vid] });
      } catch (e) {
        console.error("[chapter] could not prepare timed sentences, using the stored transcript", e);
        setChapterPrepFailed(vid);
      }
      setChapterPreparing(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discovery, shellVideo?.video_id, chapterContent, chapterContentFetched]);

  const discSegments = useMemo(() => {
    if (!discovery) return [];
    if (Array.isArray(chapterContent?.sentences) && chapterContent.sentences.length) return chapterContent.sentences;
    if (chapterPreparing || !chapterContentFetched || chapterPrepFailed !== shellVideo?.video_id) return [];
    return shellSegments.filter((s: any) => (s.start ?? 0) < CHAPTER_MAX_SECONDS);
  }, [discovery, chapterContent, chapterContentFetched, chapterPreparing, chapterPrepFailed, shellVideo?.video_id, shellSegments]);
  const discSeg: any = discSegments[discIdx] || null;
  const coverTint = useCoverTint(discovery ? shellVideo?.video_id : undefined);
  const shellMeta = useDisplayTitle(discovery ? shellVideo : null);
  const libMetas = useVideoMetas(tab === "library" ? (shellVideos as any[]) : []);
  const discProgressInSentence = discSeg?.end > discSeg?.start
    ? Math.min(1, Math.max(0, (shellTime - discSeg.start) / (discSeg.end - discSeg.start)))
    : 0;
  // Word glosses of a sentence: saved with it, or (chapters prepared before
  // glosses existed) fetched once while the sentence is on screen.
  const glossCacheRef = useRef<Record<string, any[]>>({});
  const discWordGlosses = (sentence: string) => {
    const seg = discSegments.find((x: any) => (x.hebrew || x.text || x.transliteration || "") === sentence);
    return seg?.words?.length ? seg.words : glossCacheRef.current[sentence];
  };
  useEffect(() => {
    const main = discSeg ? discSeg.hebrew || discSeg.text || "" : "";
    if (!discovery || !main || discSeg?.words?.length || glossCacheRef.current[main]) return;
    glossCacheRef.current[main] = [];
    invokeQuality({
      prompt: glossPrompt(languageLabel(shellVideo?.language || language), [main]),
      response_json_schema: GLOSS_SCHEMA,
    })
      .then((r: any) => { glossCacheRef.current[main] = cleanGlosses(r?.items?.[0]?.words); })
      .catch(() => { delete glossCacheRef.current[main]; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discovery, discSeg]);
  const discEnd = (i: number) => {
    const seg = discSegments[i];
    const next = discSegments[i + 1];
    // Most edges are real fragment/word edges; a small tail keeps the last
    // syllable from being clipped, but stays clear of the next sentence: the
    // YouTube player keeps sounding ~0.2 s after pauseVideo().
    if (seg?.end) {
      const tail = next?.start != null ? Math.max(seg.end, Math.min(seg.end + 0.15, next.start - 0.25)) : seg.end + 0.3;
      return Math.min(tail, CHAPTER_MAX_SECONDS);
    }
    const start = seg?.start ?? 0;
    return Math.min(next ? next.start : start + 8, CHAPTER_MAX_SECONDS);
  };
  const playDiscSentence = (i = discIdx) => {
    const seg = discSegments[i];
    const p = shellPlayerRef.current;
    if (!seg || !p?.seekTo) return;
    discStopAtRef.current = discEnd(i);
    // A hair early so the first syllable isn't clipped — but not into the
    // previous sentence.
    const prevEnd = discSegments[i - 1]?.end ?? 0;
    const start = seg.start ?? 0;
    p.seekTo(Math.max(0, Math.min(start, Math.max(start - 0.2, prevEnd))), true);
    p.playVideo?.();
  };
  // Pause keeps the sentence's stop point, so Play resumes where it was and
  // still stops at the sentence end; past it, Play replays the sentence.
  const pauseDisc = () => shellPlayerRef.current?.pauseVideo?.();
  const resumeDisc = () => {
    const p = shellPlayerRef.current;
    const stopAt = discStopAtRef.current;
    if (p?.getCurrentTime && stopAt != null && p.getCurrentTime() < stopAt - 0.1) p.playVideo?.();
    else playDiscSentence();
  };
  // Stop playback at the end of the current sentence.
  useEffect(() => {
    if (!discovery) return;
    const t = setInterval(() => {
      const p = shellPlayerRef.current;
      const stopAt = discStopAtRef.current;
      if (stopAt == null || !p?.getCurrentTime) return;
      // Checked often and a hair early: pausing takes effect ~0.1 s later.
      // Right after a seek back (Replay / Previous) the player still reports
      // the old, later position for a moment — that must not count as the end.
      const ct = p.getCurrentTime();
      if (ct >= stopAt - 0.08 && ct < stopAt + 1.5) {
        discStopAtRef.current = null;
        p.pauseVideo?.();
      }
    }, 40);
    return () => clearInterval(t);
  }, [discovery]);
  // Each new sentence plays on its own (translation hidden).
  useEffect(() => {
    if (!discovery || !discSeg) return;
    setDiscRevealed(false);
    const t = setTimeout(() => playDiscSentence(discIdx), 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discovery, passKind, discIdx, discSegments.length]);

  // The phonetic line is always shown on top, so fetch translation + phonetic
  // up front when the transcript lacks them (the English stays hidden until
  // "Show translation").
  const fillDiscTranslation = async (i: number) => {
    const seg = discSegments[i];
    const hasPhonetic = seg?.transliteration && !isRTLText(seg.transliteration);
    if (!seg || (seg.english && hasPhonetic) || discTranslations[i]) return;
    const main = seg.hebrew || seg.text || seg.transliteration || "";
    setDiscTranslating(true);
    try {
      const r: any = await invokeQuality({
        prompt: `Translate this ${languageLabel(vidLang)} sentence into natural English and give its Latin-letter transliteration: "${main}". Return JSON with: english, phonetic.${translitRules(languageLabel(vidLang))}`,
        response_json_schema: { type: "object", properties: { english: { type: "string" }, phonetic: { type: "string" } } },
      });
      setDiscTranslations((prev) => ({ ...prev, [i]: { english: r?.english || "", phonetic: r?.phonetic || "" } }));
    } catch {}
    setDiscTranslating(false);
  };
  useEffect(() => {
    if (discovery && discSeg) fillDiscTranslation(discIdx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discovery, discIdx, discSegments.length]);
  const revealDiscTranslation = () => {
    setDiscRevealed(true);
    if (passKind === "discovery") playDiscSentence(); // step 2: replay once more with the translation
  };

  // Recommended vocabulary for the chapter: picked once by AI, saved on the
  // student's chapter_progress row, highlighted in the sentences.
  const discProgress: any = shellVideo?.video_id ? chapterByVideo.get(shellVideo.video_id) : null;
  const recommendedWords: any[] = Array.isArray(discProgress?.recommended_words) ? discProgress.recommended_words : [];
  const recommendTried = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!discovery || passKind !== "discovery" || !discProgress?.id || recommendedWords.length || !discSegments.length) return;
    if (recommendTried.current.has(discProgress.id)) return;
    recommendTried.current.add(discProgress.id);
    (async () => {
      try {
        const text = discSegments.map((s: any) => s.hebrew || s.text || "").join("\n");
        const level = shellVideo?.difficulty_level || "Beginner";
        const r: any = await base44.integrations.Core.InvokeLLM({
          prompt: `These are the sentences of a short ${languageLabel(vidLang)} video for a ${level} learner:\n${text}\n\nPick the 8 to 12 most useful words to learn from it: frequent in the language, important for understanding this content, and suited to a ${level} learner. Use each word exactly as it appears in the sentences. Return JSON: { "words": [ { "hebrew": the word as written in the sentence, "phonetic": Latin transliteration, "meaning": English meaning in context } ] }`,
          response_json_schema: {
            type: "object",
            properties: {
              words: { type: "array", items: { type: "object", properties: { hebrew: { type: "string" }, phonetic: { type: "string" }, meaning: { type: "string" } } } },
            },
          },
        });
        const list = (r?.words || []).filter((w: any) => w?.hebrew).slice(0, 12);
        if (list.length) {
          await base44.entities.ChapterProgress.update(discProgress.id, { recommended_words: list });
          queryClient.invalidateQueries({ queryKey: ["chapterProgress"] });
        }
      } catch (e) {
        console.error("[chapter] recommended words failed", e);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discovery, passKind, discProgress?.id, recommendedWords.length, discSegments.length]);
  const normHe = (t: string) => cleanToken(t || "").replace(/[\u0591-\u05C7]/g, "");
  const recommendedFor = (token: string) => {
    const t = normHe(token);
    if (!t) return null;
    return recommendedWords.find((w: any) => {
      const r = normHe(w.hebrew);
      return r && (t === r || (t.length > 2 && t.slice(1) === r) || (r.length > 2 && r.slice(1) === t));
    }) || null;
  };

  const finishDiscovery = async () => {
    discStopAtRef.current = null;
    shellPlayerRef.current?.pauseVideo?.();
    const field = passKind === "discovery" ? "discovery_completed_at" : "comprehension_completed_at";
    try {
      if (discProgress?.id) {
        await base44.entities.ChapterProgress.update(discProgress.id, { [field]: new Date().toISOString() });
        queryClient.invalidateQueries({ queryKey: ["chapterProgress"] });
      }
    } catch {
      toast.error("Couldn't save your progress — please try again.");
      return;
    }
    setWordPopup(null);
    if (passKind === "discovery") {
      // The lesson adds its recommended words to Backpack as New (skip ones
      // the student already has).
      const have = new Set((words as any[]).map((w: any) => normHe(w.word || "")).filter(Boolean));
      let added = 0;
      for (const r of recommendedWords) {
        const key = normHe(r.hebrew || "");
        if (!key || have.has(key)) continue;
        have.add(key);
        const sentence = discSegments.find((sg: any) => normHe(sg.hebrew || sg.text || "").includes(key));
        try {
          await base44.entities.Word.create({
            word: r.hebrew,
            phonetic: r.phonetic || r.hebrew,
            translation: r.meaning || "",
            category: "wordbank",
            language: vidLang,
            times_practiced: 0,
            mastered: false,
            example_sentence: sentence ? sentence.hebrew || sentence.text : null,
            source_video_id: shellVideo?.video_id || null,
            source_video_title: shellVideo?.title || null,
            learn_status: "new",
          });
          added++;
        } catch (e) {
          console.error("[chapter] could not add recommended word", r, e);
        }
      }
      if (added) queryClient.invalidateQueries({ queryKey: ["wordRatings"] });
      // → step 3, same sentences with less help
      toast.success("Discovery done! Now the comprehension pass 👂");
      setPassKind("comprehension");
      setDiscIdx(0);
      setDiscRevealed(false);
      setDiscTranslations({});
    } else {
      // → step 4, the final uninterrupted pass
      toast.success("Comprehension pass done! Final pass 🎬");
      const v = shellVideo;
      closeShellVideo();
      if (v) setChapterFinal(v);
    }
  };

  // Tap a word in the transcript: pause the video and open the popup with
  // sound / edit / add-to-backpack. The translation is looked up in context.
  const vidLang = shellVideo?.language || language;
  const tapTranscriptWord = async (key: string, token: string, sentence: string) => {
    if (wordPopup?.key === key) { setWordPopup(null); return; }
    const clean = cleanToken(token);
    if (!clean) return;
    // Only pauses: tapping a word to read it must not start the video.
    shellPlayerRef.current?.pauseVideo?.();
    const already = (words as any[]).some(
      (w) => w.word === clean || (w.phonetic || "").toLowerCase() === clean.toLowerCase()
    );
    const known =
      (discovery ? findGloss(discWordGlosses(sentence), token) : null) ||
      (discovery ? (() => { const r = recommendedFor(token); return r ? { phonetic: r.phonetic, meaning: r.meaning } : null; })() : null);
    if (known?.meaning) {
      setWordPopup({ key, clean, sentence, translation: known.meaning, phonetic: known.phonetic || "", loading: false, editing: false, saving: false, added: already });
      return;
    }
    setWordPopup({ key, clean, sentence, translation: "", phonetic: "", loading: true, editing: false, saving: false, added: already });
    try {
      const result = await invokeQuality({
        prompt: `Translate the ${languageLabel(vidLang)} word "${clean}" as used in this sentence: "${sentence}". Return JSON with: translation (English meaning, 1-4 words), phonetic (Latin-letter transliteration of the word).${translitRules(languageLabel(vidLang))}`,
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
      const row = await base44.entities.Word.create({
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
        // Which video it came from -> its own deck in the Backpack menu.
        source_video_id: shellVideo?.video_id || null,
        source_video_title: shellVideo?.title || null,
        // Enters Backpack as New: the student decides Learn / Skip later.
        learn_status: "new",
      });
      queryClient.invalidateQueries({ queryKey: ["wordRatings"] });
      setWordPopup((p: any) => (p ? { ...p, saving: false, added: true } : p));
      setMood("happy");
      toast.success("Added to backpack! 🎒");
      // Its mnemonic image is generated once the student chooses Learn.
    } catch (e: any) {
      setWordPopup((p: any) => (p ? { ...p, saving: false } : p));
      toast.error("Couldn't add the word");
    }
  };

  // -------------------------------------------------------------------------
  // Library add-flow. Search YouTube (a pasted link jumps straight to the
  // publish screen), pick a result, choose level + topics, save. Admins write
  // to the master library; everyone else to their personal collection (which
  // also lands in the admin approval queue on the full library page).
  // -------------------------------------------------------------------------
  const searchLang = libLang || language;

  const openPublish = (item: any) => {
    setLibPick(item);
    setLibLevel("Beginner");
    setLibTopics([]);
    setLibView("publish");
  };

  const runLibSearch = async (rawQuery?: string) => {
    const q = (rawQuery ?? libSearch).trim();
    if (!q || libSearching) return;
    if (rawQuery !== undefined) setLibSearch(rawQuery);

    // Pasted link → straight to the publish screen.
    const linkedId = extractYouTubeId(q);
    if (linkedId) {
      let title = "";
      try {
        const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(q)}&format=json`);
        title = (await res.json())?.title || "";
      } catch {}
      openPublish({ youtube_id: linkedId, title: title || "YouTube video", channel: "" });
      return;
    }

    setLibSearching(true);
    setLibResults([]);
    try {
      // Real YouTube Data API first (exact view counts + durations, instant).
      // Falls back to LLM web search while no YOUTUBE_API_KEY secret is set.
      let vids: any[] = [];
      try {
        const apiResult = await base44.functions.invoke("youtubeSearch", { query: q, language: searchLang });
        if (apiResult?.data?.videos?.length) {
          vids = apiResult.data.videos;
        } else if (apiResult?.data?.error && apiResult.data.error !== "no_api_key") {
          console.warn("youtubeSearch:", apiResult.data.error);
        }
      } catch (e) {
        console.warn("youtubeSearch unavailable, falling back to LLM", e);
      }

      if (vids.length === 0) {
        const label = languageLabel(searchLang);
        const result = await base44.integrations.Core.InvokeLLM({
          prompt: `Search YouTube for: "${q}". The user is learning ${label}, so ONLY include videos whose spoken language is ${label} or that teach ${label}. Find 8 real, currently-available YouTube videos, ORDERED BY VIEW COUNT from most to least popular.

Return JSON: { "videos": [ { "title": exact video title, "youtube_id": the exact 11-character YouTube video id, "channel": channel name, "views": approximate view count as a number, "duration": length like "6:05" } ] }`,
          add_context_from_internet: true,
          response_json_schema: {
            type: "object",
            properties: {
              videos: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    youtube_id: { type: "string" },
                    channel: { type: "string" },
                    views: { type: "number" },
                    duration: { type: "string" },
                  },
                },
              },
            },
          },
        });
        vids = (result?.videos || [])
          .filter((v: any) => v.youtube_id && String(v.youtube_id).length === 11)
          .sort((a: any, b: any) => (b.views || 0) - (a.views || 0));
      }

      setLibResults(vids);
      if (vids.length === 0) toast.info("No videos found — try different words.");
    } catch (e) {
      toast.error("Search failed — try again.");
    }
    setLibSearching(false);
  };

  const savePublish = async () => {
    if (!libPick?.youtube_id || libSaving) return;
    setLibSaving(true);
    const vid = libPick.youtube_id;
    const data = {
      title: libPick.title || "YouTube video",
      language: searchLang,
      video_url: `https://www.youtube.com/watch?v=${vid}`,
      video_id: vid,
      topics: libTopics,
      difficulty_level: libLevel,
      thumbnail_url: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
    };
    try {
      if (currentUser?.role === "admin") {
        await base44.entities.MediaLibrary.create({ ...data, is_active: true, tags: libPick.channel || "", notes: "" });
      } else {
        await base44.entities.UserSavedVideo.create({ ...data, tags: libPick.channel || "" });
      }
      queryClient.invalidateQueries({ queryKey: ["mediaLibrary"] });
      queryClient.invalidateQueries({ queryKey: ["userSavedVideos"] });
      toast.success("Video added to the library!");
      setLibView("grid");
      setLibPick(null);
      setLibFilter(currentUser?.role === "admin" ? "all" : "mine");
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
      <div className="relative w-full max-w-md rounded-[3rem] border border-indigo-300/30 bg-[#131630] p-2.5 shadow-[0_0_90px_rgba(139,92,246,0.35)]">
        {/* Notch / dynamic island */}
        <div className="absolute left-1/2 top-4 z-20 h-6 w-28 -translate-x-1/2 rounded-full bg-[#131630]" />
        {/* The phone screen: fixed height, no page scroll, menu pinned bottom. */}
        <div className="relative flex h-[min(820px,calc(100dvh-3.5rem))] w-full flex-col overflow-hidden rounded-[2.4rem] bg-gradient-to-b from-[#f7f8ff] via-[#f2f4fe] to-[#e9ecfd]">

        {/* Decorative gradient orbs (HD ambience) */}
        <div className="pointer-events-none absolute -left-24 -top-16 h-64 w-64 rounded-full bg-purple-300/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-20 h-72 w-72 rounded-full bg-cyan-300/25 blur-3xl" />
        <div className="pointer-events-none absolute right-6 top-1/3 h-40 w-40 rounded-full bg-fuchsia-300/20 blur-3xl" />

        {/* Top bar: palette · language · stats (padded below the notch) */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-indigo-100/70 bg-white/70 backdrop-blur px-5 pb-2.5 pt-8">
          <span className="w-5" aria-hidden="true" />
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
            {/* Photograph handwritten vocab → words land in the Backpack's
                pending-review flow */}
            {backpackDecks.all.length === 0 && <PhotoWordCapture language={language} />}

            {triageOpen ? (
              <WordTriage words={newWords} onDecide={decideWord} onClose={() => setTriageOpen(false)} />
            ) : backpackDecks.all.length === 0 && newWords.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                <Turtle mood={mood} size="text-6xl" />
                <p className="font-medium text-slate-700">No cards yet</p>
                <p className="px-6 text-sm text-slate-500">
                  Tap words in a video transcript or add them in the Journal — they become flashcards here.
                </p>
                <div className="mt-1 flex gap-2">
                  <button
                    onClick={() => setAddWordsOpen(true)}
                    className="flex items-center gap-1.5 rounded-full border border-indigo-200 bg-white px-5 py-2.5 font-semibold text-indigo-600 shadow"
                  >
                    <Plus className="h-4 w-4" /> Add words
                  </button>
                  <button
                    onClick={() => setTab("library")}
                    className="rounded-full bg-gradient-to-r from-fuchsia-500 to-indigo-500 px-5 py-2.5 font-semibold text-white shadow"
                  >
                    Watch a video
                  </button>
                </div>
              </div>
            ) : deckKey === null ? (
              <>
                {newWords.length > 0 && (
                  <button
                    onClick={() => setTriageOpen(true)}
                    className="mt-3 flex flex-shrink-0 items-center gap-3 rounded-2xl border border-fuchsia-200 bg-white px-4 py-3 text-left shadow-md shadow-fuchsia-100"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-fuchsia-100 text-lg">🆕</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-slate-900">{newWords.length} new word{newWords.length === 1 ? "" : "s"}</span>
                      <span className="block text-xs text-slate-500">Decide what to learn · swipe ✓ Learn / ↓ Skip</span>
                    </span>
                    <span className="text-lg font-bold text-fuchsia-500">›</span>
                  </button>
                )}
                <BackpackDeckMenu
                  decks={backpackDecks}
                  onOpen={openDeck}
                  onAdd={() => setAddWordsOpen(true)}
                  camera={<PhotoWordCapture language={language} compact />}
                />
              </>
            ) : (
              <>
                {/* Back to the deck menu */}
                <div className="mt-2 flex flex-shrink-0 items-center gap-2 px-1">
                  <button
                    onClick={() => openDeck(null)}
                    className="flex items-center gap-1 rounded-full border border-indigo-100 bg-white px-3 py-1 text-xs font-semibold text-indigo-600 shadow-sm"
                  >
                    ← Decks
                  </button>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700">{deckTitle}</span>
                </div>
                {/* Pager */}
                <div className="mt-2 flex flex-shrink-0 items-center justify-between px-1">
                  <button
                    onClick={() => setCardIdx((i) => Math.max(0, i - 1))}
                    disabled={safeCardIdx === 0}
                    className="rounded-xl border border-indigo-100 bg-white px-4 py-1.5 text-lg font-bold text-slate-500 shadow-md shadow-indigo-100/70 disabled:opacity-30"
                  >
                    ←
                  </button>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-slate-400">
                      {safeCardIdx + 1} / {flashDeck.length}
                    </span>
                    <PhotoWordCapture language={language} compact />
                    <button
                      onClick={() => setAddWordsOpen(true)}
                      aria-label="Add words"
                      title="Add words"
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-r from-fuchsia-500 to-indigo-500 text-white shadow-md shadow-indigo-200 transition hover:scale-105"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                  </div>
                  <button
                    onClick={() => setCardIdx((i) => Math.min(flashDeck.length - 1, i + 1))}
                    disabled={safeCardIdx >= flashDeck.length - 1}
                    className="rounded-xl border border-indigo-100 bg-white px-4 py-1.5 text-lg font-bold text-slate-500 shadow-md shadow-indigo-100/70 disabled:opacity-30"
                  >
                    →
                  </button>
                </div>

                {/* The full WordCard flashcard (mnemonic image, ratings,
                    sentence with clickable words, edit-in-place, …) */}
                <div className="mt-2 flex min-h-0 flex-1 flex-col items-center overflow-y-auto pb-3">
                    <WordCard
                      large
                      // Remount per card: each flashcard starts with its
                      // translation hidden — pressing the card reveals it.
                      key={flashDeck[safeCardIdx]?.id}
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
                      generatingExamples={Boolean(generatingExamples[flashDeck[safeCardIdx]?.id])}
                      sessionTitleMap={{}}
                    />
                </div>
              </>
            )}
          </div>
        )}

        <AddWordsSheet
          open={addWordsOpen}
          onClose={() => setAddWordsOpen(false)}
          language={language}
          existingWords={words}
          onAdded={async (created: any[]) => {
            queryClient.invalidateQueries({ queryKey: ["wordRatings"] });
            if (created.length && deckKey !== "all" && deckKey !== "other") openDeck("all");
            if (created[0]?.id) setJumpToWordId(created[0].id);
            if (created.length) setMood("happy");
            // New cards get their AI mnemonic image right away — the same as
            // tapping 🎨 on each one — one at a time so the card shows the
            // "Generating image…" state and we don't fire N image jobs at once.
            for (const w of created) if (w?.id) autoImageTried.current.add(w.id);
            for (const w of created) {
              if (w?.id) await suggestMnemonicForWord(w);
            }
          }}
        />

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
                  className="ml-auto flex items-center gap-1 rounded-full bg-gradient-to-r from-fuchsia-500 to-indigo-500 px-3 py-1.5 text-xs font-semibold text-white shadow-md shadow-purple-300/60"
                >
                  <Plus className="h-3.5 w-3.5" /> New entry
                </button>
              )}
            </div>

            {journalMode === "list" && (
              <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pb-3">
                {lessonEntries.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-indigo-200 bg-white/60 px-4 py-8 text-center">
                    <span className="text-3xl">📓</span>
                    <p className="text-sm font-medium text-slate-700">No entries yet</p>
                    <p className="text-xs text-slate-500">Write about your real life — it becomes a lesson you can use.</p>
                    <button
                      onClick={() => { setJournalText(""); setJournalMode("compose"); }}
                      className="mt-1 rounded-full bg-gradient-to-r from-fuchsia-500 to-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-purple-300/60"
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
                      className="flex w-full items-center gap-3 rounded-2xl border border-indigo-100 bg-white px-4 py-3 text-left shadow-md shadow-indigo-100/70 transition hover:shadow-md"
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
                  <div className="rounded-2xl border border-indigo-100 bg-white px-4 py-3 shadow-md shadow-indigo-100/70">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">🎒 Newest words in your backpack</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(words as any[])
                        .slice()
                        .sort((a, b) => new Date(b.created_date || 0).getTime() - new Date(a.created_date || 0).getTime())
                        .slice(0, 6)
                        .map((w) => (
                          <span key={w.id} className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-600">
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
                      className="rounded-full border border-indigo-100 bg-white px-3 py-1 text-xs text-slate-600 shadow-md shadow-indigo-100/70 hover:border-indigo-400"
                    >
                      {t.label}
                    </button>
                  ))}
                  {/* Lesson creation moved up here — the big CTA slot below now
                      belongs to the sentence-proposal cloud. */}
                  <button
                    onClick={generateJournalLesson}
                    disabled={journalBusy || !journalText.trim()}
                    className="ml-auto flex items-center gap-1 rounded-full bg-gradient-to-r from-fuchsia-500 to-indigo-500 px-3 py-1 text-xs font-semibold text-white shadow disabled:opacity-40"
                  >
                    {journalBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {journalBusy ? "Creating…" : "Lesson"}
                  </button>
                </div>
                <textarea
                  value={journalText}
                  onChange={(e) => setJournalText(e.target.value)}
                  placeholder="Write about your day in English or Hebrew…"
                  className="mt-2 min-h-0 w-full flex-1 resize-none rounded-2xl border border-indigo-100 bg-white p-4 text-sm text-slate-800 shadow-md shadow-indigo-100/70 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none"
                />

                {/* Sentence-proposal cloud: the turtle "thinks up" sentences the
                    learner can tap to add to the entry. */}
                <div className="relative mt-4 flex-shrink-0">
                  {/* thought-bubble dots */}
                  <span className="absolute -top-3 left-8 h-2.5 w-2.5 rounded-full bg-white shadow-md shadow-indigo-100/70" />
                  <span className="absolute -top-1 left-12 h-3.5 w-3.5 rounded-full bg-white shadow-md shadow-indigo-100/70" />
                  <div className="rounded-[1.75rem] border border-indigo-100 bg-white px-4 py-3 shadow-md shadow-indigo-100/70">
                    <div className="flex items-center justify-between">
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                        <span className="text-lg">🐢💭</span> Sentence ideas — tap to add
                      </p>
                      <button
                        onClick={proposeSentences}
                        disabled={proposalsLoading}
                        aria-label="New ideas"
                        className="rounded-full px-2 py-1 text-sm text-slate-400 transition hover:bg-slate-50 hover:text-indigo-500 disabled:opacity-40"
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
                          className="w-full rounded-xl border border-dashed border-indigo-200 py-2.5 text-xs text-slate-500 hover:border-indigo-400 hover:text-indigo-500"
                        >
                          ☁️ Get sentence ideas
                        </button>
                      ) : (
                        proposals.map((s, i) => {
                          const tr = proposalTranslations[s];
                          return (
                            <div
                              key={`${i}_${s.slice(0, 12)}`}
                              className="rounded-xl bg-indigo-50 transition hover:bg-indigo-100"
                            >
                              <div className="flex w-full items-center gap-2 px-3 py-2">
                                <button
                                  onClick={() => addProposal(s)}
                                  className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs font-medium text-indigo-900"
                                >
                                  <Plus className="h-3.5 w-3.5 flex-shrink-0 text-indigo-500" />
                                  <span className="min-w-0 flex-1">{s}</span>
                                </button>
                                {/* Translate this English sentence to the target language */}
                                <button
                                  onClick={(e) => { e.stopPropagation(); translateProposal(s); }}
                                  disabled={tr?.loading}
                                  aria-label="Translate"
                                  title={`Translate to ${languageLabel(language)}`}
                                  className="flex-shrink-0 rounded-lg px-1.5 py-0.5 text-sm transition hover:bg-white/70 disabled:opacity-50"
                                >
                                  {tr?.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-500" /> : "🔤"}
                                </button>
                              </div>
                              {tr?.text && (
                                <div className="border-t border-indigo-100 px-3 py-1.5">
                                  <p dir={isRTLText(tr.text) ? "rtl" : "ltr"} className={`text-sm font-semibold text-indigo-900 ${isRTLText(tr.text) ? "text-right" : ""}`}>
                                    {tr.text}
                                  </p>
                                  {tr.translit && <p className="text-[11px] italic text-indigo-500/90">{tr.translit}</p>}
                                </div>
                              )}
                            </div>
                          );
                        })
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
                  className="mt-5 w-full flex-shrink-0 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-500 py-3 text-lg font-semibold text-white shadow-lg shadow-cyan-400/40"
                >
                  Start exercises
                </motion.button>

                {/* Journal lives inside Practice — opens in-shell */}
                <button
                  onClick={() => setJournalMode("list")}
                  className="mt-4 flex flex-shrink-0 items-center gap-3 rounded-2xl border border-indigo-100 bg-white px-4 py-4 text-left shadow-md shadow-indigo-100/70 transition hover:shadow-md"
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
                  className="mt-3 flex flex-shrink-0 items-center gap-3 rounded-2xl border border-indigo-100 bg-white px-4 py-4 text-left shadow-md shadow-indigo-100/70 transition hover:shadow-md"
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
                  <button onClick={() => { setQuiz([]); setQuizDone(false); }} className="rounded-full border border-indigo-200 bg-white px-5 py-2.5 font-semibold text-slate-600">
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
                <div className="mt-1 h-1.5 flex-shrink-0 overflow-hidden rounded-full bg-indigo-100">
                  <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${((quizIdx + (quizAnswer !== null ? 1 : 0)) / quiz.length) * 100}%` }} />
                </div>

                <div className="mt-4 flex flex-shrink-0 items-start gap-3">
                  <Turtle mood={mood} size="text-4xl" />
                  <div className="relative flex-1 rounded-xl border border-indigo-100 bg-white p-3 shadow-md shadow-indigo-100/70">
                    <p className="text-sm font-medium text-slate-800">{quiz[quizIdx].prompt}</p>
                  </div>
                </div>

                <div className="mt-4 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pb-2">
                  {quiz[quizIdx].options.map((opt: string, i: number) => {
                    const isCorrect = i === quiz[quizIdx].correct_index;
                    const chosen = quizAnswer === i;
                    let cls = "border-indigo-100 bg-white text-slate-800 hover:border-indigo-400";
                    if (quizAnswer !== null) {
                      if (isCorrect) cls = "border-green-500 bg-green-50 text-green-700";
                      else if (chosen) cls = "border-red-400 bg-red-50 text-red-600";
                      else cls = "border-indigo-100 bg-white text-slate-400";
                    }
                    return (
                      <button
                        key={i}
                        onClick={() => answerQuiz(i)}
                        disabled={quizAnswer !== null}
                        className={`flex-shrink-0 rounded-xl border-2 px-4 py-3 text-left text-sm font-medium shadow-md shadow-indigo-100/70 transition ${cls}`}
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
                      <button onClick={nextQuiz} className="w-full rounded-full bg-gradient-to-r from-fuchsia-500 to-indigo-500 py-3 font-semibold text-white shadow">
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
        {(tab === "library" || tab === "path") && shellVideo && (
          <div
            className="flex min-h-0 flex-1 flex-col"
            // Sentence passes: Spotify-style, tinted with the cover's colour and fading to white.
            style={discovery ? { background: `linear-gradient(180deg, rgba(${coverTint || "196,190,240"},.5) 0%, rgba(${coverTint || "196,190,240"},.2) 40%, #fff 72%), #fff`, fontFamily: "var(--font-body), var(--font-hebrew)" } : undefined}
          >
            {/* Header */}
            <div className={`flex flex-shrink-0 items-center gap-2 px-4 ${discovery ? "pt-3 pb-1" : "pt-2 pb-2"}`}>
              <button
                onClick={closeShellVideo}
                aria-label="Back"
                className={`rounded-lg p-1 ${discovery ? "text-slate-700 hover:bg-white/60" : "text-slate-400 hover:bg-white hover:text-slate-700"}`}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              {discovery ? (
                <span className="min-w-0 flex-1 truncate text-center leading-tight">
                  <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-600">
                    {passKind === "discovery" ? "Sentence discovery" : "Comprehension pass"}
                  </span>
                  <span className="block truncate text-[13px] font-bold text-slate-900">{shellMeta?.name || shellVideo.title}</span>
                </span>
              ) : (
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-800">{shellVideo.title}</span>
              )}
              {discovery && <span className="w-7 flex-shrink-0" />}
            </div>

            {/* Player */}
            <div
              className={`relative flex-shrink-0 bg-black ${discovery ? "mx-4 mt-2 overflow-hidden rounded-2xl shadow-[0_22px_40px_-20px_rgba(15,18,34,.6)]" : "w-full"}`}
              style={{ aspectRatio: "16/9" }}
            >
              {/* Sentence passes: the player is taller than the frame, so YouTube's
                  own top bar (title, share) and pause screen ("More videos")
                  fall in the cropped black bands — the frame shows only the
                  video, also when paused. */}
              <div className={discovery ? "absolute inset-x-0 -bottom-[40%] -top-[40%]" : "h-full w-full"}>
                <div id="shell-yt-player" className="h-full w-full" />
              </div>
              {discovery && (
                <>
                  {/* Taps never reach YouTube (its own buttons don't know about
                      sentences): tapping the video pauses / resumes it instead.
                      Paused, the frozen frame stays visible (no thumbnail: many
                      have other lyric lines printed on them). */}
                  <button
                    onClick={shellPlaying ? pauseDisc : resumeDisc}
                    aria-label={shellPlaying ? "Pause" : "Play"}
                    className={`absolute inset-0 flex items-center justify-center overflow-hidden ${!shellStarted ? "bg-slate-900" : ""}`}
                  >
                    {!shellPlaying && (
                      <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm">
                        <Play className="ml-0.5 h-5 w-5 fill-current" />
                      </span>
                    )}
                  </button>
                </>
              )}
            </div>

            {discovery ? (
              <DiscoveryPanel
                mode={passKind}
                loading={shellSegsLoading || chapterPreparing || !chapterContentFetched || (!chapterContent && chapterPrepFailed !== shellVideo?.video_id)}
                preparing={chapterPreparing}
                segments={discSegments}
                idx={discIdx}
                revealed={discRevealed}
                translation={discTranslations[discIdx]}
                translating={discTranslating}
                wordPopup={wordPopup}
                recommendedFor={recommendedFor}
                recommendedCount={recommendedWords.length}
                onTapWord={(key: string, tok: string, main: string) => tapTranscriptWord(key, tok, main)}
                onAddWord={savePopupWord}
                onClosePopup={() => setWordPopup(null)}
                onReplay={() => playDiscSentence()}
                playing={shellPlaying}
                onPause={pauseDisc}
                onResume={resumeDisc}
                onReveal={revealDiscTranslation}
                onHideTranslation={() => setDiscRevealed(false)}
                title={shellMeta?.name || shellVideo.title}
                artist={shellMeta?.artist || ""}
                progress={discProgressInSentence}
                recommendedWords={recommendedWords}
                onPrev={() => { setWordPopup(null); setDiscIdx((i) => Math.max(0, i - 1)); }}
                onNext={() => { setWordPopup(null); setDiscIdx((i) => i + 1); }}
                onFinish={finishDiscovery}
              />
            ) : (<>
            {/* Floating controls: play/pause + turtle slow mode */}
            <div className="relative z-10 -mt-5 flex flex-shrink-0 justify-center gap-3">
              <button
                onClick={toggleShellPlay}
                aria-label={shellPlaying ? "Pause" : "Play"}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-indigo-100 bg-white text-lg shadow-lg"
              >
                {shellPlaying ? "⏸️" : "▶️"}
              </button>
              <button
                onClick={toggleShellSlow}
                aria-label="Slow mode"
                className={`flex h-11 w-11 items-center justify-center rounded-full border text-lg shadow-lg transition ${
                  shellSlow ? "border-indigo-400 bg-indigo-50" : "border-indigo-100 bg-white"
                }`}
              >
                🐢
              </button>
            </div>

            {/* Row visibility: transliteration + translation toggles */}
            <div className="mt-2 flex flex-shrink-0 justify-end gap-1.5 px-3">
              <button
                onClick={() => setShellShowTranslit((v) => !v)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                  shellShowTranslit
                    ? "border-indigo-400 bg-indigo-50 text-indigo-600"
                    : "border-indigo-100 bg-white text-slate-400"
                }`}
              >
                {shellShowTranslit ? "🙉" : "🙈"} abc
              </button>
              <button
                onClick={() => setShellShowEnglish((v) => !v)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${
                  shellShowEnglish
                    ? "border-indigo-400 bg-indigo-50 text-indigo-600"
                    : "border-indigo-100 bg-white text-slate-400"
                }`}
              >
                {shellShowEnglish ? "🙉" : "🙈"} EN
              </button>
            </div>

            {/* Transcript — tap a line to jump there; active line highlighted */}
            <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-3 pb-3">
              {shellSegsLoading ? (
                <div className="flex flex-col items-center gap-2 py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
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
                    // A Latin transliteration distinct from the native line.
                    const translit =
                      s.transliteration && s.transliteration !== main && !isRTLText(s.transliteration)
                        ? s.transliteration
                        : null;
                    return (
                      // Tap the sentence to play from there (words still open
                      // their popup); the line being spoken is highlighted.
                      <div
                        key={i}
                        ref={active ? (activeLineRef as any) : null}
                        onClick={() => seekShellTo(s.start ?? 0)}
                        className={`flex w-full cursor-pointer items-start gap-2 rounded-xl px-3 py-2.5 text-left transition ${
                          active
                            ? "bg-indigo-50 shadow-md shadow-indigo-100/70 ring-1 ring-indigo-300"
                            : "hover:bg-white/60"
                        }`}
                      >
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
                                      open ? "bg-indigo-100 text-indigo-900" : "hover:bg-indigo-50"
                                    }`}
                                  >
                                    {tok}
                                  </span>
                                  {open && wordPopup && (
                                    <span
                                      dir="ltr"
                                      onClick={(e) => e.stopPropagation()}
                                      className="absolute bottom-full left-1/2 z-30 mb-1.5 block w-48 -translate-x-1/2 rounded-2xl border border-indigo-100 bg-white p-2.5 text-left shadow-xl"
                                    >
                                      {wordPopup.editing ? (
                                        <span className="block space-y-1.5">
                                          <input
                                            value={wordPopup.clean}
                                            onChange={(e) => setWordPopup((p: any) => ({ ...p, clean: e.target.value }))}
                                            dir={rtl ? "rtl" : "ltr"}
                                            className="w-full rounded-lg border border-indigo-100 px-2 py-1 text-sm font-semibold text-slate-800 focus:border-indigo-400 focus:outline-none"
                                          />
                                          <input
                                            value={wordPopup.translation}
                                            onChange={(e) => setWordPopup((p: any) => ({ ...p, translation: e.target.value }))}
                                            placeholder="Meaning"
                                            className="w-full rounded-lg border border-indigo-100 px-2 py-1 text-xs text-slate-600 focus:border-indigo-400 focus:outline-none"
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
                                              {wordPopup.phonetic && <span className="block text-[11px] text-indigo-500">{wordPopup.phonetic}</span>}
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
                                          className={`rounded-lg p-1 text-base hover:bg-slate-50 ${wordPopup.editing ? "bg-indigo-50" : ""}`}
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
                                            <Loader2 className="absolute -right-0.5 -top-0.5 h-3 w-3 animate-spin text-indigo-500" />
                                          )}
                                        </button>
                                        <button onClick={() => setWordPopup(null)} aria-label="Close" className="rounded-lg p-1 text-xs text-slate-400 hover:bg-slate-50">
                                          ✕
                                        </button>
                                      </span>
                                      {/* bubble tail */}
                                      <span className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-b border-r border-indigo-100 bg-white" />
                                    </span>
                                  )}
                                </span>
                              );
                            }).reduce((acc: any[], el: any, idx: number) => (idx === 0 ? [el] : [...acc, " ", el]), [])}
                          </span>
                          {shellShowTranslit && translit && (
                            <span dir="ltr" className={`block text-xs italic text-indigo-500/90 ${rtl ? "text-right" : ""}`}>{translit}</span>
                          )}
                          {shellShowEnglish && s.english && (
                            <span className={`block text-xs text-slate-400 ${rtl ? "text-right" : ""}`}>{s.english}</span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            </>)}
          </div>
        )}

        {/* ================= PATH — video journey, Mondly-style ================= */}
        {chapterWatch && (
          <ChapterWatch
            video={chapterWatch}
            onExit={() => setChapterWatch(null)}
            onSave={(score) => saveChapterBaseline(chapterWatch, score)}
            // Straight to the sentences: no baseline saved, the video is not
            // marked as watched, so the chapter still starts at step 1 next time.
            onSkip={() => { const v = chapterWatch; setChapterWatch(null); startPass(v, "discovery", false); }}
          />
        )}
        {chapterFinal && (
          <ChapterWatch
            final
            video={chapterFinal}
            onExit={() => setChapterFinal(null)}
            onSave={(score) => saveChapterFinal(chapterFinal, score)}
          />
        )}
        {chapterResult && <ChapterResult {...chapterResult} onClose={() => setChapterResult(null)} />}

        {tab === "path" && !shellVideo && (
          <div className="flex min-h-0 flex-1 flex-col px-4 pt-4">
            <div className="flex flex-shrink-0 items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">🛤️ Learn</h2>
              <span className="text-xs font-semibold text-indigo-500">
                {shellVideos.filter((v: any) => watchedIds.has(v.video_id)).length} / {shellVideos.length}
              </span>
            </div>
            <div className="relative mt-3 min-h-0 flex-1 overflow-y-auto pb-6">
              {shellVideos.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-indigo-200 bg-white/60 px-4 py-10 text-center">
                  <span className="text-3xl">🛤️</span>
                  <p className="text-sm font-medium text-slate-700">Nothing to learn yet</p>
                  <p className="text-xs text-slate-500">Publish videos in the Library — each one becomes a chapter here.</p>
                </div>
              ) : (
                <div className="relative">
                  {/* The winding ribbon */}
                  <div className="pointer-events-none absolute bottom-2 left-1/2 top-2 w-4 -translate-x-1/2 rounded-full bg-gradient-to-b from-fuchsia-400/50 via-purple-400/50 to-indigo-400/50 blur-[1px]" />
                  <div className="space-y-7 py-2">
                    {(() => {
                      const firstUnwatched = shellVideos.findIndex((v: any) => !watchedIds.has(v.video_id));
                      return shellVideos.map((v: any, i: number) => {
                        const vid = v.video_id || "";
                        const thumb = v.thumbnail_url || (vid ? `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` : "");
                        const watched = watchedIds.has(vid);
                        const isNext = i === firstUnwatched;
                        const left = i % 2 === 0;
                        return (
                          <div key={`${v._mine ? "m" : "c"}_${v.id}`} className={`relative flex items-center gap-3 ${left ? "" : "flex-row-reverse"}`}>
                            {/* Node: the video thumbnail on its little platform */}
                            <button
                              onClick={() => openChapter(v)}
                              className={`relative w-36 flex-shrink-0 overflow-hidden rounded-2xl bg-white shadow-lg transition hover:scale-[1.03] ${
                                isNext
                                  ? "ring-4 ring-fuchsia-400/70 shadow-fuchsia-300/50"
                                  : watched
                                  ? "ring-2 ring-emerald-400/80 shadow-indigo-200/60"
                                  : "ring-1 ring-indigo-100 opacity-90 shadow-indigo-200/60"
                              }`}
                            >
                              <span className="block aspect-video w-full bg-indigo-100">
                                {thumb && (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={thumb} alt={v.title} className="h-full w-full object-cover" onError={(e: any) => { e.target.style.display = "none"; }} />
                                )}
                              </span>
                              {watched && (
                                <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[11px] font-bold text-white shadow">✓</span>
                              )}
                            </button>
                            {/* Label + CONTINUE on the next step */}
                            <div className={`min-w-0 flex-1 ${left ? "" : "text-right"}`}>
                              <p className={`line-clamp-2 text-sm font-bold leading-snug ${isNext ? "text-slate-900" : "text-slate-600"}`}>{v.title}</p>
                              <div className={`mt-1 flex flex-wrap items-center gap-1.5 ${left ? "" : "justify-end"}`}>
                                {v.difficulty_level && <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-500">{v.difficulty_level}</span>}
                                {v.duration_minutes && <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-500">{v.duration_minutes} min</span>}
                                {chapterByVideo.get(vid)?.baseline_score != null && (
                                  <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600">
                                    {chapterByVideo.get(vid).final_score != null
                                      ? `${chapterByVideo.get(vid).baseline_score}% → ${chapterByVideo.get(vid).final_score}%`
                                      : `Understood ${chapterByVideo.get(vid).baseline_score}%`}
                                  </span>
                                )}
                              </div>
                              {isNext && (
                                <button
                                  onClick={() => openChapter(v)}
                                  className="mt-2 rounded-full bg-gradient-to-r from-fuchsia-500 to-pink-500 px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-white shadow-md shadow-fuchsia-300/60"
                                >
                                  {watchedIds.size === 0 ? "Start" : "Continue"}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= LIBRARY / SEARCH YOUTUBE ================= */}
        {tab === "library" && !shellVideo && libView === "search" && (
          <div className="flex min-h-0 flex-1 flex-col px-4 pt-2">
            <div className="flex flex-shrink-0 items-center gap-2">
              <button
                onClick={() => setLibView("grid")}
                aria-label="Back"
                className="rounded-lg p-1 text-slate-400 hover:bg-white hover:text-slate-700"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="flex-1 text-center text-base font-bold text-slate-800">Publish Video</span>
              <span className="w-7" />
            </div>

            {/* Language */}
            <div className="mt-3 flex-shrink-0 rounded-xl border border-indigo-100 bg-white px-4 py-2.5 shadow-md shadow-indigo-100/70">
              <p className="text-[11px] font-medium text-slate-400">Language</p>
              <select
                value={searchLang}
                onChange={(e) => setLibLang(e.target.value)}
                className="w-full bg-transparent text-base font-semibold capitalize text-slate-800 focus:outline-none"
              >
                {Object.entries(LANGUAGE_FLAGS).map(([id, flag]) => (
                  <option key={id} value={id} className="capitalize">{flag} {id}</option>
                ))}
              </select>
            </div>

            {/* Search box */}
            <div className="mt-3 flex flex-shrink-0 items-center gap-2 rounded-xl border border-indigo-100 bg-white px-4 py-2.5 shadow-md shadow-indigo-100/70">
              <input
                value={libSearch}
                onChange={(e) => setLibSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") runLibSearch(); }}
                placeholder="Search on YouTube… or paste a link"
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
              />
              <button onClick={() => runLibSearch()} aria-label="Search" className="flex-shrink-0 text-indigo-500">
                {libSearching ? <Loader2 className="h-5 w-5 animate-spin" /> : "🔍"}
              </button>
            </div>

            {/* Suggested searches */}
            <div className="mt-2 flex flex-shrink-0 gap-1.5 overflow-x-auto pb-1">
              {(SEARCH_CHIPS[searchLang] || SEARCH_CHIPS.hebrew).map((chip) => (
                <button
                  key={chip}
                  onClick={() => runLibSearch(chip)}
                  className="flex-shrink-0 rounded-full border border-indigo-100 bg-white px-3.5 py-1.5 text-sm text-slate-700 shadow-md shadow-indigo-100/70 transition hover:border-indigo-400"
                >
                  {chip}
                </button>
              ))}
            </div>

            {/* Results / hint */}
            <div className="mt-2 min-h-0 flex-1 overflow-y-auto pb-3">
              {libSearching ? (
                <div className="flex flex-col items-center gap-2 py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
                  <p className="text-xs text-slate-500">Searching YouTube…</p>
                </div>
              ) : libResults.length === 0 ? (
                <div className="px-6 py-8 text-center text-sm leading-relaxed text-slate-400">
                  <p>Search for videos in your target language — they become lessons with transcripts.</p>
                  <p className="mt-3">For better results, search in the target language {LANGUAGE_FLAGS[searchLang] || "🌍"}.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {libResults.map((r: any) => (
                    <button
                      key={r.youtube_id}
                      onClick={() => openPublish(r)}
                      className="flex w-full items-stretch gap-3 overflow-hidden rounded-2xl border border-indigo-100 bg-white p-2 text-left shadow-md shadow-indigo-100/70 transition hover:shadow-md"
                    >
                      <span className="relative h-20 w-32 flex-shrink-0 overflow-hidden rounded-xl bg-indigo-100">
                        <img
                          src={`https://i.ytimg.com/vi/${r.youtube_id}/hqdefault.jpg`}
                          alt=""
                          className="h-full w-full object-cover"
                          onError={(e: any) => { e.target.style.display = "none"; }}
                        />
                        {r.duration && (
                          <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[10px] font-semibold text-white">
                            {r.duration}
                          </span>
                        )}
                      </span>
                      <span className="min-w-0 flex-1 py-0.5">
                        <span className="line-clamp-2 text-sm font-semibold leading-snug text-slate-800">{r.title}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-600">Auto transcript</span>
                          {r.views > 0 && (
                            <span className="text-[10px] text-slate-400">
                              {r.views >= 1e6 ? `${(r.views / 1e6).toFixed(1)}M` : r.views >= 1e3 ? `${Math.round(r.views / 1e3)}K` : r.views} views
                            </span>
                          )}
                        </span>
                        {r.channel && <span className="mt-0.5 block truncate text-[11px] text-slate-400">{r.channel}</span>}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= LIBRARY / PUBLISH ================= */}
        {tab === "library" && !shellVideo && libView === "publish" && libPick && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-shrink-0 items-center gap-2 px-4 pb-2 pt-2">
              <button
                onClick={() => setLibView(libResults.length ? "search" : "grid")}
                aria-label="Back"
                className="rounded-lg p-1 text-slate-400 hover:bg-white hover:text-slate-700"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="flex-1 text-center text-base font-bold text-slate-800">Publish Video</span>
              <span className="w-7" />
            </div>

            {/* Preview player */}
            <div className="w-full flex-shrink-0 bg-black" style={{ aspectRatio: "16/9" }}>
              <iframe
                src={`https://www.youtube.com/embed/${libPick.youtube_id}?rel=0`}
                title={libPick.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="h-full w-full"
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 pt-3">
              <p className="text-center text-base font-bold text-slate-800">{libPick.title}</p>
              <p className="mt-1 text-center text-xs text-slate-400">A transcript is generated automatically on first watch.</p>

              {/* Level */}
              <div className="mt-4 rounded-xl border border-indigo-100 bg-white px-4 py-2.5 shadow-md shadow-indigo-100/70">
                <p className="text-[11px] font-medium text-slate-400">Level</p>
                <select
                  value={libLevel}
                  onChange={(e) => setLibLevel(e.target.value)}
                  className="w-full bg-transparent text-base font-semibold text-slate-800 focus:outline-none"
                >
                  {["Beginner", "Intermediate", "Advanced"].map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              {/* Topic style */}
              <div className="mt-3">
                <p className="mb-1.5 text-[11px] font-medium text-slate-400">Topic style</p>
                <div className="flex flex-wrap gap-1.5">
                  {VIDEO_TOPICS.map((t) => {
                    const on = libTopics.includes(t);
                    return (
                      <button
                        key={t}
                        onClick={() => setLibTopics((cur) => (on ? cur.filter((x) => x !== t) : [...cur, t]))}
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                          on ? "border-indigo-400 bg-indigo-50 text-indigo-600" : "border-indigo-100 bg-white text-slate-500 hover:border-indigo-400"
                        }`}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={savePublish}
                disabled={libSaving}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-fuchsia-500 via-purple-500 to-indigo-500 py-3.5 text-lg font-semibold tracking-wide text-white shadow-lg shadow-purple-400/50 disabled:opacity-50"
              >
                {libSaving && <Loader2 className="h-5 w-5 animate-spin" />}
                {libSaving ? "Saving…" : "SAVE"}
              </button>
            </div>
          </div>
        )}

        {/* ================= LIBRARY ================= */}
        {/* Design L6: compact cards in a vertical list — thumbnail on the left,
            name + artist, the chapter's 4-step progress and Start / Continue. */}
        {tab === "library" && !shellVideo && libView === "grid" && (
          <div className="flex min-h-0 flex-1 flex-col [font-family:var(--font-body),var(--font-hebrew)]" style={{ background: "linear-gradient(180deg, #F6F5FB, #fff 40%), #fff" }}>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-4">
              <div className="flex items-end justify-between">
                <div>
                  <h2 className="text-[30px] font-extrabold leading-none tracking-[-0.03em] text-slate-900 [font-family:var(--font-display),var(--font-hebrew)]">Library</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {shellVideos.length} video{shellVideos.length === 1 ? "" : "s"} · {languageLabel(language)}
                  </p>
                </div>
                <button
                  onClick={() => { setLibSearch(""); setLibResults([]); setLibLang(""); setLibView("search"); }}
                  className="flex items-center gap-1.5 rounded-full bg-slate-900 px-3.5 py-2 text-xs font-bold text-white"
                >
                  <Plus className="h-3.5 w-3.5" /> Add video
                </button>
              </div>

              <div className="mt-4 flex gap-2">
                {[
                  { key: "all", label: "All" },
                  { key: "song", label: "Songs" },
                  { key: "lesson", label: "Lessons" },
                  { key: "mine", label: "My videos" },
                ].map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setLibFilter(f.key as any)}
                    className={`rounded-full px-3.5 py-2 text-xs font-bold transition ${
                      libFilter === f.key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {(() => {
                const visible =
                  libFilter === "mine" ? shellVideos.filter((v: any) => v._mine)
                  : libFilter === "song" || libFilter === "lesson" ? shellVideos.filter((v: any) => libMetas[v.video_id]?.kind === libFilter)
                  : shellVideos;
                if (visible.length === 0) {
                  return (
                    <div className="mt-4 flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
                      <p className="text-sm font-semibold text-slate-700">
                        {libFilter === "mine" ? "You haven't added any videos yet" : libFilter === "song" ? "No songs yet" : libFilter === "lesson" ? "No lessons yet" : "No videos yet"}
                      </p>
                      <p className="text-xs text-slate-500">Search YouTube and publish a video to start learning from real content.</p>
                      <button
                        onClick={() => { setLibSearch(""); setLibResults([]); setLibView("search"); }}
                        className="mt-1 flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-sm font-bold text-white"
                      >
                        <Plus className="h-4 w-4" /> Add video
                      </button>
                    </div>
                  );
                }
                return (
                  <div className="mt-4 flex flex-col gap-3.5">
                    {visible.map((v: any) => (
                      <LibraryCard
                        key={`${v._mine ? "mine" : "cat"}_${v.id}`}
                        video={v}
                        meta={libMetas[v.video_id] || null}
                        step={v.video_id ? chapterStep(chapterByVideo.get(v.video_id)) : 1}
                        onOpen={() => (v.video_id ? openChapter(v) : openShellVideo(v))}
                      />
                    ))}
                  </div>
                );
              })()}
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
              <div className="rounded-2xl border border-indigo-100 bg-white shadow-md shadow-indigo-100/70">
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
                  <div className="border-t border-indigo-50 px-2 py-2">
                    {Object.entries(LANGUAGE_FLAGS).map(([id, flag]) => (
                      <button
                        key={id}
                        onClick={() => changeLanguageMutation.mutate(id)}
                        disabled={changeLanguageMutation.isPending}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-slate-50 ${
                          id === language ? "font-semibold text-indigo-500" : "text-slate-700"
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
                // Practice & Journal moved here when the PATH tab took their slot.
                { emoji: "💬", label: "Practice", desc: "AI exercises from your newest cards", action: () => { setTab("practice"); setJournalMode("off"); } },
                { emoji: "📓", label: "Journal", desc: "Write entries and turn them into lessons", action: () => { setTab("practice"); setJournalMode("list"); } },
                { emoji: "📈", label: "Progress", desc: "Streaks, words and study time", href: "/progress" },
                { emoji: "🗓️", label: "Schedule", desc: "Your sessions and daily tasks", href: "/learn/lessons/days" },
                { emoji: "⚙️", label: "Settings", desc: "Account and preferences", href: "/settings" },
                ...(currentUser && ["admin", "coach", "owner"].includes(currentUser.role)
                  ? [{ emoji: "🛠️", label: "Admin console", desc: "Manage your school", href: "/dashboard" }]
                  : []),
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={() => ((item as any).action ? (item as any).action() : router.push((item as any).href))}
                  className="flex w-full items-center gap-3 rounded-2xl border border-indigo-100 bg-white px-4 py-3.5 text-left shadow-md shadow-indigo-100/70 transition hover:shadow-md"
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
                className="flex w-full items-center gap-3 rounded-2xl border border-red-100 bg-white px-4 py-3.5 text-left shadow-md shadow-indigo-100/70 transition hover:bg-red-50"
              >
                <span className="text-2xl">🚪</span>
                <span className="flex-1 font-medium text-red-500">Sign out</span>
              </button>
            </div>
          </div>
        )}

        {/* ================= BOTTOM MENU (pinned) ================= */}
        <div className="flex flex-shrink-0 items-center justify-around border-t border-indigo-100 bg-white px-2 py-2">
          {/* PATH is deliberately FIRST (bottom-left): it's the student's
              primary surface and the tab shown right after sign-in. */}
          {[
            { key: "path", Icon: Route, label: "LEARN", onTap: () => { closeShellVideo(); setTab("path"); } },
            { key: "learning", Icon: Backpack, label: "BACKPACK", onTap: () => { closeShellVideo(); setTab("learning"); } },
            { key: "library", Icon: Library, label: "LIBRARY", onTap: () => { closeShellVideo(); setLibView("grid"); setTab("library"); } },
            { key: "account", Icon: CircleUser, label: "ACCOUNT", onTap: () => { closeShellVideo(); setTab("account"); } },
          ].map((t) => {
            const active = tab === t.key;
            return (
            <button
              key={t.key}
              onClick={t.onTap}
              className={`flex flex-col items-center gap-1 rounded-lg px-3 py-1 text-[10px] font-semibold tracking-wide ${
                active ? "text-indigo-600" : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <t.Icon className="h-6 w-6" strokeWidth={active ? 2.4 : 2} aria-hidden="true" />
              {t.label}
            </button>
            );
          })}
        </div>
        </div>
        {/* Home indicator */}
        <div className="mx-auto mt-2 h-1 w-28 rounded-full bg-indigo-300/50" />
      </div>
    </div>
  );
}


// ---------------------------------------------------------------------------
// Backpack deck menu (variant A): "Practice all" on top, then one row per
// source video (thumbnail, title, cards, mastered, level bar), then the words
// that didn't come from a video.
// ---------------------------------------------------------------------------
// One color per level: unrated (0) · 1 · 2 · 3 · 4 · 5 mastered.
const LEVEL_COLORS = ["#cbd5e1", "#f87171", "#fb923c", "#facc15", "#a3e635", "#22c55e"];

function LevelBar({ words }: { words: any[] }) {
  const counts = [0, 0, 0, 0, 0, 0];
  for (const w of words) counts[Math.max(0, Math.min(5, Number(w.times_practiced) || 0))]++;
  const total = words.length || 1;
  return (
    <div className="flex h-1.5 overflow-hidden rounded-full bg-slate-200">
      {counts.map((c, lvl) =>
        c ? <div key={lvl} style={{ width: `${(c / total) * 100}%`, background: LEVEL_COLORS[lvl] }} /> : null
      )}
    </div>
  );
}

const deckSummary = (words: any[]) => {
  const mastered = words.filter((w) => (Number(w.times_practiced) || 0) >= 5).length;
  return `${words.length} card${words.length === 1 ? "" : "s"}${mastered ? ` · ${mastered} mastered` : ""}`;
};

function BackpackDeckMenu({
  decks,
  onOpen,
  onAdd,
  camera,
}: {
  decks: { all: any[]; videos: { key: string; videoId: string; title: string; words: any[] }[]; other: any[] };
  onOpen: (key: string) => void;
  onAdd: () => void;
  camera?: React.ReactNode;
}) {
  return (
    <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-y-auto pb-4">
      <div className="rounded-3xl bg-slate-900 p-4 text-white shadow-xl shadow-slate-900/20">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-lg font-bold">🎒 Practice all flashcards</p>
            <p className="mt-0.5 text-xs text-slate-400">{deckSummary(decks.all)}</p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            {camera}
            <button
              onClick={onAdd}
              aria-label="Add words"
              title="Add words"
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-fuchsia-500 to-indigo-500 text-white shadow-md transition hover:scale-105"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="mt-3">
          <LevelBar words={decks.all} />
        </div>
        <button
          onClick={() => onOpen("all")}
          className="mt-3 w-full rounded-xl bg-gradient-to-r from-teal-500 to-indigo-500 py-2.5 text-sm font-bold text-white shadow"
        >
          Start practice
        </button>
      </div>

      {decks.videos.length > 0 && (
        <p className="mb-2 ml-1 mt-5 text-[11px] font-bold uppercase tracking-wider text-slate-500">From your videos</p>
      )}
      {decks.videos.map((g) => (
        <button
          key={g.key}
          onClick={() => onOpen(g.key)}
          className="mb-2 flex items-center gap-3 rounded-2xl border border-indigo-50 bg-white p-2 text-left shadow-sm transition hover:border-indigo-200"
        >
          <div className="relative h-14 w-24 flex-shrink-0 overflow-hidden rounded-xl bg-slate-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`https://i.ytimg.com/vi/${g.videoId}/mqdefault.jpg`} alt="" className="h-full w-full object-cover" />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900/60 text-[10px] text-white">▶</span>
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-sm font-semibold leading-tight text-slate-900">{g.title}</p>
            <p className="mb-1.5 mt-0.5 text-[11px] text-slate-500">{deckSummary(g.words)}</p>
            <LevelBar words={g.words} />
          </div>
          <span className="pr-1 text-lg font-bold text-indigo-500">›</span>
        </button>
      ))}

      {decks.other.length > 0 && (
        <>
          {decks.videos.length > 0 && (
            <p className="mb-2 ml-1 mt-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">More</p>
          )}
          <button
            onClick={() => onOpen("other")}
            className={`${decks.videos.length ? "" : "mt-5 "}mb-2 flex items-center gap-3 rounded-2xl border border-indigo-50 bg-white p-2 text-left shadow-sm transition hover:border-indigo-200`}
          >
            <div className="flex h-14 w-24 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-400 to-cyan-400 text-2xl">
              ✍️
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">Other words</p>
              <p className="mb-1.5 mt-0.5 text-[11px] text-slate-500">{deckSummary(decks.other)}</p>
              <LevelBar words={decks.other} />
            </div>
            <span className="pr-1 text-lg font-bold text-indigo-500">›</span>
          </button>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PATH chapter · Step 1 "Watch for Meaning — Uninterrupted".
// Full-screen video with no controls, subtitles, text or translation; it can't
// be paused or skipped (a layer blocks taps and a pause is resumed at once). A
// countdown shows the time left. When the video ends the student answers
// "How much did you understand?" (1–100%) — the chapter's baseline score.
// ---------------------------------------------------------------------------
function formatClock(s: number | null) {
  if (s == null || !isFinite(s)) return "–:––";
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

// A chapter's content is at most 3.5 minutes; longer videos use the first 3:30.
const CHAPTER_MAX_SECONDS = 210;

// No subtitles in chapter step 1: turn off YouTube captions (CC / auto-translate).
function hideCaptions(player: any) {
  try { player.setOption?.("captions", "track", {}); } catch {}
  try { player.unloadModule?.("captions"); } catch {}
  try { player.unloadModule?.("cc"); } catch {}
}

function ChapterWatch({
  video,
  onExit,
  onSave,
  onSkip,
  final = false,
}: {
  video: any;
  onExit: () => void;
  onSave: (score: number) => Promise<void>;
  onSkip?: () => void;
  // Step 4 "Final Uninterrupted Pass": same rules, different wording.
  final?: boolean;
}) {
  const [phase, setPhase] = useState<"intro" | "watching" | "rate">("intro");
  const [remaining, setRemaining] = useState<number | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [needsTap, setNeedsTap] = useState(false);
  // Our own cover whenever the video isn't actually playing, so YouTube's
  // pause/end screen (title, share, "More videos", big ▶) is never visible.
  const [playing, setPlaying] = useState(false);
  const [score, setScore] = useState(50);
  const [saving, setSaving] = useState(false);
  const playerRef = useRef<any>(null);
  const endedRef = useRef(false);
  const tint = useCoverTint(video?.video_id);
  const shortTitle = useDisplayTitle(video);

  useEffect(() => {
    if (phase !== "watching") return;
    endedRef.current = false;
    const finish = () => {
      if (endedRef.current) return;
      endedRef.current = true;
      try { playerRef.current?.pauseVideo?.(); } catch {}
      setPhase("rate");
    };
    let cancelled = false;
    let poll: any = null;
    let startCheck: any = null;
    loadYouTubeApi().then((YT: any) => {
      if (cancelled) return;
      playerRef.current = new YT.Player("chapter-yt-player", {
        videoId: video.video_id,
        playerVars: {
          autoplay: 1, controls: 0, disablekb: 1, fs: 0, rel: 0, modestbranding: 1,
          iv_load_policy: 3, cc_load_policy: 0, playsinline: 1,
          end: CHAPTER_MAX_SECONDS, // play at most the first 3:30
        },
        events: {
          onReady: (e: any) => {
            hideCaptions(e.target);
            e.target.playVideo();
            // Some browsers block autoplay with sound: offer one tap to start.
            startCheck = setTimeout(() => {
              const st = playerRef.current?.getPlayerState?.();
              if (st !== 1 && st !== 3) setNeedsTap(true);
            }, 1500);
          },
          // YouTube (re)loads captions when playback starts if the viewer has CC
          // on in their account — switch them off every time it does.
          onApiChange: (e: any) => hideCaptions(e.target),
          onStateChange: (e: any) => {
            setPlaying(e.data === 1);
            if (e.data === 1) { setNeedsTap(false); hideCaptions(e.target); }
            if (e.data === 0) finish();                                    // ended → step complete
            else if (e.data === 2 && !endedRef.current) e.target.playVideo(); // no pausing
          },
        },
      });
      poll = setInterval(() => {
        const p = playerRef.current;
        if (!p?.getDuration) return;
        const d = Math.min(p.getDuration() || 0, CHAPTER_MAX_SECONDS);
        const t = p.getCurrentTime() || 0;
        if (d > 0) {
          setTotal(d);
          setRemaining(Math.max(0, d - t));
          if (t >= d - 0.25) finish(); // safety net if YouTube doesn't report "ended"
        }
      }, 250);
    });
    return () => {
      cancelled = true;
      clearInterval(poll);
      clearTimeout(startCheck);
      try { playerRef.current?.destroy?.(); } catch {}
      playerRef.current = null;
    };
  }, [phase, video.video_id]);

  const progress = total && remaining != null ? Math.min(1, Math.max(0, 1 - remaining / total)) : 0;

  // Intro (design P5): light, tinted with the cover's colour like the other
  // chapter screens; the watching / rating phases stay dark.
  if (phase === "intro") {
    const t = tint || "196,190,240";
    const secs = Math.min(Math.round(Number(video?.duration_minutes) * 60) || CHAPTER_MAX_SECONDS, CHAPTER_MAX_SECONDS);
    const step = final ? 4 : 1;
    return (
      <div
        className="absolute inset-0 z-30 flex flex-col px-5 pb-6 text-slate-900 [font-family:var(--font-body),var(--font-hebrew)]"
        style={{ background: `linear-gradient(180deg, rgba(${t},.5) 0%, rgba(${t},.18) 40%, #fff 70%), #fff` }}
      >
        <div className="flex flex-shrink-0 items-center justify-between pt-9">
          <button onClick={onExit} className="flex items-center gap-1 rounded-full bg-white/75 px-3.5 py-2 text-xs font-bold text-slate-900">
            <X className="h-3.5 w-3.5" /> Exit
          </button>
          {onSkip && (
            <button onClick={onSkip} className="flex items-center gap-0.5 px-2 py-2 text-xs font-bold text-slate-500">
              Skip <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* the chapter's 4 steps */}
        <div className="mt-4 flex flex-shrink-0 gap-1.5">
          {[1, 2, 3, 4].map((n) => (
            <span key={n} className={`h-1 flex-1 rounded-full ${n <= step ? "bg-slate-900" : "bg-slate-900/15"}`} />
          ))}
        </div>

        <div className="mt-5 flex flex-shrink-0 items-center gap-3.5">
          <div
            className="h-[120px] w-[120px] flex-shrink-0 rounded-2xl bg-slate-200 bg-cover bg-center"
            style={{ backgroundImage: `url(https://i.ytimg.com/vi/${video.video_id}/mqdefault.jpg)`, boxShadow: `0 18px 34px -18px rgba(${t},.95)` }}
          />
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-600">
              {final ? "Step 4 — Final pass" : "Step 1 — First listen"}
            </p>
            {shortTitle ? (
              <>
                <p className="mt-1.5 line-clamp-2 text-[28px] font-extrabold leading-none tracking-[-0.03em] [font-family:var(--font-display),var(--font-hebrew)]">{shortTitle.name}</p>
                {shortTitle.artist && <p className="mt-1.5 truncate text-sm italic text-slate-500">{shortTitle.artist}</p>}
              </>
            ) : (
              <p className="mt-1.5 line-clamp-4 text-lg font-extrabold leading-snug tracking-tight [font-family:var(--font-display),var(--font-hebrew)]">{video.title}</p>
            )}
          </div>
        </div>

        <p className="mt-6 flex-shrink-0 text-[30px] font-extrabold leading-[1.1] tracking-[-0.02em] [font-family:var(--font-display),var(--font-hebrew)]">
          {final ? "How much do you understand now?" : "How much can you understand without help?"}
        </p>

        <div className="mt-5 grid flex-shrink-0 grid-cols-2 gap-2.5">
          <div className="flex items-center gap-2.5 rounded-2xl bg-white px-3.5 py-3 shadow-[0_1px_0_rgba(15,18,34,.06)]">
            <Clock className="h-5 w-5 flex-shrink-0" />
            <div>
              <p className="text-base font-extrabold leading-tight">{fmtTime(secs)}</p>
              <p className="text-[11px] text-slate-500">without stopping</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 rounded-2xl bg-white px-3.5 py-3 shadow-[0_1px_0_rgba(15,18,34,.06)]">
            <Star className="h-5 w-5 flex-shrink-0" />
            <div>
              <p className="text-base font-extrabold leading-tight">Rate</p>
              <p className="text-[11px] text-slate-500">at the end</p>
            </div>
          </div>
        </div>

        <div className="mt-3.5 flex flex-shrink-0 flex-wrap gap-2">
          {[
            { Icon: CaptionsOff, label: "No subtitles" },
            { Icon: Languages, label: "No translation" },
            { Icon: NoPauseIcon, label: "No pausing" },
          ].map(({ Icon, label }) => (
            <span key={label} className="flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-[11px] font-semibold text-slate-700 shadow-[0_1px_0_rgba(15,18,34,.06)]">
              <Icon className="h-3.5 w-3.5" /> {label}
            </span>
          ))}
        </div>

        <button
          onClick={() => setPhase("watching")}
          className="mt-auto flex h-14 flex-shrink-0 items-center justify-center gap-2 rounded-full bg-slate-900 text-base font-extrabold text-white shadow-[0_16px_30px_-14px_rgba(15,18,34,.7)] transition active:scale-[.98]"
        >
          <Play className="h-4 w-4 fill-current" /> Start
        </button>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-[#07060f] text-white">
      {/* Top bar */}
      <div className="flex flex-shrink-0 items-center justify-between px-4 pb-2 pt-9">
        <button onClick={onExit} className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/15">
          ✕ Exit
        </button>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-slate-200">{final ? "🎬 Final pass" : "🎬 Watch for meaning"}</span>
          {onSkip && (
            <button onClick={onSkip} className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/15">
              Skip ›
            </button>
          )}
        </div>
      </div>

      {phase === "watching" && (
        <div className="relative flex flex-1 flex-col justify-center">
          <div className="relative aspect-video w-full bg-black">
            <div id="chapter-yt-player" className="absolute inset-0 h-full w-full" />
            {/* Blocks taps/hover on the player: no pausing, seeking or YouTube UI. */}
            <div className="absolute inset-0" onClick={(e) => e.preventDefault()} />
            {!playing && !needsTap && (
              <div className="absolute inset-0 flex items-center justify-center bg-black text-xs text-slate-400">Loading…</div>
            )}
            {needsTap && (
              <button
                onClick={() => { playerRef.current?.playVideo?.(); setNeedsTap(false); }}
                className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm font-bold"
              >
                ▶ Tap to start
              </button>
            )}
          </div>
          <div className="mt-10 text-center">
            <p className="text-5xl font-extrabold tabular-nums tracking-wide">{formatClock(remaining)}</p>
            <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-slate-400">remaining</p>
          </div>
          <div className="mx-6 mt-6 h-1 overflow-hidden rounded-full bg-white/15">
            <div className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 to-indigo-500" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      )}

      {phase === "rate" && (
        <div className="flex flex-1 flex-col items-center justify-center px-5">
          <div className="w-full rounded-3xl bg-white p-6 text-center text-slate-900 shadow-2xl">
            <p className="text-3xl">🎧</p>
            <p className="mt-2 text-xl font-bold text-indigo-950">How much did you understand?</p>
            <p className="mt-1 text-xs text-slate-500">The overall meaning, story and context — not every word.</p>
            <p className="mt-4 bg-gradient-to-r from-fuchsia-500 to-indigo-500 bg-clip-text text-6xl font-extrabold text-transparent">{score}%</p>
            <input
              type="range"
              min={1}
              max={100}
              value={score}
              onChange={(e) => setScore(Number(e.target.value))}
              aria-label="How much did you understand, from 1 to 100 percent"
              className="mt-4 w-full accent-indigo-500"
            />
            <div className="mt-1 flex justify-between text-[10px] text-slate-400"><span>1%</span><span>100%</span></div>
            <button
              disabled={saving}
              onClick={async () => { setSaving(true); try { await onSave(score); } finally { setSaving(false); } }}
              className="mt-5 w-full rounded-2xl bg-gradient-to-r from-fuchsia-500 to-indigo-500 py-3 text-base font-bold text-white shadow-lg shadow-indigo-500/30 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PATH chapter · Step 2 "Sentence-by-Sentence Discovery" (below the player).
// One sentence at a time: it plays without translation, is shown in the target
// language with every word tappable (meaning at once, add to Backpack, the
// sentence replays), then "Show translation" reveals it and replays once more.
// Recommended words (picked by the system) are underlined and starred.
// ---------------------------------------------------------------------------
// Library card (design L6). Opens the video's chapter where the student left it.
function LibraryCard({ video, meta, step, onOpen }: { video: any; meta: VideoMeta | null; step: number; onOpen: () => void }) {
  const short = meta;
  const vid = video.video_id || "";
  const thumb = video.thumbnail_url || (vid ? `https://i.ytimg.com/vi/${vid}/mqdefault.jpg` : "");
  const dur = fmtMinutes(video.duration_minutes);
  const cta = step === 5 ? "Review" : step > 1 ? "Continue" : "Start";
  return (
    <button
      onClick={onOpen}
      className="grid grid-cols-[130px_minmax(0,1fr)] overflow-hidden rounded-[22px] bg-white text-left shadow-[0_0_0_1px_#ECECF3] transition active:scale-[.99]"
    >
      <span className="relative row-span-2 min-h-[96px] bg-slate-200 bg-cover bg-center" style={thumb ? { backgroundImage: `url(${thumb})` } : undefined}>
        {dur && <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/75 px-1.5 py-0.5 text-[10px] font-bold text-white">{dur}</span>}
      </span>
      <span className="flex items-center gap-2.5 px-3 pt-2.5">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[17px] font-extrabold leading-tight tracking-[-0.01em] text-slate-900 [font-family:var(--font-display),var(--font-hebrew)]">
            {short?.name || video.title}
          </span>
          <span className="mt-0.5 block truncate text-[13px] text-slate-500">
            {short?.artist || ""}
          </span>
        </span>
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-slate-900 text-white">
          {step === 5 ? <Check className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
        </span>
      </span>
      <span className="flex items-center gap-2.5 px-3 pb-2.5 pt-1.5">
        <span className="flex gap-1">
          {[1, 2, 3, 4].map((n) => (
            <span key={n} className={`h-[5px] w-[22px] rounded-full ${n < step ? "bg-slate-900" : "bg-slate-200"}`} />
          ))}
        </span>
        {video._mine && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">Mine</span>}
        <span className="ml-auto text-xs font-extrabold text-slate-900">{cta}</span>
      </span>
    </button>
  );
}

function DiscoveryPanel({
  mode = "discovery", loading, preparing = false, segments, idx, revealed, translation, translating, wordPopup, recommendedFor, recommendedCount,
  onTapWord, onAddWord, onClosePopup, onReplay, playing, onPause, onResume, onReveal, onHideTranslation, onPrev, onNext, onFinish,
  title, artist, progress, recommendedWords,
}: {
  // "discovery" (step 2): words tappable, recommended words marked.
  // "comprehension" (step 3): less help — words not tappable.
  mode?: "discovery" | "comprehension";
  loading: boolean;
  // Only while the sentences are really being made (first open of a video);
  // otherwise loading is just the quick lookup of the saved ones.
  preparing?: boolean;
  segments: any[];
  idx: number;
  revealed: boolean;
  translation?: { english: string; phonetic: string };
  translating: boolean;
  wordPopup: any;
  recommendedFor: (token: string) => any;
  recommendedCount: number;
  onTapWord: (key: string, token: string, sentence: string) => void;
  onAddWord: () => void;
  onClosePopup: () => void;
  onReplay: () => void;
  playing: boolean;
  onPause: () => void;
  onResume: () => void;
  onReveal: () => void;
  onHideTranslation: () => void;
  onPrev: () => void;
  onNext: () => void;
  onFinish: () => void;
  title?: string;
  artist?: string;
  // How far the video is through the current sentence, 0–1.
  progress: number;
  recommendedWords: any[];
}) {
  if (loading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10">
        <Loader2 className="h-6 w-6 animate-spin text-slate-700" />
        {preparing ? (
          <>
            <p className="text-xs font-semibold text-slate-700">Preparing the sentences…</p>
            <p className="max-w-[240px] text-center text-[11px] text-slate-500">First time for this video only — about a minute.</p>
          </>
        ) : (
          <p className="text-xs text-slate-600">Loading…</p>
        )}
      </div>
    );
  }
  if (!segments.length) {
    return <p className="py-10 text-center text-sm text-slate-500">No sentences available for this video.</p>;
  }
  const seg = segments[Math.min(idx, segments.length - 1)];
  // Older lyric imports glued the romanization onto the Hebrew line.
  const split = splitScriptLine(seg.hebrew || seg.text || "");
  const main = split.native || seg.transliteration || "";
  const rtl = isRTLText(main);
  const tokens = main.split(/\s+/).filter(Boolean);
  const english = seg.english || translation?.english || "";
  const phonetic =
    (seg.transliteration && !isRTLText(seg.transliteration) && seg.transliteration !== main ? seg.transliteration : "") ||
    split.latin || translation?.phonetic || "";
  const last = idx >= segments.length - 1;
  const popupKeyPrefix = `d${idx}_`;
  const popupOpen = wordPopup && String(wordPopup.key || "").startsWith(popupKeyPrefix);
  const popupRec = popupOpen ? recommendedFor(wordPopup.clean) : null;
  const tappable = mode === "discovery";
  const chips = tappable ? recommendedWords.slice(0, 4) : [];
  const sideBtn = "relative flex h-11 w-11 items-center justify-center rounded-full transition active:scale-95";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-3">
      {/* title + position */}
      <div className="mt-4 flex flex-shrink-0 items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="line-clamp-2 text-[24px] font-extrabold leading-none tracking-[-0.02em] text-slate-900 [font-family:var(--font-display),var(--font-hebrew)]">{title}</p>
          {artist && <p className="mt-1 truncate text-sm text-slate-600">{artist}</p>}
        </div>
        <span className="flex-shrink-0 rounded-lg bg-white/75 px-2.5 py-1 text-xs font-extrabold text-slate-700">
          {idx + 1} / {segments.length}
        </span>
      </div>

      {/* the sentence: phonetic, native line (words tappable), translation */}
      <div className="mt-3 flex-shrink-0 text-center">
        <p className="text-sm italic text-slate-600">{phonetic || (translating ? "…" : " ")}</p>
        <p dir={rtl ? "rtl" : "ltr"} className="mt-1 text-[24px] font-medium leading-[1.45] text-slate-900">
          {tokens.map((tok: string, wi: number) => {
            const key = `${popupKeyPrefix}${wi}`;
            const open = wordPopup?.key === key;
            const rec = tappable ? recommendedFor(tok) : null;
            if (!tappable) return <span key={key}>{tok}{wi < tokens.length - 1 ? " " : ""}</span>;
            return (
              <span key={key}>
                <span
                  onClick={() => onTapWord(key, tok, main)}
                  className={`cursor-pointer rounded-md px-0.5 transition ${open ? "bg-white" : "hover:bg-white/60"} ${
                    rec ? "bg-[linear-gradient(transparent_64%,rgba(217,70,239,.3)_64%)]" : "border-b-2 border-dotted border-slate-400/50"
                  }`}
                >
                  {tok}
                </span>
                {wi < tokens.length - 1 ? " " : ""}
              </span>
            );
          })}
        </p>
        {revealed && (
          <p className="mt-1.5 text-sm text-slate-600">{english || (translating ? "translating…" : "—")}</p>
        )}
      </div>

      {/* tapped word: meaning at once + add to Backpack */}
      {tappable && popupOpen && (
        <div className="mt-3 flex flex-shrink-0 items-center gap-2 rounded-2xl bg-white px-3 py-2 shadow-sm">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span dir={rtl ? "rtl" : "ltr"} className="text-lg font-bold text-slate-900">{wordPopup.clean}</span>
              {wordPopup.phonetic && <span className="truncate text-xs italic text-slate-500">{wordPopup.phonetic}</span>}
              {popupRec && <span className="text-[10px] font-bold uppercase tracking-wider text-fuchsia-600">Recommended</span>}
            </div>
            <p className="truncate text-xs text-slate-700">
              {wordPopup.loading ? "translating…" : `= ${wordPopup.translation || popupRec?.meaning || "—"}`}
            </p>
          </div>
          <button
            onClick={onAddWord}
            disabled={wordPopup.saving || wordPopup.added}
            className="flex-shrink-0 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
          >
            {wordPopup.added ? "Added" : wordPopup.saving ? "…" : "+ Add"}
          </button>
          <button onClick={onClosePopup} aria-label="Close" className="flex-shrink-0 p-1 text-slate-400"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* scrubber: one tick per sentence, the current one fills as it plays */}
      <div className="mt-4 flex-shrink-0">
        <div className="flex h-1 gap-[2px]">
          {segments.map((_: any, i: number) => (
            <span key={i} className="h-full flex-1 overflow-hidden rounded-full bg-slate-900/15">
              <span
                className="block h-full bg-slate-900"
                style={{ width: i < idx ? "100%" : i === idx ? `${Math.round(progress * 100)}%` : "0%" }}
              />
            </span>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[11px] font-semibold tabular-nums text-slate-500">
          <span>{fmtTime(seg.start)}</span>
          <span>{fmtTime(seg.end)}</span>
        </div>
      </div>

      {/* transport: Translate · Previous · Play · Next · Replay */}
      <div className="mt-1 flex flex-shrink-0 items-center justify-between">
        <button
          onClick={revealed ? onHideTranslation : onReveal}
          aria-label={revealed ? "Hide translation" : "Show translation"}
          aria-pressed={revealed}
          className={`${sideBtn} ${revealed ? "text-slate-900" : "text-slate-500"}`}
        >
          <Languages className="h-[22px] w-[22px]" />
          {revealed && <span className="absolute bottom-0 h-1 w-1 rounded-full bg-current" />}
        </button>
        <button onClick={onPrev} disabled={idx === 0} aria-label="Previous sentence" className="flex h-12 w-12 items-center justify-center text-slate-900 disabled:opacity-30">
          <SkipBack className="h-7 w-7 fill-current" />
        </button>
        <button
          onClick={playing ? onPause : onResume}
          aria-label={playing ? "Pause" : "Play"}
          className="flex h-[68px] w-[68px] items-center justify-center rounded-full bg-slate-900 text-white shadow-[0_14px_30px_-10px_rgba(15,18,34,.6)] transition active:scale-95"
        >
          {playing ? <Pause className="h-7 w-7 fill-current" /> : <Play className="ml-1 h-7 w-7 fill-current" />}
        </button>
        {last ? (
          <button onClick={onFinish} aria-label={tappable ? "Finish discovery" : "Finish pass"} className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-white">
            <Check className="h-6 w-6" />
          </button>
        ) : (
          <button onClick={onNext} aria-label="Next sentence" className="flex h-12 w-12 items-center justify-center text-slate-900">
            <SkipForward className="h-7 w-7 fill-current" />
          </button>
        )}
        <button onClick={onReplay} aria-label="Replay sentence" className={`${sideBtn} text-slate-500`}>
          <RotateCcw className="h-[22px] w-[22px]" />
        </button>
      </div>
      <div className="flex flex-shrink-0 justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500">
        <span className="w-11 text-center">Translate</span>
        <span className="w-12 text-center">{last ? "" : ""}</span>
        <span />
        <span className="w-12 text-center text-emerald-600">{last ? "Finish" : ""}</span>
        <span className="w-11 text-center">Replay</span>
      </div>

      {/* the chapter's recommended words */}
      {chips.length > 0 && (
        <div className="mt-4 flex flex-shrink-0 gap-2">
          {chips.map((w: any) => (
            <span key={w.hebrew} className="min-w-0 flex-1 rounded-xl bg-white px-1.5 py-2 text-center shadow-[0_1px_0_rgba(15,18,34,.06)]">
              <span dir="rtl" className="block truncate text-base text-slate-900">{w.hebrew}</span>
              <span className="block truncate text-[10px] text-slate-500">{w.meaning}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// End of step 4: the chapter's measurable progress, "Before 42% → After 87%".
// ---------------------------------------------------------------------------
function ChapterResult({ title, before, after, onClose }: { title: string; before: number; after: number; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-gradient-to-b from-[#f7f8ff] via-[#f2f4fe] to-[#e9ecfd] px-5">
      <div className="w-full rounded-3xl bg-white p-6 text-center shadow-2xl shadow-indigo-200/70">
        <p className="text-3xl">🎉</p>
        <p className="mt-1 text-xl font-bold text-indigo-950">Chapter complete</p>
        {title && <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{title}</p>}
        <p className="mt-4 text-[11px] font-bold uppercase tracking-wider text-slate-400">How much you understood</p>
        <div className="mt-3 flex items-center justify-center gap-3">
          <div className="flex h-24 w-24 flex-col items-center justify-center rounded-full bg-rose-50 text-rose-600">
            <span className="text-3xl font-extrabold">{before}%</span>
            <span className="text-[10px] font-bold uppercase tracking-wider">Before</span>
          </div>
          <span className="text-2xl text-indigo-300">➜</span>
          <div className="flex h-24 w-24 flex-col items-center justify-center rounded-full bg-emerald-50 text-emerald-600 shadow-lg shadow-emerald-200">
            <span className="text-3xl font-extrabold">{after}%</span>
            <span className="text-[10px] font-bold uppercase tracking-wider">After</span>
          </div>
        </div>
        <button onClick={onClose} className="mt-5 w-full rounded-2xl bg-gradient-to-r from-fuchsia-500 to-indigo-500 py-3 text-base font-bold text-white shadow-lg shadow-indigo-500/30">
          Done
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Backpack Words · Select. New words (recommended by the chapter + the ones the
// student tapped) are decided one by one: swipe right / ✓ Learn = join study,
// swipe left / ↓ Skip = not useful. An optional priority (1–5) can be set —
// it's about importance, not about how well the word is known.
// ---------------------------------------------------------------------------
function WordTriage({
  words,
  onDecide,
  onClose,
}: {
  words: any[];
  onDecide: (w: any, learn: boolean, priority: number | null) => Promise<void>;
  onClose: () => void;
}) {
  // Freeze the queue when the screen opens so cards don't jump as they're decided.
  const [queue] = useState<any[]>(() => words.slice());
  const [i, setI] = useState(0);
  const [learned, setLearned] = useState(0);
  const [showPriority, setShowPriority] = useState(false);
  const [priority, setPriority] = useState<number | null>(null);
  const [leaving, setLeaving] = useState<0 | 1 | -1>(0);
  const w = queue[i];

  const decide = async (learn: boolean) => {
    if (!w || leaving) return;
    setLeaving(learn ? 1 : -1);
    await onDecide(w, learn, priority);
    if (learn) setLearned((n) => n + 1);
    setPriority(null);
    setShowPriority(false);
    setLeaving(0);
    setI((n) => n + 1);
  };

  if (!w) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-4xl">🎒</p>
        <p className="text-lg font-bold text-slate-900">All decided!</p>
        <p className="text-sm text-slate-500">
          {learned} word{learned === 1 ? "" : "s"} added to your study. Masteri is preparing their mnemonics.
        </p>
        <button onClick={onClose} className="mt-2 rounded-2xl bg-gradient-to-r from-fuchsia-500 to-indigo-500 px-8 py-3 text-sm font-bold text-white shadow-md">
          Back to Backpack
        </button>
      </div>
    );
  }

  const rtl = isRTLText(w.word || "");
  return (
    <div className="flex min-h-0 flex-1 flex-col pt-2">
      <div className="flex flex-shrink-0 items-center gap-2 px-1">
        <button onClick={onClose} className="rounded-full border border-indigo-100 bg-white px-3 py-1 text-xs font-semibold text-indigo-600 shadow-sm">← Back</button>
        <span className="flex-1 text-sm font-semibold text-slate-700">New words</span>
        <span className="text-xs font-semibold text-slate-400">{i + 1} / {queue.length}</span>
      </div>

      <div className="relative mt-4 flex flex-1 items-start justify-center">
        <motion.div
          key={w.id}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.9}
          onDragEnd={(_: any, info: any) => {
            if (info.offset.x > 110) decide(true);
            else if (info.offset.x < -110) decide(false);
          }}
          initial={{ opacity: 0, y: 12, scale: 0.97 }}
          animate={leaving ? { x: leaving * 420, rotate: leaving * 12, opacity: 0 } : { opacity: 1, y: 0, scale: 1, x: 0, rotate: 0 }}
          transition={{ duration: 0.25 }}
          className="w-full cursor-grab touch-pan-y select-none rounded-3xl bg-white p-6 text-center shadow-xl shadow-indigo-200/60 active:cursor-grabbing"
        >
          {w.source_video_title && (
            <p className="mb-3 truncate text-[11px] font-semibold text-slate-400">📺 {w.source_video_title}</p>
          )}
          <p dir={rtl ? "rtl" : "ltr"} className="text-4xl font-extrabold leading-tight text-indigo-950">{w.word}</p>
          {w.phonetic && w.phonetic !== w.word && <p className="mt-1 text-lg italic text-indigo-500">{w.phonetic}</p>}
          <p className="mt-2 text-xl font-semibold text-slate-800">{w.translation || "—"}</p>
          {w.example_sentence && (
            <p dir={isRTLText(w.example_sentence) ? "rtl" : "ltr"} className="mt-4 rounded-2xl bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-600">
              {w.example_sentence}
            </p>
          )}

          {showPriority ? (
            <div className="mt-4" onPointerDownCapture={(e) => e.stopPropagation()}>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Priority (optional)</p>
              <div className="mt-2 flex justify-center gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setPriority(priority === n ? null : n)}
                    className={`h-9 w-9 rounded-full text-sm font-bold ${priority === n ? "bg-indigo-500 text-white" : "bg-slate-100 text-slate-500"}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-slate-400">How important it is to you — not how well you know it</p>
            </div>
          ) : (
            <button onClick={() => setShowPriority(true)} className="mt-4 text-xs font-semibold text-indigo-500 underline decoration-dotted">
              Set priority (optional)
            </button>
          )}
        </motion.div>
      </div>

      <p className="mb-2 mt-3 flex-shrink-0 text-center text-[11px] text-slate-400">Swipe right to learn · left to skip</p>
      <div className="flex flex-shrink-0 gap-3 pb-3">
        <button onClick={() => decide(false)} className="flex-1 rounded-2xl border border-slate-200 bg-white py-3.5 text-base font-bold text-slate-500 shadow-sm">
          ↓ Skip
        </button>
        <button onClick={() => decide(true)} className="flex-1 rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-500 py-3.5 text-base font-bold text-white shadow-md shadow-emerald-200">
          ✓ Learn
        </button>
      </div>
    </div>
  );
}
