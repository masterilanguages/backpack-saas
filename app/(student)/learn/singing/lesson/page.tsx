"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "@/lib/router-compat";
import { base44 as base44Client } from "@/api/base44Client";
const base44: any = base44Client;
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Mic,
  Volume2,
  RotateCcw,
  Eye,
  EyeOff,
  Settings,
  PlayCircle,
} from "lucide-react";
import MicRecorder from "@/components/singing/MicRecorder";
import SegmentCard from "@/components/singing/SegmentCard";
import { toast } from "sonner";

const PHASES = {
  LISTEN: "listen",
  YOUR_TURN_1: "your_turn_1",
  MODEL: "model",
  YOUR_TURN_2: "your_turn_2",
  REVIEW: "review",
  IDLE: "idle",
};

export default function SingingLesson() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [songId, setSongId] = useState<string | null>(null);

  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeSegmentIdx, setActiveSegmentIdx] = useState(0);
  const [phase, setPhase] = useState(PHASES.IDLE);
  const [showHebrew, setShowHebrew] = useState(false);
  const [showTranslit, setShowTranslit] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [autoRecord, setAutoRecord] = useState(true);
  const [loopMode, setLoopMode] = useState("none"); // none | line | section | full
  const [activeView, setActiveView] = useState("player"); // player | review
  const [recordings, setRecordings] = useState<Record<string, string>>({}); // { segId_type: url }
  const [completedSegments, setCompletedSegments] = useState<string[]>([]);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);

  const micRef = useRef<any>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  // songId comes from the query string; read it client-side after mount.
  useEffect(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      setSongId(urlParams.get("songId"));
    }
  }, []);

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  const { data: song } = useQuery({
    queryKey: ["singingSong", songId],
    queryFn: () =>
      base44.entities.SingingSong.filter({ id: songId }).then(
        (r: any[]) => r[0]
      ),
    enabled: !!songId,
  });

  const { data: segments = [] } = useQuery({
    queryKey: ["singingSegments", songId],
    queryFn: async () => {
      const segs = await base44.entities.SingingSegment.filter({
        song_id: songId,
      });
      return segs.sort((a: any, b: any) => a.order_index - b.order_index);
    },
    enabled: !!songId,
  });

  const { data: userRecordings = [] } = useQuery({
    queryKey: ["singingRecordings", songId],
    queryFn: () =>
      base44.entities.SingingRecording.filter({ song_id: songId }),
    enabled: !!songId && !!currentUser,
  });

  const saveRecordingMutation = useMutation({
    mutationFn: async ({ segmentId, attemptType, audioFileUrl }: any) => {
      const res = await base44.integrations.Core.UploadFile({
        file: await fetch(audioFileUrl).then((r) => r.blob()),
      });
      return base44.entities.SingingRecording.create({
        user_id: currentUser?.id,
        song_id: songId,
        segment_id: segmentId,
        attempt_type: attemptType,
        audio_file_url: res.file_url,
      });
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["singingRecordings", songId] }),
    onError: (e: any) => {
      console.error("Failed to save singing recording", e);
      toast.error(
        "Could not save your recording. It will only be available until you leave this page."
      );
    },
  });

  const activeSegment = segments[activeSegmentIdx];

  // ─── Timeline engine ──────────────────────────────────────────────
  const tickInterval = useRef<any>(null);
  const startTick = useCallback(() => {
    clearInterval(tickInterval.current);
    tickInterval.current = setInterval(() => {
      setCurrentTime((prev) => {
        const next = parseFloat((prev + 0.1 * playbackSpeed).toFixed(1));
        return next;
      });
    }, 100);
  }, [playbackSpeed]);

  const stopTick = useCallback(() => clearInterval(tickInterval.current), []);

  useEffect(() => {
    if (isPlaying) startTick();
    else stopTick();
    return stopTick;
  }, [isPlaying, startTick, stopTick]);

  // Watch time → phase transitions
  useEffect(() => {
    if (!activeSegment || !isPlaying) return;
    const t = currentTime;
    const seg = activeSegment;

    // Advance to next segment when past end_time
    if (t >= seg.end_time) {
      if (activeSegmentIdx < segments.length - 1) {
        if (loopMode === "line") {
          setCurrentTime(seg.start_time);
        } else {
          setActiveSegmentIdx((i) => i + 1);
          setCurrentTime(segments[activeSegmentIdx + 1]?.start_time || t);
          setShowHebrew(false);
        }
      } else {
        if (loopMode === "full") {
          setCurrentTime(segments[0]?.start_time || 0);
          setActiveSegmentIdx(0);
        } else {
          setIsPlaying(false);
          setPhase(PHASES.IDLE);
        }
      }
      return;
    }

    // Phase detection
    if (t >= seg.start_time && t < seg.record_start_1) {
      if (phaseRef.current !== PHASES.LISTEN) setPhase(PHASES.LISTEN);
    } else if (t >= seg.record_start_1 && t < seg.record_end_1) {
      if (phaseRef.current !== PHASES.YOUR_TURN_1) {
        setPhase(PHASES.YOUR_TURN_1);
        if (autoRecord)
          micRef.current?.startRecording(
            seg.record_end_1 - seg.record_start_1
          );
      }
    } else if (t >= seg.record_end_1 && t < seg.model_play_start) {
      if (phaseRef.current === PHASES.YOUR_TURN_1) {
        micRef.current?.stopRecording();
      }
      setPhase(PHASES.IDLE);
    } else if (t >= seg.model_play_start && t < seg.model_play_end) {
      if (phaseRef.current !== PHASES.MODEL) {
        setPhase(PHASES.MODEL);
        setShowHebrew(true);
      }
    } else if (t >= seg.record_start_2 && t < seg.record_end_2) {
      if (phaseRef.current !== PHASES.YOUR_TURN_2) {
        setPhase(PHASES.YOUR_TURN_2);
        if (autoRecord)
          micRef.current?.startRecording(
            seg.record_end_2 - seg.record_start_2
          );
      }
    } else if (t >= seg.record_end_2) {
      if (phaseRef.current === PHASES.YOUR_TURN_2) {
        micRef.current?.stopRecording();
        setPhase(PHASES.REVIEW);
        if (!completedSegments.includes(seg.id))
          setCompletedSegments((prev) => [...prev, seg.id]);
      }
    }
  }, [
    currentTime,
    activeSegment,
    isPlaying,
    autoRecord,
    loopMode,
    segments,
    activeSegmentIdx,
  ]);

  const handleRecordingComplete = useCallback(
    (url: string, blob: Blob, attemptType: string) => {
      const seg = segments[activeSegmentIdx];
      if (!seg) return;
      const key = `${seg.id}_${attemptType}`;
      setRecordings((prev) => ({ ...prev, [key]: url }));
      // Background save
      if (currentUser)
        saveRecordingMutation.mutate({
          segmentId: seg.id,
          attemptType,
          audioFileUrl: url,
        });
    },
    [segments, activeSegmentIdx, currentUser]
  );

  const handlePlay = () => {
    if (!activeSegment) return;
    if (!isPlaying && currentTime >= (activeSegment.end_time || 999)) {
      setCurrentTime(activeSegment.start_time);
    }
    setIsPlaying((p) => !p);
  };

  const goToSegment = (idx: number) => {
    if (idx < 0 || idx >= segments.length) return;
    setActiveSegmentIdx(idx);
    setCurrentTime(segments[idx]?.start_time || 0);
    setPhase(PHASES.IDLE);
    setShowHebrew(false);
    micRef.current?.stopRecording();
  };

  const replayModelLine = () => {
    if (!activeSegment) return;
    setCurrentTime(activeSegment.model_play_start);
    setIsPlaying(true);
  };

  const playMyRecording = (key: string) => {
    const url = recordings[key];
    if (!url) return;
    const a = new Audio(url);
    a.play();
  };

  const totalDuration =
    song?.duration_seconds ||
    segments[segments.length - 1]?.end_time ||
    48;
  const progress =
    totalDuration > 0 ? Math.min(1, currentTime / totalDuration) : 0;

  const phaseConfig: Record<
    string,
    { label: string; bg: string; border: string; text: string }
  > = {
    [PHASES.LISTEN]: {
      label: "Listen",
      bg: "#3b82f615",
      border: "#3b82f640",
      text: "#1d4ed8",
    },
    [PHASES.YOUR_TURN_1]: {
      label: "Your Turn 🎤",
      bg: "#fef2f2",
      border: "#fca5a5",
      text: "#dc2626",
    },
    [PHASES.MODEL]: {
      label: "Hebrew Line ✨",
      bg: "#fffbeb",
      border: "#fcd34d",
      text: "#b45309",
    },
    [PHASES.YOUR_TURN_2]: {
      label: "Repeat 🎤",
      bg: "#fef2f2",
      border: "#fca5a5",
      text: "#dc2626",
    },
    [PHASES.REVIEW]: {
      label: "Review ✓",
      bg: "#f0fdf4",
      border: "#86efac",
      text: "#16a34a",
    },
    [PHASES.IDLE]: {
      label: "",
      bg: "transparent",
      border: "transparent",
      text: "#6b7280",
    },
  };
  const pc = phaseConfig[phase] || phaseConfig[PHASES.IDLE];

  const isRecordingPhase =
    phase === PHASES.YOUR_TURN_1 || phase === PHASES.YOUR_TURN_2;
  const attemptType =
    phase === PHASES.YOUR_TURN_1 ? "first_repeat" : "second_repeat";
  const seg1Key = activeSegment ? `${activeSegment.id}_first_repeat` : null;
  const seg2Key = activeSegment ? `${activeSegment.id}_second_repeat` : null;

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background:
          "linear-gradient(160deg, #fdf8f0 0%, #f5efe3 60%, #ede8dc 100%)",
      }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pt-5 pb-3">
        <button
          onClick={() => navigate("/learn/singing")}
          className="p-2 rounded-xl hover:bg-stone-100 transition-all"
        >
          <ArrowLeft className="w-5 h-5 text-stone-500" />
        </button>
        <div className="flex gap-1">
          {["player", "review"].map((v) => (
            <button
              key={v}
              onClick={() => setActiveView(v)}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold capitalize transition-all ${
                activeView === v
                  ? "bg-amber-500 text-white shadow"
                  : "text-stone-500 hover:bg-stone-100"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowSettings((s) => !s)}
          className="p-2 rounded-xl hover:bg-stone-100 transition-all"
        >
          <Settings className="w-5 h-5 text-stone-400" />
        </button>
      </div>

      {/* Settings panel */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mx-4 mb-3 bg-white/90 border border-stone-200 rounded-2xl p-4 shadow-lg"
          >
            <p className="text-xs font-bold text-stone-500 uppercase mb-3">
              Settings
            </p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoRecord}
                  onChange={(e) => setAutoRecord(e.target.checked)}
                  className="rounded"
                />
                <span className="text-stone-700">Auto-record</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showTranslit}
                  onChange={(e) => setShowTranslit(e.target.checked)}
                  className="rounded"
                />
                <span className="text-stone-700">Transliteration</span>
              </label>
              <div className="flex items-center gap-2 col-span-2">
                <span className="text-stone-600 text-xs">Speed:</span>
                {[0.8, 1.0, 1.2].map((s) => (
                  <button
                    key={s}
                    onClick={() => setPlaybackSpeed(s)}
                    className={`px-2 py-0.5 rounded-lg text-xs font-mono font-bold transition-all ${
                      playbackSpeed === s
                        ? "bg-amber-500 text-white"
                        : "bg-stone-100 text-stone-600"
                    }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 col-span-2">
                <span className="text-stone-600 text-xs">Loop:</span>
                {["none", "line", "section", "full"].map((m) => (
                  <button
                    key={m}
                    onClick={() => setLoopMode(m)}
                    className={`px-2 py-0.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                      loopMode === m
                        ? "bg-amber-500 text-white"
                        : "bg-stone-100 text-stone-600"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 overflow-y-auto px-4 pb-8">
        {activeView === "player" ? (
          <div className="max-w-md mx-auto space-y-4">
            {/* Song info */}
            <div className="text-center py-2">
              {song?.cover_image ? (
                <img
                  src={song.cover_image}
                  className="w-20 h-20 rounded-2xl object-cover mx-auto mb-3 shadow-md"
                  alt=""
                />
              ) : (
                <div
                  className="w-20 h-20 rounded-2xl mx-auto mb-3 shadow-md flex items-center justify-center text-3xl"
                  style={{ background: "linear-gradient(135deg, #fde68a, #fbbf24)" }}
                >
                  🎵
                </div>
              )}
              <h2
                className="text-xl font-bold"
                style={{
                  color: "#3d2e1a",
                  fontFamily: "Cormorant Garamond, serif",
                }}
              >
                {song?.title || "Song"}
              </h2>
              {activeSegment && (
                <span className="text-xs text-stone-400 capitalize">
                  {activeSegment.section_type} · Segment {activeSegmentIdx + 1}{" "}
                  of {segments.length}
                </span>
              )}
            </div>

            {/* Progress bar */}
            <div className="space-y-1">
              <div
                className="h-1.5 rounded-full bg-stone-200 overflow-hidden cursor-pointer"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pct = (e.clientX - rect.left) / rect.width;
                  setCurrentTime(pct * totalDuration);
                }}
              >
                <motion.div
                  className="h-full rounded-full bg-amber-400"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-stone-400 font-mono">
                <span>
                  {Math.floor(currentTime / 60)}:
                  {String(Math.floor(currentTime % 60)).padStart(2, "0")}
                </span>
                <span>
                  {Math.floor(totalDuration / 60)}:
                  {String(Math.floor(totalDuration % 60)).padStart(2, "0")}
                </span>
              </div>
            </div>

            {/* Phase indicator */}
            <AnimatePresence mode="wait">
              {phase !== PHASES.IDLE && (
                <motion.div
                  key={phase}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="text-center py-1.5 px-4 rounded-full text-sm font-bold mx-auto w-fit border"
                  style={{ background: pc.bg, borderColor: pc.border, color: pc.text }}
                >
                  {pc.label}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Current line display */}
            {activeSegment && (
              <div className="bg-white/70 border border-stone-200 rounded-3xl p-5 shadow-sm text-center space-y-3">
                <p className="text-stone-600 text-base font-medium leading-relaxed">
                  {activeSegment.english_line}
                </p>
                <AnimatePresence>
                  {showHebrew && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="space-y-1"
                    >
                      <p
                        className="text-2xl font-bold"
                        style={{ color: "#92400e" }}
                        dir="rtl"
                      >
                        {activeSegment.hebrew_line}
                      </p>
                      {showTranslit && (
                        <p className="text-stone-500 text-sm italic">
                          {activeSegment.transliteration}
                        </p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="flex justify-center gap-3 pt-1">
                  <button
                    onClick={() => setShowHebrew((h) => !h)}
                    className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-amber-600 transition-all px-2 py-1 rounded-lg hover:bg-amber-50"
                  >
                    {showHebrew ? (
                      <EyeOff className="w-3 h-3" />
                    ) : (
                      <Eye className="w-3 h-3" />
                    )}
                    {showHebrew ? "Hide Hebrew" : "Show Hebrew"}
                  </button>
                  <button
                    onClick={() => setShowTranslit((t) => !t)}
                    className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-amber-600 transition-all px-2 py-1 rounded-lg hover:bg-amber-50"
                  >
                    {showTranslit ? "Hide translit." : "Show translit."}
                  </button>
                </div>
              </div>
            )}

            {/* Microphone zone */}
            <div
              className={`rounded-3xl p-5 flex flex-col items-center gap-3 transition-all border ${
                isRecordingPhase
                  ? "border-red-200"
                  : "border-stone-100 bg-white/40"
              }`}
              style={isRecordingPhase ? { background: "#fff5f5" } : {}}
            >
              <MicRecorder
                ref={micRef}
                onRecordingComplete={(url: string, blob: Blob) =>
                  handleRecordingComplete(url, blob, attemptType)
                }
              />
              {!autoRecord && isRecordingPhase && (
                <button
                  onClick={() =>
                    micRef.current?.startRecording(
                      phase === PHASES.YOUR_TURN_1
                        ? activeSegment?.record_end_1 - currentTime
                        : activeSegment?.record_end_2 - currentTime
                    )
                  }
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-red-500 text-white font-bold text-sm hover:bg-red-600 transition-all"
                >
                  <Mic className="w-4 h-4" /> Record
                </button>
              )}
              {/* Playback buttons */}
              <div className="flex gap-2">
                {seg1Key && recordings[seg1Key] && (
                  <button
                    onClick={() => playMyRecording(seg1Key)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-blue-600 text-xs font-semibold hover:bg-blue-100 transition-all"
                  >
                    <PlayCircle className="w-3.5 h-3.5" /> My Take 1
                  </button>
                )}
                {seg2Key && recordings[seg2Key] && (
                  <button
                    onClick={() => playMyRecording(seg2Key)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-blue-600 text-xs font-semibold hover:bg-blue-100 transition-all"
                  >
                    <PlayCircle className="w-3.5 h-3.5" /> My Take 2
                  </button>
                )}
                <button
                  onClick={replayModelLine}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold hover:bg-amber-100 transition-all"
                >
                  <Volume2 className="w-3.5 h-3.5" /> Hebrew
                </button>
              </div>
            </div>

            {/* Playback controls */}
            <div className="flex items-center justify-center gap-4 py-2">
              <button
                onClick={() => goToSegment(activeSegmentIdx - 1)}
                disabled={activeSegmentIdx === 0}
                className="p-2 rounded-full hover:bg-stone-100 disabled:opacity-30 transition-all"
              >
                <SkipBack className="w-5 h-5 text-stone-500" />
              </button>
              <button
                onClick={() => {
                  setCurrentTime(activeSegment?.start_time || 0);
                  setPhase(PHASES.IDLE);
                  setShowHebrew(false);
                }}
                className="p-2 rounded-full hover:bg-stone-100 transition-all"
              >
                <RotateCcw className="w-5 h-5 text-stone-500" />
              </button>
              <motion.button
                whileHover={{ scale: 1.06 }}
                whileTap={{ scale: 0.94 }}
                onClick={handlePlay}
                className="w-16 h-16 rounded-full shadow-lg flex items-center justify-center transition-all"
                style={{ background: "linear-gradient(135deg, #b45309, #d97706)" }}
              >
                {isPlaying ? (
                  <Pause className="w-7 h-7 text-white" />
                ) : (
                  <Play className="w-7 h-7 text-white ml-1" />
                )}
              </motion.button>
              <button
                onClick={() => {
                  setLoopMode((m) => (m === "line" ? "none" : "line"));
                }}
                className={`p-2 rounded-full transition-all ${
                  loopMode === "line"
                    ? "bg-amber-100 text-amber-600"
                    : "hover:bg-stone-100 text-stone-400"
                }`}
                title="Loop line"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                onClick={() => goToSegment(activeSegmentIdx + 1)}
                disabled={activeSegmentIdx >= segments.length - 1}
                className="p-2 rounded-full hover:bg-stone-100 disabled:opacity-30 transition-all"
              >
                <SkipForward className="w-5 h-5 text-stone-500" />
              </button>
            </div>

            {/* Segment pills */}
            <div className="flex gap-1.5 justify-center flex-wrap">
              {segments.map((seg: any, i: number) => (
                <button
                  key={seg.id}
                  onClick={() => goToSegment(i)}
                  className={`w-2.5 h-2.5 rounded-full transition-all ${
                    i === activeSegmentIdx
                      ? "bg-amber-500 scale-125"
                      : completedSegments.includes(seg.id)
                      ? "bg-green-400"
                      : "bg-stone-200"
                  }`}
                />
              ))}
            </div>
          </div>
        ) : (
          /* Review view */
          <div className="max-w-md mx-auto space-y-3">
            <h3 className="text-lg font-bold text-stone-700 mb-4">
              Review All Lines
            </h3>
            {segments.map((seg: any, i: number) => {
              const hasRec1 =
                recordings[`${seg.id}_first_repeat`] ||
                userRecordings.find(
                  (r: any) =>
                    r.segment_id === seg.id &&
                    r.attempt_type === "first_repeat"
                );
              const hasRec2 =
                recordings[`${seg.id}_second_repeat`] ||
                userRecordings.find(
                  (r: any) =>
                    r.segment_id === seg.id &&
                    r.attempt_type === "second_repeat"
                );
              return (
                <div
                  key={seg.id}
                  className="bg-white/70 border border-stone-200 rounded-2xl p-4"
                >
                  <SegmentCard
                    segment={seg}
                    isActive={i === activeSegmentIdx && activeView === "player"}
                    isCompleted={completedSegments.includes(seg.id)}
                    showHebrew={true}
                    showTranslit={showTranslit}
                    phase={null}
                    onClick={() => {
                      goToSegment(i);
                      setActiveView("player");
                    }}
                  />
                  <div className="flex gap-2 mt-3 flex-wrap">
                    {hasRec1 && (
                      <button
                        onClick={() =>
                          playMyRecording(`${seg.id}_first_repeat`)
                        }
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-blue-600 text-xs font-semibold hover:bg-blue-100 transition-all"
                      >
                        <PlayCircle className="w-3 h-3" /> Take 1
                      </button>
                    )}
                    {hasRec2 && (
                      <button
                        onClick={() =>
                          playMyRecording(`${seg.id}_second_repeat`)
                        }
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-blue-600 text-xs font-semibold hover:bg-blue-100 transition-all"
                      >
                        <PlayCircle className="w-3 h-3" /> Take 2
                      </button>
                    )}
                    <button
                      onClick={() => {
                        goToSegment(i);
                        setActiveView("player");
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold hover:bg-amber-100 transition-all"
                    >
                      Practice again
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
