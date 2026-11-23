// Lesson audio entry point. Pages call `generateLessonAudio(...).play()`.
// The neural voice (Israeli he-IL for Hebrew, a native voice for the other
// learning languages) lives in lib/speech. This wrapper keeps the old player
// shape and sends every language through that platform path, with the
// browser's speechSynthesis as the fallback when no provider key is set.

import { playSpeech, stopSpeech } from "@/lib/speech/player";
import { speechLocale } from "@/lib/speech/voices";

export type LessonLanguage =
  | "hebrew"
  | "english"
  | "spanish"
  | "french"
  | "portuguese"
  | "italian"
  | string;

export interface GenerateLessonAudioOptions {
  /** The text to speak, in the target language (native script, not a transliteration). */
  text: string;
  /** Target language id as used across the app (e.g. "hebrew", "spanish"). */
  language: LessonLanguage;
  /** Optional preferred browser-voice name, used only for the speechSynthesis fallback. */
  voicePreference?: string;
  /** Playback rate. 1 = normal. Clamped to [0.5, 1.5]. */
  speed?: number;
}

export interface LessonAudioPlayer {
  /** Start (or restart) playback from the beginning. */
  play: () => void;
  /** Stop playback. */
  pause: () => void;
  /** Stop and clear any queued speech. */
  stop: () => void;
  /** Whether audio can be requested in this environment. */
  readonly supported: boolean;
}

export function toBcp47(language: LessonLanguage): string {
  return speechLocale(language);
}

const NOOP_PLAYER: LessonAudioPlayer = {
  play: () => {},
  pause: () => {},
  stop: () => {},
  supported: false,
};

/**
 * Build a playable handle for lesson text. Does not auto-play.
 * Safe during SSR: without `window` it returns a no-op player.
 */
export function generateLessonAudio(opts: GenerateLessonAudioOptions): LessonAudioPlayer {
  if (typeof window === "undefined" || !opts.text?.trim()) return NOOP_PLAYER;
  let current: { stop: () => void } | null = null;
  return {
    supported: true,
    play() {
      current?.stop();
      current = playSpeech({
        text: opts.text,
        language: opts.language,
        speed: opts.speed,
        voicePreference: opts.voicePreference,
      });
    },
    pause() {
      current?.stop();
      stopSpeech();
    },
    stop() {
      current?.stop();
      stopSpeech();
    },
  };
}
