"use client";

import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 as base44Client } from "@/api/base44Client";
const base44: any = base44Client;
import { ArrowLeft, Play, Pause, ChevronRight, CheckCircle, Eye, Plus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// Shared, memoized loader for the YouTube IFrame API (bug #33). Replaces the
// single "window.onYouTubeIframeAPIReady = initPlayer" assignment, which is
// last-writer-wins across components and silently drops other players' onReady.
let __ytApiPromise: Promise<any> | null = null;
function loadYouTubeApi(): Promise<any> {
  if (typeof window === "undefined") return Promise.resolve(null);
  const w = window as any;
  if (w.YT && w.YT.Player) return Promise.resolve(w.YT);
  if (__ytApiPromise) return __ytApiPromise;
  __ytApiPromise = new Promise((resolve) => {
    const finish = () => {
      if (w.YT && w.YT.Player) resolve(w.YT);
    };
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      if (typeof prev === "function") {
        try {
          prev();
        } catch (e) {}
      }
      finish();
    };
    if (!document.getElementById("youtube-iframe-api")) {
      const tag = document.createElement("script");
      tag.id = "youtube-iframe-api";
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }
    const poll = setInterval(() => {
      if (w.YT && w.YT.Player) {
        clearInterval(poll);
        resolve(w.YT);
      }
    }, 100);
  });
  return __ytApiPromise;
}

