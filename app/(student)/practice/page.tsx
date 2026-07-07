"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Play, Pause, RotateCcw, SkipForward, ChevronLeft, Music } from "lucide-react";
import { Link, createPageUrl } from "@/lib/router-compat";

// Segment timings — these reference timestamps in the actual song audio
const DEFAULT_SEGMENTS = [
  {
    id: "line_1",
    english: "I just wanna go all over the world",
    hebrew: "אֲנִי רוֹצֶה לָלֶכֶת בְּכָל הָעוֹלָם",
    translit: "Ani rotze lalechet bechol ha'olam",
    t0: 0.0, // song starts playing
    t1: 4.0, // listen window ends
    record_start: 4.0,
    record_end: 8.0,
    hebrew_play: 8.0,
    hebrew_end: 12.0,
    repeat_start: 12.0,
    repeat_end: 16.0,
  },
  {
    id: "line_2",
    english: "I wanna feel the sun on my face",
    hebrew: "אֲנִי רוֹצֶה לְהַרְגִּישׁ אֶת הַשֶּׁמֶשׁ",
    translit: "Ani rotze lehargish et hashemesh",
    t0: 16.0,
    t1: 20.0,
    record_start: 20.0,
    record_end: 24.0,
    hebrew_play: 24.0,
    hebrew_end: 28.0,
    repeat_start: 28.0,
    repeat_end: 32.0,
  },
];

const MODES = ["auto-loop", "hands-free"];

function useMediaRecorder(onStop: (url: string) => void) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const startRecording = useCallback(async () => {
    try {
      chunksRef.current = [];
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        onStop(url);
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
    } catch (e) {
      console.warn("Mic access denied:", e);
    }
  }, [onStop]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  return { startRecording, stopRecording };
}

