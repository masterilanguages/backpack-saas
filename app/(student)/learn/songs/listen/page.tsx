"use client";

import React, { useState, useRef, useEffect } from "react";
import { ArrowLeft, Play, Pause, Volume2, Save, Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { base44 as base44Client } from "@/api/base44Client";
const base44: any = base44Client;
import { toast } from "sonner";

export default function SongListenPage() {
  // The origin used react-router's navigate(-1) to go back; the Next router-compat
  // navigate only handles forward string routes, so use browser history directly.
  const goBack = () => {
    if (typeof window !== "undefined") window.history.back();
  };
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [editingTranscript, setEditingTranscript] = useState(false);
  const [transcriptDraft, setTranscriptDraft] = useState("");
  const [isEditor, setIsEditor] = useState(false);

  // sessionStorage only exists in the browser — read it after mount.
  const [data, setData] = useState<any>({});

  useEffect(() => {
    base44.auth
      .me()
      .then((me: any) => setIsEditor(["admin", "coach"].includes(me?.role)))
      .catch(() => setIsEditor(false));
  }, []);

  useEffect(() => {
    try {
      setData(JSON.parse(sessionStorage.getItem("songListenData") || "{}"));
    } catch {
      setData({});
    }
  }, []);

  const { title, mediaUrl, transcript: initialTranscript, videoId } = data;

  const [transcript, setTranscript] = useState("");

  useEffect(() => {
    setTranscript(initialTranscript || "");
  }, [initialTranscript]);

  useEffect(() => {
    setTranscriptDraft(transcript);
  }, [transcript]);

  useEffect(() => {
    // Wait until we've attempted to read sessionStorage (data populated) before
    // bouncing back — otherwise we'd navigate away on the first render.
    if (Object.keys(data).length === 0) return;
    if (!title && !mediaUrl && !videoId) goBack();
  }, [title, mediaUrl, videoId, data]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setPlaying(!playing);
  };

  const handleTimeUpdate = () => {
    setCurrentTime(audioRef.current?.currentTime || 0);
  };

  const handleLoadedMetadata = () => {
    setDuration(audioRef.current?.duration || 0);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const [savingTranscript, setSavingTranscript] = useState(false);

  const handleSaveTranscript = async () => {
    setSavingTranscript(true);
    setTranscript(transcriptDraft);
    // Persist to sessionStorage
    const updated = { ...data, transcript: transcriptDraft };
    sessionStorage.setItem("songListenData", JSON.stringify(updated));
    setEditingTranscript(false);

    // Persist to DB — find the MediaLibrary record by mediaUrl
    try {
      if (data.mediaLibraryId) {
        await base44.entities.MediaLibrary.update(data.mediaLibraryId, {
          transcript_phonetics: transcriptDraft,
        });
      } else if (mediaUrl) {
        const results = await base44.entities.MediaLibrary.filter({
          video_url: mediaUrl,
        });
        if (results[0]) {
          await base44.entities.MediaLibrary.update(results[0].id, {
            transcript_phonetics: transcriptDraft,
          });
        }
      }
      toast.success("Transcript saved!");
    } catch (e) {
      console.error("MediaLibrary transcript save failed", e);
      toast.error("Couldn't save transcript — you don't have permission.");
    } finally {
      setSavingTranscript(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0B0F1A" }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-white/10">
        <button
          onClick={goBack}
          className="text-white/60 hover:text-white"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-white font-bold text-lg">{title || "Song"}</h1>
      </div>

      {/* YouTube Video */}
      {videoId && (
        <div className="w-full aspect-video max-w-3xl mx-auto">
          <iframe
            className="w-full h-full"
            src={`https://www.youtube.com/embed/${videoId}`}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      )}

      {/* Audio Player (only if no video) */}
      {mediaUrl && !videoId && (
        <div className="flex flex-col items-center justify-center px-6 py-10 gap-6">
          <div
            className="w-32 h-32 rounded-full flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #3b82f6, #06b6d4)" }}
          >
            <Volume2 className="w-14 h-14 text-white" />
          </div>

          <h2 className="text-white text-xl font-bold text-center">
            {title || "Audio Track"}
          </h2>

          {/* Progress bar */}
          <div className="w-full max-w-sm">
            <input
              type="range"
              min={0}
              max={duration || 1}
              value={currentTime}
              onChange={(e) => {
                if (audioRef.current)
                  audioRef.current.currentTime = Number(e.target.value);
                setCurrentTime(Number(e.target.value));
              }}
              className="w-full accent-cyan-400"
            />
            <div className="flex justify-between text-white/40 text-xs mt-1">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          <button
            onClick={togglePlay}
            className="w-16 h-16 rounded-full flex items-center justify-center text-white"
            style={{ background: "linear-gradient(135deg, #3b82f6, #06b6d4)" }}
          >
            {playing ? (
              <Pause className="w-7 h-7" />
            ) : (
              <Play className="w-7 h-7 ml-1" />
            )}
          </button>

          <audio
            ref={audioRef}
            src={mediaUrl}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={() => setPlaying(false)}
          />
        </div>
      )}

      {/* Transcript */}
      <div className="px-6 pb-10 max-w-3xl mx-auto w-full mt-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-white/60 text-sm font-semibold uppercase tracking-wider">
            Lyrics / Transcript
          </h3>
          {isEditor && !editingTranscript && (
            <button
              onClick={() => setEditingTranscript(true)}
              className="text-cyan-400 hover:text-cyan-300 text-xs font-medium px-3 py-1 rounded-lg border border-cyan-400/30 hover:border-cyan-400/60 transition-all"
            >
              {transcript ? "Edit" : "+ Paste Transcript"}
            </button>
          )}
        </div>

        {editingTranscript ? (
          <div className="space-y-3">
            <Textarea
              value={transcriptDraft}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setTranscriptDraft(e.target.value)
              }
              placeholder="Paste your transcript or lyrics here..."
              className="bg-white/5 border-white/20 text-white min-h-[200px] text-sm leading-relaxed"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                onClick={() => {
                  setEditingTranscript(false);
                  setTranscriptDraft(transcript);
                }}
                className="text-white/60 hover:text-white"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveTranscript}
                disabled={savingTranscript}
                className="bg-cyan-500 hover:bg-cyan-600 text-white gap-2"
              >
                {savingTranscript ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Save
              </Button>
            </div>
          </div>
        ) : transcript ? (
          <div className="bg-white/5 rounded-2xl p-5 border border-white/10">
            <pre className="text-white/80 text-sm leading-relaxed whitespace-pre-wrap font-sans">
              {transcript}
            </pre>
          </div>
        ) : (
          <div className="bg-white/5 rounded-2xl p-5 border border-white/10 text-center">
            <p className="text-white/30 text-sm">
              No transcript yet. Click "+ Paste Transcript" to add one.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
