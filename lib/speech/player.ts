// Browser half of platform listen-aloud. Tries POST /api/speech/tts (neural
// voice, cached) and falls back to speechSynthesis in the learner's locale.
// One playback at a time. Safe to call from any school UI.

import { speechLocale } from "./voices";

export type SpeechRequest = {
  text: string;
  /** Learning-language id: "hebrew", "spanish", … */
  language?: string | null;
  /** Optional BCP-47 override, e.g. "he-IL". */
  locale?: string | null;
  speed?: number;
  /** Loose match against an installed browser voice name. */
  voicePreference?: string;
};

export type SpeechPlayback = {
  /** Resolves when playback ends or is stopped. Rejects if nothing could speak. */
  finished: Promise<void>;
  stop: () => void;
};

const clips = new Map<string, Blob>();
let serverAvailable: boolean | null = null;
let stopCurrent: (() => void) | null = null;

export function stopSpeech() {
  stopCurrent?.();
  stopCurrent = null;
}

function pickBrowserVoice(bcp47: string, voicePreference?: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices?.() || [];
  if (!voices.length) return null;
  const lang = bcp47.toLowerCase();
  const base = lang.split("-")[0];
  if (voicePreference) {
    const named = voices.find((v) => v.name.toLowerCase().includes(voicePreference.toLowerCase()));
    if (named) return named;
  }
  return (
    voices.find((v) => v.lang.toLowerCase() === lang) ||
    voices.find((v) => v.lang.toLowerCase().startsWith(base)) ||
    null
  );
}

function browserSpeak(req: SpeechRequest, locale: string, onPlaying?: () => void, isStopped?: () => boolean): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis || typeof SpeechSynthesisUtterance !== "function") {
      resolve(false);
      return;
    }
    const synth = window.speechSynthesis;
    const rate = Math.min(1.5, Math.max(0.5, req.speed ?? 1));
    const speakNow = () => {
      if (isStopped?.()) { resolve(true); return; }
      const u = new SpeechSynthesisUtterance(req.text);
      u.lang = locale;
      u.rate = rate;
      const voice = pickBrowserVoice(locale, req.voicePreference);
      if (voice) u.voice = voice;
      u.onend = () => resolve(true);
      u.onerror = () => resolve(false);
      onPlaying?.();
      synth.cancel();
      synth.resume();
      synth.speak(u);
    };
    synth.resume();
    if (!synth.getVoices().length) {
      let done = false;
      const once = () => { if (!done) { done = true; speakNow(); } };
      synth.addEventListener("voiceschanged", once, { once: true });
      setTimeout(once, 400);
    } else {
      setTimeout(speakNow, 40);
    }
  });
}

async function fetchClip(text: string, language: string | null | undefined, locale: string, signal: AbortSignal): Promise<Blob | null> {
  const key = `${language || ""}|${locale}|${text}`;
  const hit = clips.get(key);
  if (hit) return hit;
  if (serverAvailable === false) return null;
  const res = await fetch("/api/speech/tts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, language: language || undefined, locale }),
    signal,
  });
  if (res.status === 503) {
    serverAvailable = false;
    return null;
  }
  if (!res.ok) throw new Error(`Speech ${res.status}`);
  const blob = await res.blob();
  clips.set(key, blob);
  serverAvailable = true;
  return blob;
}

function playBlob(blob: Blob, rate: number, onPlaying?: () => void, onStop: (audio: HTMLAudioElement) => void = () => {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.playbackRate = rate;
    onStop(audio);
    audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
    audio.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Playback failed")); };
    audio.play().then(() => onPlaying?.()).catch(reject);
  });
}

/** Speak `text` in the learner's language. Hebrew uses an Israeli voice when a provider key is set. */
export function playSpeech(req: SpeechRequest, hooks?: { onPlaying?: () => void }): SpeechPlayback {
  stopSpeech();
  const text = String(req.text || "").trim();
  const locale = speechLocale(req.language, req.locale);
  const rate = Math.min(1.5, Math.max(0.5, req.speed ?? 1));
  const ac = new AbortController();
  let audio: HTMLAudioElement | null = null;
  let stopped = false;
  const stop = () => {
    stopped = true;
    ac.abort();
    if (audio) {
      audio.pause();
      audio.src = "";
    }
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
  };
  stopCurrent = stop;

  const finished = (async () => {
    if (!text) throw new Error("Nothing to speak");
    let clip: Blob | null = null;
    try {
      clip = await fetchClip(text, req.language, locale, ac.signal);
    } catch (err) {
      if (stopped || (err as { name?: string })?.name === "AbortError") return;
    }
    if (stopped) return;
    if (clip) {
      await playBlob(clip, rate, hooks?.onPlaying, (a) => { audio = a; });
      return;
    }
    const ok = await browserSpeak({ ...req, text }, locale, hooks?.onPlaying, () => stopped);
    if (!ok && !stopped) throw new Error("No voice available for this language");
  })();

  return { finished, stop };
}
