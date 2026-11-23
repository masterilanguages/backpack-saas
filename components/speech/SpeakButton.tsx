"use client";

// Shared listen button for every school. Speaks `text` in `language`
// (Hebrew → Israeli he-IL). Shows loading, playing and error; click again to stop.

import { useRef, useState, type MouseEvent } from "react";
import { Loader2, Volume2, VolumeX } from "lucide-react";
import { playSpeech } from "@/lib/speech/player";

type Phase = "idle" | "loading" | "playing" | "error";

export type SpeakButtonProps = {
  /** What to say, in the target language (Hebrew script, not the transliteration). */
  text: string;
  /** Learning-language id. Defaults to Hebrew. */
  language?: string;
  /** Optional BCP-47 override, e.g. "he-IL". */
  locale?: string;
  className?: string;
  title?: string;
  /** Optional text beside the icon, e.g. "Play all". */
  label?: string;
};

export default function SpeakButton({
  text,
  language = "hebrew",
  locale,
  className = "",
  title = "Listen",
  label,
}: SpeakButtonProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const stopRef = useRef<(() => void) | null>(null);
  const token = useRef(0);

  if (!text?.trim()) return null;

  const onClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    if (phase === "loading" || phase === "playing") {
      stopRef.current?.();
      token.current += 1;
      setPhase("idle");
      return;
    }
    const id = ++token.current;
    setPhase("loading");
    const playback = playSpeech(
      { text, language, locale },
      { onPlaying: () => { if (token.current === id) setPhase("playing"); } },
    );
    stopRef.current = playback.stop;
    playback.finished.then(
      () => { if (token.current === id) setPhase("idle"); },
      () => { if (token.current === id) setPhase("error"); },
    );
  };

  const Icon = phase === "loading" ? Loader2 : phase === "error" ? VolumeX : Volume2;
  const hint = phase === "error" ? "Couldn't play audio" : phase === "playing" ? "Stop" : title;

  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      aria-label={hint}
      data-state={phase}
      data-speech-language={language}
      className={`inline-flex h-7 shrink-0 items-center justify-center rounded-full text-current transition hover:bg-black/10 ${label ? "w-auto gap-1 px-2.5" : "w-7"} ${className}`}
    >
      <Icon className={`h-4 w-4 ${phase === "loading" ? "animate-spin" : ""} ${phase === "playing" ? "animate-pulse" : ""}`} aria-hidden />
      {label ? <span className="text-xs font-semibold">{label}</span> : null}
    </button>
  );
}
