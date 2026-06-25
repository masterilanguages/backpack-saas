"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { base44 as base44Client } from "@/api/base44Client";
const base44: any = base44Client;
import { ArrowLeft, Play, Pause, Plus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

function SpeakAudioInner() {
  const searchParams = useSearchParams();
  const [audioUrl] = useState("");
  const [transcript, setTranscript] = useState("");
  const [transcriptFile, setTranscriptFile] = useState<any[] | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const videoId = searchParams.get("videoId");

  // navigate(-1) doesn't exist in the router-compat shim — use browser history.
  const goBack = () => {
    if (typeof window !== "undefined") window.history.back();
  };

  const { data: sessionData, isLoading } = useQuery({
    queryKey: ["speakAudioSession", videoId],
    queryFn: async () => {
      if (!videoId) return null;
      const videos = await base44.entities.MediaLibrary.filter({ video_id: videoId });
      if (videos[0]) {
        return videos[0];
      }
      return null;
    },
    enabled: !!videoId,
  });

  useEffect(() => {
    if (sessionData?.session_vocab_words) {
      setTranscriptFile(sessionData.session_vocab_words);
    }
  }, [sessionData]);

  const saveSessionMutation = useMutation({
    mutationFn: async (data: any) => {
      if (!videoId || !sessionData?.id) return;
      return await base44.entities.MediaLibrary.update(sessionData.id, {
        session_vocab_words: data.transcript,
      });
    },
    onSuccess: () => {
      toast.success("Session saved!");
    },
    onError: () => {
      toast.error("Failed to save session");
    },
  });

  const handleSaveTranscript = () => {
    if (!transcript.trim()) {
      toast.error("Transcript cannot be empty");
      return;
    }

    const words = transcript
      .split(/\n+/)
      .filter((w) => w.trim())
      .map((word) => ({
        phonetic: word,
        translation: word,
        hebrew: word,
      }));

    saveSessionMutation.mutate({ transcript: words });
    setShowUploadForm(false);
  };

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  if (isLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "linear-gradient(160deg, #0f172a 0%, #1e1b4b 100%)" }}
      >
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
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
          <h1 className="text-white font-bold text-lg">Speak</h1>
          {sessionData && <p className="text-white/40 text-xs">{sessionData.title}</p>}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12 max-w-2xl mx-auto w-full">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full space-y-6"
        >
          {/* Audio Player */}
          {audioUrl && (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <div className="flex items-center gap-4 mb-4">
                <button
                  onClick={togglePlay}
                  className="w-12 h-12 rounded-full flex items-center justify-center bg-indigo-500 hover:bg-indigo-600 text-white transition-all"
                >
                  {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-1" />}
                </button>
                <div className="flex-1">
                  <p className="text-white text-sm font-semibold">Audio Playback</p>
                  <p className="text-white/40 text-xs">Practice speaking along with the audio</p>
                </div>
              </div>
              <audio
                ref={audioRef}
                src={audioUrl}
                className="w-full"
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                controls
                style={{ accentColor: "#6366f1" }}
              />
            </div>
          )}

          {/* Transcript Section */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-white font-semibold">Transcript</p>
                <p className="text-white/40 text-xs">View or add words to practice</p>
              </div>
              <button
                onClick={() => setShowUploadForm(!showUploadForm)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-semibold transition-all"
              >
                <Plus className="w-4 h-4" />
                Add Transcript
              </button>
            </div>

            <AnimatePresence>
              {showUploadForm && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-4 bg-white/5 rounded-xl p-4"
                >
                  <textarea
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    placeholder="Enter words or phrases (one per line)"
                    className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-indigo-400 resize-none"
                    rows={4}
                  />
                  <div className="flex gap-2 mt-3">
                    <Button onClick={handleSaveTranscript} className="flex-1">
                      Save Transcript
                    </Button>
                    <button
                      onClick={() => {
                        setShowUploadForm(false);
                        setTranscript("");
                      }}
                      className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Transcript Words */}
            {transcriptFile && transcriptFile.length > 0 && (
              <div className="space-y-2">
                <p className="text-white/40 text-xs uppercase tracking-wider mb-3">
                  Words to Practice
                </p>
                <div className="flex flex-wrap gap-2">
                  {transcriptFile.map((item, idx) => (
                    <div
                      key={idx}
                      className="px-3 py-2 rounded-lg bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 text-sm"
                    >
                      {item.phonetic}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(!transcriptFile || transcriptFile.length === 0) && !showUploadForm && (
              <p className="text-white/40 text-sm text-center py-4">
                No transcript added yet. Click "Add Transcript" to get started.
              </p>
            )}
          </div>

          {/* Tips */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <p className="text-white/60 text-sm">
              💡 <strong>Tip:</strong> Play the audio and practice speaking the words shown above.
              Focus on pronunciation and fluency.
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export default function SpeakAudioPage() {
  return (
    <Suspense fallback={null}>
      <SpeakAudioInner />
    </Suspense>
  );
}
