// Reusable lesson text-to-speech abstraction.
//
// The app has no server-side TTS provider yet, so this default implementation
// speaks with the browser's built-in Web Speech API (SpeechSynthesis). It is
// deliberately the ONLY place the UI touches audio synthesis — pages/components
// call `generateLessonAudio(...)` and drive the returned player, they never
// construct utterances or <audio> elements themselves.
//
// Swapping to a hosted TTS provider later (OpenAI / ElevenLabs / Google) means
// changing only this file: fetch an audio URL from an edge function and return a
// player backed by an HTMLAudioElement. The `LessonAudioPlayer` contract below
// stays the same, so no caller changes.

export type LessonLanguage =
  | "hebrew"
  | "english"
  | "spanish"
  | "french"
  | "portuguese"
  | "italian"
  | string;

export interface GenerateLessonAudioOptions {
  /** The text to speak, in the target language. */
  text: string;
  /** Target language name as used across the app (e.g. "hebrew", "spanish"). */
  language: LessonLanguage;
  /** Optional preferred voice name (matched loosely against installed voices). */
  voicePreference?: string;
  /** Playback rate. 1 = normal. Clamped to [0.5, 1.5]. */
  speed?: number;
}

export interface LessonAudioPlayer {
  /** Start (or restart) playback from the beginning. */
  play: () => void;
  /** Pause playback; `play()` restarts from the beginning. */
  pause: () => void;
  /** Stop and clear any queued speech. */
  stop: () => void;
  /** Whether audio can actually be produced in this environment. */
  readonly supported: boolean;
}

// App language name -> BCP-47 tag the speech engine understands.
const LANGUAGE_BCP47: Record<string, string> = {
  hebrew: "he-IL",
  english: "en-US",
  spanish: "es-ES",
  french: "fr-FR",
  portuguese: "pt-BR",
  italian: "it-IT",
};

export function toBcp47(language: LessonLanguage): string {
  return LANGUAGE_BCP47[String(language || "").toLowerCase()] || "en-US";
}

function isSpeechSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof (window as any).SpeechSynthesisUtterance === "function"
  );
}

// Voices load asynchronously in some browsers; pick the best match we can for a
// BCP-47 tag, preferring an explicitly requested voice name.
function pickVoice(
  bcp47: string,
  voicePreference?: string
): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices() || [];
  if (!voices.length) return null;
  const lang = bcp47.toLowerCase();
  const base = lang.split("-")[0];

  if (voicePreference) {
    const byName = voices.find((v) =>
      v.name.toLowerCase().includes(voicePreference.toLowerCase())
    );
    if (byName) return byName;
  }
  return (
    voices.find((v) => v.lang.toLowerCase() === lang) ||
    voices.find((v) => v.lang.toLowerCase().startsWith(base)) ||
    null
  );
}

const NOOP_PLAYER: LessonAudioPlayer = {
  play: () => {},
  pause: () => {},
  stop: () => {},
  supported: false,
};

/**
 * Build a playable audio handle for a piece of lesson text.
 *
 * Returns a player object rather than auto-playing, so the UI decides when to
 * start (e.g. on a Play button click, which also satisfies browser autoplay
 * gestures). Safe to call during render / SSR: if speech isn't supported it
 * returns a no-op player whose `supported` flag is false.
 */
export function generateLessonAudio(
  opts: GenerateLessonAudioOptions
): LessonAudioPlayer {
  if (!isSpeechSupported() || !opts.text || !opts.text.trim()) {
    return NOOP_PLAYER;
  }

  const synth = window.speechSynthesis;
  const bcp47 = toBcp47(opts.language);
  const rate = Math.min(1.5, Math.max(0.5, opts.speed ?? 1));

  const build = () => {
    const u = new SpeechSynthesisUtterance(opts.text);
    u.lang = bcp47;
    u.rate = rate;
    const voice = pickVoice(bcp47, opts.voicePreference);
    if (voice) u.voice = voice;
    return u;
  };

  return {
    supported: true,
    play() {
      synth.cancel(); // clear anything mid-flight so we always start clean
      synth.speak(build());
    },
    pause() {
      synth.cancel();
    },
    stop() {
      synth.cancel();
    },
  };
}