export default function SpeakingSession() {
  const segments = DEFAULT_SEGMENTS;

  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [mode, setMode] = useState("auto-loop");
  const [currentSegIdx, setCurrentSegIdx] = useState(0);
  const [phase, setPhase] = useState("idle");
  const [takes, setTakes] = useState<Record<string, string[]>>({});
  const [, setActiveTakeUrl] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [showHebrew, setShowHebrew] = useState(false);
  const [loopCount, setLoopCount] = useState(0);
  const [songUrl, setSongUrl] = useState<string | null>(null);
  const [songTitle, setSongTitle] = useState("");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const phaseRef = useRef("idle");

  const currentSeg = segments[currentSegIdx];

  const [manualUrl, setManualUrl] = useState("");

  // Load song from sessionStorage only (must be an actual MP3/audio URL).
  // sessionStorage only exists in the browser — read it after mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = sessionStorage.getItem("speakingSongData");
    if (stored) {
      try {
        const d = JSON.parse(stored);
        if (d.mediaUrl) {
          setSongUrl(d.mediaUrl);
          setSongTitle(d.title || "Song");
        }
      } catch {}
    }
  }, []);

  const handleTakeStop = useCallback(
    (url: string) => {
      setTakes((prev) => {
        const existing = prev[currentSeg.id] || [];
        return { ...prev, [currentSeg.id]: [...existing, url] };
      });
      setActiveTakeUrl(url);
    },
    [currentSeg?.id]
  );

  const { startRecording, stopRecording } = useMediaRecorder(handleTakeStop);

  // Release countdown timer and in-flight mic stream on unmount
  useEffect(
    () => () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      stopRecording();
    },
    [stopRecording]
  );

  // Sync currentTime from audio element
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setCurrentTime(audio.currentTime);
    audio.addEventListener("timeupdate", onTime);
    return () => audio.removeEventListener("timeupdate", onTime);
  }, [songUrl]);

  const startCountdown = (seconds: number) => {
    let count = Math.floor(seconds);
    setCountdown(count);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      count -= 1;
      if (count <= 0) {
        if (countdownRef.current) clearInterval(countdownRef.current);
        setCountdown(null);
      } else setCountdown(count);
    }, 1000);
  };

  // Phase logic driven by audio currentTime
  useEffect(() => {
    if (!isPlaying) return;
    const t = currentTime;
    const seg = currentSeg;

    if (t >= seg.t0 && t < seg.t1) {
      if (phaseRef.current !== "english") {
        phaseRef.current = "english";
        setPhase("english");
        setCountdown(null);
      }
    } else if (t >= seg.record_start && t < seg.record_end) {
      if (phaseRef.current !== "record1") {
        phaseRef.current = "record1";
        setPhase("record1");
        startRecording();
        startCountdown(seg.record_end - seg.record_start);
      }
    } else if (t >= seg.hebrew_play && t < seg.hebrew_end) {
      if (phaseRef.current !== "hebrew") {
        phaseRef.current = "hebrew";
        setPhase("hebrew");
        stopRecording();
        setCountdown(null);
      }
    } else if (t >= seg.repeat_start && t < seg.repeat_end) {
      if (phaseRef.current !== "record2") {
        phaseRef.current = "record2";
        setPhase("record2");
        startRecording();
        startCountdown(seg.repeat_end - seg.repeat_start);
      }
    }

    // Loop or advance at end of segment
    if (t >= seg.repeat_end) {
      stopRecording();
      phaseRef.current = "idle";
      setPhase("idle");
      setCountdown(null);
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (mode === "auto-loop") {
        setLoopCount((c) => c + 1);
        if (audioRef.current) {
          audioRef.current.currentTime = seg.t0;
        }
      } else {
        const next = Math.min(currentSegIdx + 1, segments.length - 1);
        setCurrentSegIdx(next);
        if (audioRef.current) {
          audioRef.current.currentTime = segments[next].t0;
        }
      }
    }
  }, [currentTime, isPlaying, currentSeg, mode]);

  // Stop recording when leaving record phase
  useEffect(() => {
    if (phase !== "record1" && phase !== "record2") stopRecording();
  }, [phase]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!isPlaying) {
      phaseRef.current = "idle";
      setPhase("idle");
      if (audio) {
        audio.currentTime = currentSeg.t0;
        audio.play().catch(() => {});
      }
    } else {
      if (audio) audio.pause();
      stopRecording();
      if (countdownRef.current) clearInterval(countdownRef.current);
      setCountdown(null);
    }
    setIsPlaying((v) => !v);
  };

  const handleNextSegment = () => {
    stopRecording();
    if (countdownRef.current) clearInterval(countdownRef.current);
    const next = Math.min(currentSegIdx + 1, segments.length - 1);
    setCurrentSegIdx(next);
    phaseRef.current = "idle";
    setPhase("idle");
    setIsPlaying(false);
    setActiveTakeUrl(null);
    setCountdown(null);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = segments[next].t0;
    }
  };

  const handleRestart = () => {
    stopRecording();
    if (countdownRef.current) clearInterval(countdownRef.current);
    phaseRef.current = "idle";
    setPhase("idle");
    setIsPlaying(false);
    setActiveTakeUrl(null);
    setCountdown(null);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = currentSeg.t0;
    }
  };

  const selectSegment = (i: number) => {
    stopRecording();
    if (countdownRef.current) clearInterval(countdownRef.current);
    setCurrentSegIdx(i);
    phaseRef.current = "idle";
    setPhase("idle");
    setIsPlaying(false);
    setActiveTakeUrl(null);
    setCountdown(null);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = segments[i].t0;
    }
  };

  const progress =
    ((currentTime - currentSeg.t0) / (currentSeg.repeat_end - currentSeg.t0)) * 100;
  const isRecording = phase === "record1" || phase === "record2";
  const segTakes = takes[currentSeg.id] || [];

  const phaseLabel =
    {
      idle: "Ready",
      english: "🎵 Listen",
      record1: "🎤 Speak!",
      hebrew: "🔊 Model Hebrew",
      record2: "🎤 Repeat!",
    }[phase] || "";

  const phaseColor =
    {
      record1: "#ef4444",
      record2: "#ef4444",
      english: "#06b6d4",
      hebrew: "#14b8a6",
      idle: "#6b7280",
    }[phase] || "#6b7280";

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-8 bg-slate-950"
    >
      {/* Hidden audio player */}
      {songUrl && <audio ref={audioRef} src={songUrl} preload="auto" />}

      {/* Header */}
      <div className="w-full max-w-md mb-6 flex items-center gap-3">
        <Link
          to={createPageUrl("Home")}
          className="text-slate-400 hover:text-white transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-white font-bold text-lg">Speaking Session</h1>
          {songTitle && (
            <p className="text-slate-400 text-xs flex items-center gap-1">
              <Music className="w-3 h-3" />
              {songTitle}
            </p>
          )}
        </div>
        {/* intentionally empty — url input shown below */}
        <div className="flex gap-1 bg-slate-800 rounded-xl p-1">
          {MODES.map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                mode === m ? "bg-teal-500 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              {m === "auto-loop" ? "🔁 Loop" : "🤲 Free"}
            </button>
          ))}
        </div>
      </div>

      {/* Song URL input — shown when no audio is loaded */}
      {!songUrl && (
        <div className="w-full max-w-md mb-4 bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
          <p className="text-slate-400 text-sm">
            Paste an MP3 audio URL to use as the backing track:
          </p>
          <div className="flex gap-2">
            <input
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
              placeholder="https://example.com/song.mp3"
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm outline-none placeholder:text-slate-500 focus:border-teal-500"
            />
            <button
              onClick={() => {
                if (manualUrl.trim()) {
                  setSongUrl(manualUrl.trim());
                  setSongTitle("Song");
                }
              }}
              className="px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-400 text-white text-sm font-semibold transition-all"
            >
              Load
            </button>
          </div>
        </div>
      )}

      {/* Segment selector */}
      <div className="w-full max-w-md flex gap-2 mb-6 overflow-x-auto pb-1">
        {segments.map((seg, i) => (
          <button
            key={seg.id}
            onClick={() => selectSegment(i)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
              currentSegIdx === i
                ? "bg-teal-500 border-teal-400 text-white"
                : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white"
            }`}
          >
            Line {i + 1}
            {(takes[seg.id]?.length || 0) > 0 && <span className="ml-1 text-green-400">●</span>}
          </button>
        ))}
      </div>

      {/* Main card */}
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl bg-slate-900 border border-slate-800"
      >
        <div className="flex items-center justify-center py-3 border-b border-slate-800">
          <motion.span
            key={phaseLabel}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-sm font-bold tracking-wide"
            style={{ color: phaseColor }}
          >
            {phaseLabel || "—"}
          </motion.span>
        </div>

        <div className="px-6 py-8 text-center space-y-3">
          <motion.p
            key={`en-${currentSegIdx}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-slate-200 text-lg font-medium leading-relaxed"
          >
            {currentSeg.english}
          </motion.p>
          <button
            onClick={() => setShowHebrew((v) => !v)}
            className="text-xs text-slate-400 hover:text-slate-200 transition-colors underline underline-offset-2"
          >
            {showHebrew ? "hide Hebrew" : "show Hebrew"}
          </button>
          <AnimatePresence>
            {showHebrew && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
              >
                <p
                  className="text-teal-300 text-xl font-bold leading-relaxed"
                  dir="rtl"
                  style={{ fontFamily: "serif" }}
                >
                  {currentSeg.hebrew}
                </p>
                <p className="text-slate-400 text-sm italic mt-1">{currentSeg.translit}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="px-6 mb-4">
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ background: `linear-gradient(90deg, ${phaseColor}, ${phaseColor}aa)` }}
              animate={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
              transition={{ duration: 0.1, ease: "linear" }}
            />
          </div>
          <div className="flex justify-between text-xs text-slate-500 mt-1">
            <span>Listen</span>
            <span>Speak</span>
            <span>Model</span>
            <span>Repeat</span>
          </div>
        </div>

        <AnimatePresence>
          {isRecording && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="mx-6 mb-4 flex flex-col items-center gap-2"
            >
              <div className="flex items-center gap-3 bg-red-500/20 border border-red-500/40 rounded-2xl px-5 py-3 w-full justify-center">
                <motion.div
                  animate={{ scale: [1, 1.3, 1] }}
                  transition={{ repeat: Infinity, duration: 0.8 }}
                  className="w-3 h-3 bg-red-500 rounded-full"
                />
                <Mic className="w-5 h-5 text-red-400" />
                <span className="text-red-300 font-bold text-sm">Recording…</span>
                {countdown !== null && (
                  <span className="ml-auto text-red-400 font-mono font-bold text-lg">
                    {countdown}
                  </span>
                )}
              </div>
              <div className="flex gap-1 items-end h-8">
                {Array.from({ length: 16 }).map((_, i) => (
                  <motion.div
                    key={i}
                    animate={{ height: [4, Math.random() * 24 + 4, 4] }}
                    transition={{
                      repeat: Infinity,
                      duration: 0.4 + Math.random() * 0.4,
                      delay: i * 0.05,
                    }}
                    className="w-1.5 rounded-full bg-red-400/70"
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center justify-center gap-4 px-6 pb-6">
          <button
            onClick={handleRestart}
            className="w-10 h-10 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 hover:text-white transition-all"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={togglePlay}
            className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-lg transition-all hover:scale-105 active:scale-95"
            style={{
              background: isPlaying ? "#ef4444" : "#14b8a6",
            }}
          >
            {isPlaying ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 ml-1" />}
          </button>
          <button
            onClick={handleNextSegment}
            disabled={currentSegIdx >= segments.length - 1}
            className="w-10 h-10 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 hover:text-white transition-all disabled:opacity-30"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>
      </div>

      {segTakes.length > 0 && (
        <div className="w-full max-w-md mt-5 space-y-2">
          <p className="text-slate-400 text-xs uppercase tracking-wider mb-2">
            Your Takes — Line {currentSegIdx + 1}
          </p>
          {segTakes.map((url, i) => (
            <div
              key={i}
              className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3"
            >
              <span className="text-slate-400 text-xs font-mono">#{i + 1}</span>
              <audio src={url} controls className="flex-1 h-8" style={{ accentColor: "#14b8a6" }} />
              {i === segTakes.length - 1 && (
                <span className="text-green-400 text-xs font-semibold">latest</span>
              )}
            </div>
          ))}
          {segTakes.length >= 2 && (
            <div className="bg-teal-500/10 border border-teal-500/20 rounded-2xl p-4 mt-2">
              <p className="text-teal-300 text-xs font-semibold mb-2">📊 Session Stats</p>
              <div className="flex gap-4">
                {[
                  { label: "Takes", val: segTakes.length },
                  { label: "Loops", val: loopCount },
                ].map(({ label, val }) => (
                  <div key={label} className="text-center">
                    <p className="text-white font-bold text-lg">{val}</p>
                    <p className="text-slate-400 text-xs">{label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <p className="text-slate-500 text-xs text-center mt-6 max-w-xs">
        Tip: Press play and speak during the red recording windows. Your takes are saved for review.
      </p>
    </div>
  );
}