export default function DictationExercise() {
  const playerRef = useRef<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSegIdx, setCurrentSegIdx] = useState(0);
  const [inputs, setInputs] = useState<Record<number, string>>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [done, setDone] = useState(false);
  const queryClient = useQueryClient();

  // navigate(-1) doesn't exist in the router-compat shim — use browser history.
  const goBack = () => {
    if (typeof window !== "undefined") window.history.back();
  };

  // sessionStorage / localStorage only exist in the browser — read after mount.
  const [data, setData] = useState<any>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("dictationInputs");
      if (saved) setInputs(JSON.parse(saved));
    } catch {}
    try {
      setData(JSON.parse(sessionStorage.getItem("dictationData") || "{}"));
    } catch {
      setData({});
    }
    setHydrated(true);
  }, []);

  // Save inputs to localStorage whenever they change
  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem("dictationInputs", JSON.stringify(inputs));
  }, [inputs, hydrated]);

  useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
  });

  const addWordMutation = useMutation({
    mutationFn: async (wordData: any) => {
      return await base44.entities.Word.create({
        word: wordData.word,
        translation: wordData.translation || wordData.word,
        phonetic: wordData.phonetic || wordData.word,
        category: "wordbank",
        language: "hebrew",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["words"] });
      toast.success("Word added to backpack!");
    },
    onError: () => {
      toast.error("Failed to add word");
    },
  });

  const { videoId, title, transcript = [] } = data as {
    videoId?: string;
    title?: string;
    transcript?: any[];
  };

  // Redirect if no data
  useEffect(() => {
    if (!hydrated) return;
    if (!videoId && !transcript.length) goBack();
  }, [hydrated, videoId, transcript.length]);

  // Init YouTube player
  useEffect(() => {
    if (!videoId) return;
    let cancelled = false;
    const w = window as any;
    const initPlayer = () => {
      if (cancelled) return;
      if (!w.YT?.Player) return;
      playerRef.current = new w.YT.Player("dictation-yt-player", {
        videoId,
        playerVars: { controls: 1, enablejsapi: 1 },
        events: {
          onStateChange: (e: any) => setIsPlaying(e.data === 1),
        },
      });
    };
    // Shared, memoized loader avoids stomping other components' onReady (bug #33).
    loadYouTubeApi().then(() => initPlayer());
    return () => {
      cancelled = true;
      try {
        playerRef.current?.destroy();
      } catch {}
    };
  }, [videoId]);

  const segmentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const playCurrentSegment = (idx: number) => {
    const seg = transcript[idx];
    if (!seg || !playerRef.current?.seekTo) return;
    // Clear any previous timer
    if (segmentTimerRef.current) clearTimeout(segmentTimerRef.current);
    const start = seg.start || 0;
    const nextSeg = transcript[idx + 1];
    const end = nextSeg?.start ?? null;
    playerRef.current.seekTo(start, true);
    playerRef.current.playVideo();
    if (end !== null) {
      const duration = (end - start) * 1000;
      segmentTimerRef.current = setTimeout(() => {
        playerRef.current?.pauseVideo();
      }, duration);
    }
  };

  const seekToSegment = (idx: number) => {
    setCurrentSegIdx(idx);
    playCurrentSegment(idx);
  };

  const togglePlay = () => {
    if (!playerRef.current) return;
    if (isPlaying) {
      if (segmentTimerRef.current) clearTimeout(segmentTimerRef.current);
      playerRef.current.pauseVideo();
    } else {
      playCurrentSegment(currentSegIdx);
    }
  };

  // Cleanup timer on unmount
  useEffect(
    () => () => {
      if (segmentTimerRef.current) clearTimeout(segmentTimerRef.current);
    },
    []
  );

  const handleReveal = (idx: number) => {
    setRevealed((prev) => ({ ...prev, [idx]: true }));
  };

  const handleNext = () => {
    if (currentSegIdx < transcript.length - 1) {
      const next = currentSegIdx + 1;
      setCurrentSegIdx(next);
      seekToSegment(next);
    } else {
      setDone(true);
    }
  };

  const correctCount = transcript.filter((seg: any, i: number) => {
    const answer = (inputs[i] || "").trim().toLowerCase();
    const correct = (seg.transliteration || seg.text || "").trim().toLowerCase();
    return (
      answer &&
      correct &&
      (answer === correct ||
        correct.includes(answer) ||
        answer.includes(correct.split(" ")[0]))
    );
  }).length;

  const currentSeg = transcript[currentSegIdx];

  if (done) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-4"
        style={{ background: "linear-gradient(160deg, #0f172a 0%, #1e1b4b 100%)" }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-5 max-w-md w-full"
        >
          <div className="text-7xl">✍️</div>
          <h2 className="text-white text-3xl font-bold">Dictation Complete!</h2>
          <p className="text-white/60">
            You wrote {correctCount} / {transcript.length} sentences correctly.
          </p>
          <div className="space-y-2 mt-6 max-h-64 overflow-y-auto">
            {transcript.map((seg: any, i: number) => (
              <div
                key={i}
                className={`rounded-xl p-3 text-left text-sm ${inputs[i] ? "bg-white/10" : "bg-white/5"}`}
              >
                <p className="text-white/40 text-xs mb-1">Sentence {i + 1}</p>
                <p className="text-white/80 whitespace-nowrap overflow-x-auto">
                  {seg.transliteration || seg.text}
                </p>
                {inputs[i] && <p className="text-white/50 mt-1 italic">You wrote: {inputs[i]}</p>}
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-4">
            <Button
              onClick={() => {
                setDone(false);
                setCurrentSegIdx(0);
                setInputs({});
                setRevealed({});
                seekToSegment(0);
              }}
              variant="outline"
              className="flex-1 border-white/20 text-white hover:bg-white/10"
            >
              Try Again
            </Button>
            <Button
              onClick={goBack}
              className="flex-1"
              style={{ background: "linear-gradient(135deg, #5a6b5a, #3d4a2e)" }}
            >
              Done
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "linear-gradient(160deg, #0f172a 0%, #1e1b4b 100%)" }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-white/10">
        <button onClick={goBack} className="text-white/60 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-white font-bold text-lg">Dictation Exercise</h1>
          {title && <p className="text-white/40 text-xs">{title}</p>}
        </div>
        <span className="text-white/40 text-sm">
          {currentSegIdx + 1} / {transcript.length}
        </span>
      </div>

      {/* Video */}
      {videoId && (
        <div className="w-full max-w-3xl mx-auto" style={{ height: "40vh" }}>
          <style>{`
            .ytp-big-play-button { display: none !important; }
            .ytp-big-play-button.ytp-button { display: none !important; }
            button.ytp-big-play-button { display: none !important; }
          `}</style>
          <div id="dictation-yt-player" className="w-full h-full" />
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center justify-center gap-3 py-3 border-b border-white/10">
        {currentSegIdx > 0 && (
          <button
            onClick={() => seekToSegment(currentSegIdx - 1)}
            className="text-white/40 hover:text-white text-xs underline transition-colors"
          >
            ← Prev
          </button>
        )}
      </div>

      {/* Sentence selector pills */}
      <div className="flex gap-1.5 px-4 py-2 overflow-x-auto justify-center">
        {transcript.map((_: any, i: number) => (
          <button
            key={i}
            onClick={() => {
              setCurrentSegIdx(i);
              seekToSegment(i);
            }}
            className={`flex-shrink-0 w-7 h-7 rounded-full text-xs font-bold transition-all ${
              i === currentSegIdx
                ? "bg-indigo-500 text-white scale-110"
                : inputs[i]
                  ? "bg-green-500/30 text-green-300 border border-green-500/50"
                  : "bg-white/10 text-white/40 hover:bg-white/20"
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>

      {/* Current sentence input */}
      <div className="flex-1 px-4 py-4 max-w-3xl mx-auto w-full">
        <AnimatePresence mode="wait">
          {currentSeg && (
            <motion.div
              key={currentSegIdx}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={togglePlay}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white bg-white/20 hover:bg-white/30 transition-all flex-shrink-0"
                  title="Play sentence"
                >
                  {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 ml-0.5" />}
                </button>
                <p className="text-white/50 text-sm">
                  Listen to sentence {currentSegIdx + 1} and write what you hear:
                </p>
              </div>

              <textarea
                autoFocus
                value={inputs[currentSegIdx] || ""}
                onChange={(e) =>
                  setInputs((prev) => ({ ...prev, [currentSegIdx]: e.target.value }))
                }
                placeholder="Type what you hear..."
                rows={3}
                className="w-full bg-white/10 border border-white/20 rounded-2xl px-4 py-3 text-white text-base outline-none focus:border-indigo-400 resize-none placeholder:text-white/30 transition-all"
                style={{ fontFamily: "system-ui, sans-serif" }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleNext();
                  }
                }}
              />

              {/* Clickable words */}
              {inputs[currentSegIdx] && (
                <div className="flex flex-wrap gap-2 bg-white/5 rounded-xl p-3 border border-white/10">
                  {inputs[currentSegIdx].split(/\s+/).map((word, idx) => (
                    <motion.button
                      key={idx}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => addWordMutation.mutate({ word })}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-300 hover:text-indigo-100 text-sm transition-all border border-indigo-500/30 group"
                    >
                      <span>{word}</span>
                      <Plus className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </motion.button>
                  ))}
                </div>
              )}

              {/* Reveal answer */}
              <AnimatePresence>
                {revealed[currentSegIdx] ? (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl p-4 space-y-1"
                    style={{
                      background: "rgba(99,102,241,0.15)",
                      border: "1px solid rgba(99,102,241,0.4)",
                    }}
                  >
                    <p className="text-indigo-300 text-xs font-semibold uppercase tracking-wider">
                      Answer
                    </p>
                    <p className="text-white text-base font-medium whitespace-nowrap overflow-x-auto">
                      {currentSeg.transliteration || currentSeg.text}
                    </p>
                    {currentSeg.english && (
                      <p className="text-white/50 text-sm">{currentSeg.english}</p>
                    )}
                    {currentSeg.hebrew && (
                      <p
                        className="text-cyan-300 text-base font-bold whitespace-nowrap overflow-x-auto"
                        dir="rtl"
                      >
                        {currentSeg.hebrew}
                      </p>
                    )}
                  </motion.div>
                ) : (
                  <button
                    onClick={() => handleReveal(currentSegIdx)}
                    className="flex items-center gap-2 text-white/40 hover:text-white/70 text-sm transition-colors"
                  >
                    <Eye className="w-4 h-4" /> Reveal answer
                  </button>
                )}
              </AnimatePresence>

              {/* Next button */}
              <div className="flex justify-end pt-2">
                <Button
                  onClick={handleNext}
                  className="gap-2"
                  style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
                >
                  {currentSegIdx < transcript.length - 1 ? (
                    <>
                      Next sentence <ChevronRight className="w-4 h-4" />
                    </>
                  ) : (
                    <>
                      Finish <CheckCircle className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
