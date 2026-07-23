"use client";

import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Loader2, Edit, Plus, Play, Sparkles, Trash2, Pencil, Check, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import EditableWord from "../learning/EditableWord";
import ClickableWord from "../learning/ClickableWord";
import UniversalEditableWord from "../learning/UniversalEditableWord";
import EditableSentence from "../learning/EditableSentence";
import VideoTranscriptWord from "./VideoTranscriptWord";
import { languageLabel, isRTLLanguage, usesNikud } from "@/lib/language";
import { transcribeMediaSource, youtubeSource } from "@/lib/transcription";

// Normalize the various language codes this Video entity stores ("he"/"iw" for
// Hebrew) into the full language names the @/lib/language helpers expect.
function normalizeVideoLang(raw) {
  const key = String(raw || '').toLowerCase();
  if (key === 'he' || key === 'iw') return 'hebrew';
  if (key === 'es') return 'spanish';
  if (key === 'fr') return 'french';
  if (key === 'pt') return 'portuguese';
  if (key === 'it') return 'italian';
  if (key === 'en') return 'english';
  return key || 'hebrew';
}

// Shared, memoized loader for the YouTube IFrame API (bug #33). A single
// "window.onYouTubeIframeAPIReady = initPlayer" per component is last-writer-wins —
// and VideoTranscript renders inside .map() loops, so multiple instances stomp the
// global in one tick and only the last player's onReady fires. This loader appends
// the script at most once, chains any prior callback, and polls window.YT.Player as
// a fallback, so every caller's .then() resolves.
let __ytApiPromise = null;
function loadYouTubeApi() {
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (__ytApiPromise) return __ytApiPromise;
  __ytApiPromise = new Promise((resolve) => {
    const finish = () => { if (window.YT && window.YT.Player) resolve(window.YT); };
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prev === 'function') { try { prev(); } catch (e) {} }
      finish();
    };
    if (!document.getElementById('youtube-iframe-api')) {
      const tag = document.createElement('script');
      tag.id = 'youtube-iframe-api';
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      if (firstScriptTag && firstScriptTag.parentNode) {
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      } else {
        document.head.appendChild(tag);
      }
    }
    const poll = setInterval(() => {
      if (window.YT && window.YT.Player) { clearInterval(poll); resolve(window.YT); }
    }, 100);
  });
  return __ytApiPromise;
}

export default function VideoTranscript({ videoId, videoUrl, iframeId, onPauseVideo, onSeekVideo }) {
  const [expanded, setExpanded] = useState(false);
  const [video, setVideo] = useState(null);
  const [transcribing, setTranscribing] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);
  const [manualTranscript, setManualTranscript] = useState("");
  const [showHebrewInput, setShowHebrewInput] = useState(false);
  const [hebrewText, setHebrewText] = useState("");
  const [generatingTranslations, setGeneratingTranslations] = useState(false);
  const [activeSegmentIdx, setActiveSegmentIdx] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [editingLineIdx, setEditingLineIdx] = useState(null);
  const [editValues, setEditValues] = useState({ transliteration: '', english: '', hebrew: '' });
  const [currentUser, setCurrentUser] = useState(null);
  const activeSegmentRef = useRef(null);
  const containerRef = useRef(null);
  const queryClient = useQueryClient();
  const playerRef = useRef(null);
  const timeTrackerRef = useRef(null);
  // Mirror of activeSegmentIdx so the time-tracking interval can compare without
  // needing activeSegmentIdx in its dep array (avoids interval churn — bug #34).
  const activeSegmentIdxRef = useRef(null);

  useEffect(() => {
    activeSegmentIdxRef.current = activeSegmentIdx;
  }, [activeSegmentIdx]);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const user = await base44.auth.me();
        setCurrentUser(user);
      } catch (e) {}
    };
    fetchUser();
  }, []);

  // Initialize YouTube Player API
  useEffect(() => {
    if (!iframeId) return;

    let cancelled = false;

    const initPlayer = () => {
      if (cancelled) return;
      if (!window.YT || !window.YT.Player) return;

      try {
        playerRef.current = new window.YT.Player(iframeId, {
          events: {
            onReady: () => {
              console.log('YouTube player ready');
            },
            onStateChange: (event) => {
              setIsPlaying(event.data === 1);
            }
          }
        });
      } catch (e) {
        console.log('Player init failed, retrying...', e);
      }
    };

    // Shared, memoized loader avoids stomping other components' onReady (bug #33).
    loadYouTubeApi().then(() => initPlayer());

    return () => { cancelled = true; };
  }, [iframeId]);

  const addToBackpackMutation = useMutation({
    mutationFn: (word) => base44.entities.Word.create(word),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wordRatings'] });
      toast.success("Added to backpack! 🎒");
    },
  });

  useEffect(() => {
    loadVideo();
  }, [videoId, videoUrl]);

  const loadVideo = async () => {
    try {
      // Try to find by video_url first
      let videos = await base44.entities.Video.filter({ video_url: videoUrl });
      
      // Also try by youtube_video_id if we have one
      if (videos.length === 0 && videoId) {
        videos = await base44.entities.Video.filter({ youtube_video_id: videoId });
      }

      if (videos.length > 0) {
        // Pick the one with the best transcript
        const withTranscript = videos.find(v => v.transcript_status === "complete" && v.transcript_text);
        const best = withTranscript || videos[0];
        setVideo(best);
        
        // Only auto-transcribe if no transcript at all
        if (!best.transcript_text && best.transcript_status !== "failed" && best.transcript_status !== "unavailable") {
          startTranscription(best.id);
        }
      } else {
        // Create video entry
        const newVideo = await base44.entities.Video.create({
          video_url: videoUrl,
          title: videoId || "Untitled",
          transcript_status: "processing"
        });
        setVideo(newVideo);
        startTranscription(newVideo.id);
      }
    } catch (e) {
      console.error("Failed to load video", e);
    }
  };

  const startTranscription = async (id) => {
    // Safety check: don't overwrite existing transcript
    const check = await base44.entities.Video.filter({ id });
    if (check[0]?.transcript_text && check[0]?.transcript_status === "complete") {
      setVideo(check[0]);
      setTranscribing(false);
      return;
    }
    setTranscribing(true);
    try {
      // Extract YouTube video ID
      const ytMatch = videoUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([^&?]+)/);
      const ytId = ytMatch ? ytMatch[1] : null;

      if (!ytId) {
        throw new Error("Invalid YouTube URL");
      }

      // Provider-agnostic transcription (lib/transcription). Routes YouTube ids
      // to audio ASR — no YouTube OAuth token needed (bug #23).
      const data = await transcribeMediaSource(youtubeSource(ytId), {
        language: normalizeVideoLang(video?.language),
      });
      const segments = data?.transcript;

      if (!segments || segments.length === 0) {
        // No transcript available - update status and allow manual input
        await base44.entities.Video.update(id, {
          transcript_status: "failed",
          transcript_source: "unavailable",
          youtube_video_id: ytId
        });
        setVideo(prev => ({
          ...prev,
          transcript_status: "failed",
          transcript_source: "unavailable",
          youtube_video_id: ytId
        }));
        toast.error("No captions available - you can add manually");
        setTranscribing(false);
        return;
      }

      // Map [{ text, start, duration }] into this component's tab-separated storage
      // format: transliteration \t english \t hebrew \t start (raw text → 1st column).
      const transcript_text = segments
        .map(s => `${s.text}\t\t\t${s.start}`)
        .join('\n');

      // Save to database
      await base44.entities.Video.update(id, {
        transcript_text,
        transcript_status: "complete",
        transcript_source: "youtube_captions",
        youtube_video_id: ytId,
        transcript_generated_at: new Date().toISOString()
      });

      setVideo(prev => ({
        ...prev,
        transcript_text,
        transcript_status: "complete",
        transcript_source: "youtube_captions",
        youtube_video_id: ytId
      }));

      toast.success("Transcript loaded from YouTube captions!");

    } catch (e) {
      console.error("Transcription error:", e);
      
      // Extract video ID for fallback
      const ytMatch = videoUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([^&?]+)/);
      const ytId = ytMatch ? ytMatch[1] : null;
      
      await base44.entities.Video.update(id, {
        transcript_status: "failed",
        transcript_source: "unavailable",
        youtube_video_id: ytId
      });
      setVideo(prev => ({
        ...prev,
        transcript_status: "failed",
        transcript_source: "unavailable"
      }));
      toast.error("Caption fetch failed - add transcript manually");
    }
    setTranscribing(false);
  };

  const parseTimestampedTranscript = (text) => {
    const errors = [];
    const lines = text.split('\n').filter(l => l.trim());
    const parsed = [];

    lines.forEach((line, idx) => {
      // Match [MM:SS] Hebrew text or [HH:MM:SS] Hebrew text
      const match = line.match(/^\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]\s*(.+)$/);
      
      if (!match) {
        errors.push(`Line ${idx + 1}: Invalid format. Use [MM:SS] Hebrew text`);
        return;
      }

      const [_, min, sec, hour, hebrew] = match;
      const startSeconds = hour 
        ? parseInt(hour) * 3600 + parseInt(min) * 60 + parseInt(sec)
        : parseInt(min) * 60 + parseInt(sec);

      if (!hebrew.trim()) {
        errors.push(`Line ${idx + 1}: Hebrew text is empty`);
        return;
      }

      parsed.push({
        start_time: startSeconds,
        hebrew: hebrew.trim()
      });
    });

    // Validate order
    for (let i = 1; i < parsed.length; i++) {
      if (parsed[i].start_time <= parsed[i-1].start_time) {
        errors.push(`Line ${i + 1}: Timestamp out of order`);
      }
    }

    return { parsed, errors };
  };

  const saveManualTranscript = async () => {
    if (!manualTranscript.trim()) {
      toast.error("Transcript cannot be empty");
      return;
    }

    const { parsed, errors } = parseTimestampedTranscript(manualTranscript);

    if (errors.length > 0) {
      toast.error(errors[0]);
      return;
    }

    // Calculate end times
    const blocksWithEnd = parsed.map((block, i) => ({
      ...block,
      end_time: i < parsed.length - 1 ? parsed[i + 1].start_time : block.start_time + 10
    }));

    setGeneratingTranslations(true);
    toast.info("Processing transcript...");

    // Target language of this video (Hebrew if unknown → unchanged behavior).
    const lang = normalizeVideoLang(video?.language);
    const langLabel = languageLabel(lang);
    const nikudHint = usesNikud(lang) ? 'add nikud, ' : '';

    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Process these ${blocksWithEnd.length} ${langLabel} segments. For each: ${nikudHint}transliteration, English translation.

${blocksWithEnd.map((b, i) => `${i + 1}|${b.hebrew}`).join('\n')}

Return JSON with segments array, each: hebrew_nikud, transliteration, translation. Keep same order.`,
        response_json_schema: {
          type: "object",
          properties: {
            segments: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  hebrew_nikud: { type: "string" },
                  transliteration: { type: "string" },
                  translation: { type: "string" }
                }
              }
            }
          }
        }
      });

      const enriched = blocksWithEnd.map((block, i) => ({
        ...block,
        hebrew: result.segments[i]?.hebrew_nikud || block.hebrew,
        transliteration: result.segments[i]?.transliteration || "",
        translation: result.segments[i]?.translation || ""
      }));

      // Convert to storage format: each line with time in 4th column
      const formatted = enriched.map(b => 
        `${b.transliteration}\t${b.translation}\t${b.hebrew}\t${b.start_time}`
      ).join('\n');

      await base44.entities.Video.update(video.id, {
        transcript_text: formatted,
        transcript_status: "complete",
        transcript_source: "manual",
        transcript_generated_at: new Date().toISOString()
      });

      setVideo(prev => ({
        ...prev,
        transcript_text: formatted,
        transcript_status: "complete",
        transcript_source: "manual"
      }));

      setShowManualInput(false);
      setManualTranscript("");
      toast.success("Transcript saved with nikud and translations!");
    } catch (e) {
      console.error("Transcript generation error:", e);
      toast.error(`Failed: ${e.message || 'Unknown error'}`);
    }
    
    setGeneratingTranslations(false);
  };

  const generateTranscript = async () => {
    if (!hebrewText.trim()) {
      toast.error(`Please paste ${languageLabel(normalizeVideoLang(video?.language))} text`);
      return;
    }

    // Target language of this video (Hebrew if unknown → unchanged behavior).
    const lang = normalizeVideoLang(video?.language);
    const langLabel = languageLabel(lang);
    const nikudHint = usesNikud(lang) ? ', add nikud,' : ',';
    const nativeKeyHint = usesNikud(lang) ? 'hebrew (with nikud)' : `hebrew (${langLabel} native script)`;

    setGeneratingTranslations(true);
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Split this ${langLabel} text into sentences${nikudHint} transliteration and English translation for each.

${hebrewText}

Return JSON sentences array, each: transliteration, english, ${nativeKeyHint}.`,
        response_json_schema: {
          type: "object",
          properties: {
            sentences: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  transliteration: { type: "string" },
                  english: { type: "string" },
                  hebrew: { type: "string" }
                }
              }
            }
          }
        }
      });

      // Format as: Transliteration\tEnglish\tHebrew (one line per sentence)
      const formatted = result.sentences.map(s => 
        `${s.transliteration}\t${s.english}\t${s.hebrew}`
      ).join('\n');

      // Preserve the video's existing language if known; default to "he" so the
      // legacy "paste Hebrew text" flow is unchanged when no language is set.
      const savedLang = video?.language || "he";
      await base44.entities.Video.update(video.id, {
        transcript_text: formatted,
        transcript_status: "complete",
        transcript_source: "manual",
        language: savedLang,
        transcript_generated_at: new Date().toISOString()
      });

      setVideo(prev => ({
        ...prev,
        transcript_text: formatted,
        transcript_status: "complete",
        transcript_source: "manual",
        language: savedLang
      }));

      setShowHebrewInput(false);
      setHebrewText("");
      toast.success("Transcript generated with translations!");
    } catch (e) {
      toast.error("Failed to generate transcript");
    }
    setGeneratingTranslations(false);
  };

  const updateTranscriptLine = async (blockIdx, lineType, newValue) => {
    const lines = video.transcript_text.split('\n').filter(l => l && l.trim());
    const parts = lines[blockIdx].split('\t');
    
    // Update the correct field based on lineType
    if (lineType === 'transliteration') {
      parts[0] = newValue;
    } else if (lineType === 'english') {
      parts[1] = newValue;
    } else if (lineType === 'hebrew') {
      parts[2] = newValue;
    }
    
    // Rebuild the line, preserving timestamp if it exists
    lines[blockIdx] = parts.join('\t');
    const newTranscript = lines.join('\n');
    
    try {
      await base44.entities.Video.update(video.id, {
        transcript_text: newTranscript
      });
      setVideo(prev => ({ ...prev, transcript_text: newTranscript }));
      toast.success("Updated!");
    } catch (e) {
      toast.error("Failed to update");
    }
  };

  const startEditingLine = (idx, transliteration, english, hebrew) => {
    setEditingLineIdx(idx);
    setEditValues({ transliteration, english, hebrew });
  };

  const saveLineEdit = async (blockIdx) => {
    const lines = video.transcript_text.split('\n').filter(l => l && l.trim());
    const parts = lines[blockIdx].split('\t');
    
    // Target language of this video (Hebrew if unknown → unchanged behavior).
    const lang = normalizeVideoLang(video?.language);
    const langLabel = languageLabel(lang);

    try {
      toast.info("Updating translations...");

      // Use AI to regenerate all fields based on what was edited
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Given this ${langLabel} sentence, provide the transliteration and English translation:

${langLabel}: ${editValues.hebrew}

Provide:
1. transliteration: Phonetic ${langLabel} using Latin characters
2. translation: English translation`,
        response_json_schema: {
          type: "object",
          properties: {
            transliteration: { type: "string" },
            translation: { type: "string" }
          }
        }
      });
      
      // Use AI results
      const newLine = parts.length >= 4 
        ? `${result.transliteration}\t${result.translation}\t${editValues.hebrew}\t${parts[3]}`
        : `${result.transliteration}\t${result.translation}\t${editValues.hebrew}`;
      
      lines[blockIdx] = newLine;
      const newTranscript = lines.join('\n');
      
      await base44.entities.Video.update(video.id, {
        transcript_text: newTranscript
      });
      setVideo(prev => ({ ...prev, transcript_text: newTranscript }));
      setEditingLineIdx(null);
      toast.success("Sentence updated with AI translations!");
    } catch (e) {
      toast.error("Failed to update");
    }
  };

  const cancelEdit = () => {
    setEditingLineIdx(null);
    setEditValues({ transliteration: '', english: '', hebrew: '' });
  };

  const addSentenceToBackpack = (hebrew, transliteration, english) => {
    addToBackpackMutation.mutate({
      word: hebrew,
      translation: english,
      phonetic: transliteration,
      category: "wordbank",
      times_practiced: 1,
      mastered: false,
    });
  };

  const handlePlaySegment = (idx, timeStr) => {
    if (!onSeekVideo) return;
    
    // If clicking same segment while playing, pause
    if (activeSegmentIdx === idx && isPlaying) {
      if (onPauseVideo) {
        onPauseVideo();
        setIsPlaying(false);
      }
      return;
    }
    
    let seconds = 0;
    
    // Parse time format (MM:SS or just seconds)
    if (timeStr.includes(':')) {
      const [min, sec] = timeStr.split(':').map(Number);
      seconds = (min * 60) + sec;
    } else {
      seconds = parseFloat(timeStr);
    }
    
    setActiveSegmentIdx(idx);
    setIsPlaying(true);
    setCurrentTime(seconds);
    onSeekVideo(seconds);
  };

  // Auto-scroll to active segment smoothly
  useEffect(() => {
    if (activeSegmentRef.current && containerRef.current && isPlaying) {
      const container = containerRef.current;
      const activeElement = activeSegmentRef.current;
      
      // Calculate smooth scroll position to keep active segment near top
      const containerRect = container.getBoundingClientRect();
      const elementRect = activeElement.getBoundingClientRect();
      const offset = elementRect.top - containerRect.top - 40; // 40px from top
      
      container.scrollBy({
        top: offset,
        behavior: 'smooth'
      });
    }
  }, [activeSegmentIdx, isPlaying]);

  // Track video playback time and auto-highlight segments
  useEffect(() => {
    if (!expanded || !video?.transcript_text) return;

    const lines = video.transcript_text.split('\n').filter(l => l && l.trim());
    const segments = lines.map((line, idx) => {
      const parts = line.split('\t');
      return { idx, time: parts.length >= 4 && parts[3] ? parseFloat(parts[3]) : null };
    }).filter(s => s.time !== null && !isNaN(s.time));

    if (segments.length === 0) return;

    // Poll YouTube player for current time
    const checkTime = () => {
      if (!playerRef.current) return;
      
      try {
        const currentTime = playerRef.current.getCurrentTime();
        const playerState = playerRef.current.getPlayerState();
        
        // Update playing state (1 = playing)
        setIsPlaying(playerState === 1);
        
        // Find which segment should be active
        let newActiveIdx = -1;
        for (let i = segments.length - 1; i >= 0; i--) {
          if (currentTime >= segments[i].time) {
            newActiveIdx = segments[i].idx;
            break;
          }
        }
        
        if (newActiveIdx !== -1 && newActiveIdx !== activeSegmentIdxRef.current) {
          activeSegmentIdxRef.current = newActiveIdx;
          setActiveSegmentIdx(newActiveIdx);
        }
      } catch (e) {
        // Player not ready yet
      }
    };

    timeTrackerRef.current = setInterval(checkTime, 200);

    return () => {
      if (timeTrackerRef.current) {
        clearInterval(timeTrackerRef.current);
      }
    };
  }, [expanded, video?.transcript_text]);

  const deleteTranscript = async () => {
    if (!confirm('Delete transcript?\n\nThis will remove the current transcript from this video.')) return;
    
    try {
      await base44.entities.Video.update(video.id, {
        transcript_text: null,
        transcript_status: "deleted",
        transcript_source: null,
        language: null
      });

      setVideo(prev => ({
        ...prev,
        transcript_text: null,
        transcript_status: "deleted",
        transcript_source: null,
        language: null
      }));

      setExpanded(true);
      toast.success("Transcript deleted");
    } catch (e) {
      toast.error("Failed to delete transcript");
    }
  };

  if (!video) return null;

  // Target language of this video for display gating (RTL, native-script input).
  // Hebrew (incl. "he"/"iw") keeps its current RTL behavior; Latin languages go LTR.
  const lang = normalizeVideoLang(video.language);
  const isRtl = isRTLLanguage(lang);

  const isProcessing = video.transcript_status === "processing" || transcribing;
  const hasTranscript = video.transcript_status === "complete" && video.transcript_text;

  return (
    <div className="mt-4">
      <div className="flex gap-2">
        <Button
          onClick={() => setExpanded(!expanded)}
          variant="outline"
          className="flex-1 bg-white/5 border-white/20 text-white hover:bg-white/10"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Fetching captions...
            </>
          ) : hasTranscript ? (
            <>
              {expanded ? <ChevronUp className="w-4 h-4 mr-2" /> : <ChevronDown className="w-4 h-4 mr-2" />}
              {expanded ? "Hide transcript" : "Show transcript"}
            </>
          ) : (
            "No transcript available"
          )}
        </Button>
        
        {!isProcessing && (
          <Button
            onClick={() => setShowManualInput(true)}
            variant="outline"
            size="sm"
            className="bg-green-500/20 border-green-500/50 text-green-400 hover:bg-green-500/30"
            title={hasTranscript ? "Replace transcript" : "Add transcript"}
          >
            <Plus className="w-4 h-4" />
          </Button>
        )}
      </div>

      <AnimatePresence>
        {expanded && hasTranscript && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 bg-white/5 border border-white/10 rounded-xl p-4 max-h-96 overflow-y-auto"
            ref={containerRef}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-white/60 text-xs">
                {video.transcript_source === "youtube_captions" ? "📝 YouTube Captions" : 
                 video.transcript_source === "manual" ? "📝 Manual Transcript" : "📝 Transcript"}
              </span>
              <div className="flex items-center gap-2">
                {video.language && (
                  <span className="text-white/40 text-xs uppercase">{video.language}</span>
                )}
                {currentUser?.role === 'admin' && (
                  <button
                    onClick={deleteTranscript}
                    className="text-red-400 hover:text-red-300 p-1"
                    title="Delete transcript"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            <div className="space-y-2">
              {(() => {
                // Parse transcript: each line has tab-separated transliteration, english, hebrew
                const lines = video.transcript_text.split('\n').filter(l => l && l.trim());
                
                return lines.map((line, blockIdx) => {
                  const parts = line.split('\t');
                  
                  // If we have exactly 3 parts, treat as Translit/English/Hebrew
                  if (parts.length >= 3) {
                    const transliteration = (parts[0] || '').trim();
                    const english = (parts[1] || '').trim();
                    const hebrew = (parts[2] || '').trim();
                    const isActive = activeSegmentIdx === blockIdx;
                    const hasTimestamp = parts.length >= 4 && parts[3];
                    
                    // Skip if all fields are empty
                    if (!transliteration && !english && !hebrew) return null;
                    
                    return (
                      <div 
                      key={blockIdx} 
                      ref={isActive ? activeSegmentRef : null}
                      className={`group relative p-1.5 rounded-lg transition-all flex gap-2 ${
                        isActive ? 'bg-yellow-400/20 border-l-4 border-yellow-500 pl-2' : 'hover:bg-white/5'
                      }`}
                      >
                        {onSeekVideo && hasTimestamp && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePlaySegment(blockIdx, parts[3].trim());
                            }}
                            className={`flex-shrink-0 w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center transition-all mt-0.5 ${
                              isActive 
                                ? 'bg-yellow-500/60 hover:bg-yellow-500/80' 
                                : 'bg-cyan-500/20 hover:bg-cyan-500/40'
                            }`}
                            title={isActive && isPlaying ? "Pause" : "Play this sentence"}
                            aria-label={isActive && isPlaying ? "Pause" : "Play this sentence"}
                          >
                            {isActive && isPlaying ? (
                              <div className="w-3 h-3 md:w-4 md:h-4 flex items-center justify-center gap-0.5">
                                <div className="w-1 h-full bg-white" />
                                <div className="w-1 h-full bg-white" />
                              </div>
                            ) : (
                              <Play className={`w-3 h-3 md:w-4 md:h-4 ${
                                isActive ? 'text-white fill-white' : 'text-cyan-400 fill-cyan-400'
                              }`} />
                            )}
                          </button>
                        )}
                        <div className="flex-1 relative">
                        <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => addSentenceToBackpack(hebrew, transliteration, english)}
                            className="w-7 h-7 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 flex items-center justify-center"
                            title="Add to backpack"
                          >
                            <span className="text-base">🎒</span>
                          </button>
                        </div>
                        {editingLineIdx === blockIdx ? (
                          <div className="space-y-2 pr-16">
                            <input
                              type="text"
                              value={editValues.transliteration}
                              onChange={(e) => setEditValues({...editValues, transliteration: e.target.value})}
                              className="w-full px-2 py-1 bg-white/10 border border-white/20 rounded text-white/90 text-lg"
                              placeholder="Transliteration"
                            />
                            <input
                              type="text"
                              value={editValues.english}
                              onChange={(e) => setEditValues({...editValues, english: e.target.value})}
                              className="w-full px-2 py-1 bg-white/10 border border-white/20 rounded text-white/70 text-base"
                              placeholder="English"
                            />
                            <input
                              type="text"
                              value={editValues.hebrew}
                              onChange={(e) => setEditValues({...editValues, hebrew: e.target.value})}
                              className="w-full px-2 py-1 bg-white/10 border border-white/20 rounded text-cyan-400 text-xl font-bold"
                              placeholder={languageLabel(lang)}
                              dir={isRtl ? 'rtl' : 'ltr'}
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => saveLineEdit(blockIdx)}
                                className="px-3 py-1 bg-green-500/20 hover:bg-green-500/30 border border-green-500/50 rounded text-green-400 text-sm flex items-center gap-1"
                              >
                                <Check className="w-3 h-3" /> Save
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="px-3 py-1 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 rounded text-red-400 text-sm flex items-center gap-1"
                              >
                                <X className="w-3 h-3" /> Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {transliteration && (
                              <div style={{ direction: 'ltr', textAlign: 'left', unicodeBidi: 'bidi-override' }} className="flex items-start gap-1 flex-wrap">
                                {transliteration.split(/(\s+)/).map((part, i, arr) => {
                                  const isLastWord = i === arr.length - 1 || (i === arr.length - 2 && /^\s+$/.test(arr[arr.length - 1]));
                                  return /\S/.test(part) ? (
                                    <span key={i} className="inline-flex items-center gap-1">
                                      <VideoTranscriptWord
                                        word={part}
                                        hebrew={hebrew}
                                        transliteration={transliteration}
                                        english={english}
                                        onEdit={(newWord) => {
                                          const newText = transliteration.split(/(\s+)/).map((p, idx) => idx === i ? newWord : p).join('');
                                          updateTranscriptLine(blockIdx, 'transliteration', newText);
                                        }}
                                        onAddToBackpack={addSentenceToBackpack}
                                        className="text-white/90 text-sm leading-tight"
                                      />
                                      {isLastWord && (
                                        <button
                                          onClick={() => startEditingLine(blockIdx, transliteration, english, hebrew)}
                                          className="w-5 h-5 rounded bg-blue-500/20 hover:bg-blue-500/30 flex items-center justify-center ml-1"
                                          title="Edit sentence"
                                        >
                                          <Pencil className="w-3 h-3 text-blue-400" />
                                        </button>
                                      )}
                                    </span>
                                  ) : part;
                                })}
                              </div>
                            )}
                            {english && (
                              <div style={{ direction: 'ltr', textAlign: 'left', unicodeBidi: 'bidi-override' }}>
                                {english.split(/(\s+)/).map((part, i) => 
                                  /\S/.test(part) ? (
                                    <VideoTranscriptWord
                                      key={i}
                                      word={part}
                                      hebrew={hebrew}
                                      transliteration={transliteration}
                                      english={english}
                                      onEdit={(newWord) => {
                                        const newText = english.split(/(\s+)/).map((p, idx) => idx === i ? newWord : p).join('');
                                        updateTranscriptLine(blockIdx, 'english', newText);
                                      }}
                                      onAddToBackpack={addSentenceToBackpack}
                                      className="text-white/70 text-sm leading-tight"
                                    />
                                  ) : part
                                )}
                              </div>
                            )}
                            {hebrew && (
                              <div style={{ direction: 'ltr', textAlign: 'left', unicodeBidi: 'bidi-override' }}>
                                {hebrew.split(/(\s+)/).map((part, i) => 
                                  /\S/.test(part) ? (
                                    <VideoTranscriptWord
                                      key={i}
                                      word={part}
                                      hebrew={hebrew}
                                      transliteration={transliteration}
                                      english={english}
                                      onEdit={(newWord) => {
                                        const newText = hebrew.split(/(\s+)/).map((p, idx) => idx === i ? newWord : p).join('');
                                        updateTranscriptLine(blockIdx, 'hebrew', newText);
                                      }}
                                      onAddToBackpack={addSentenceToBackpack}
                                      className="text-cyan-400 text-sm font-bold leading-tight"
                                    />
                                  ) : part
                                )}
                              </div>
                            )}
                          </>
                        )}
                        </div>
                        </div>
                        );
                        }
                  
                  // Fallback: display as plain text
                  return (
                    <div 
                      key={blockIdx}
                      className="text-white/90"
                      style={{ 
                        direction: video.language === "he" || video.language === "iw" ? 'rtl' : 'ltr',
                        textAlign: 'left'
                      }}
                    >
                      {line}
                    </div>
                  );
                });
              })()}
            </div>
          </motion.div>
        )}
        
        {expanded && video?.transcript_status === "failed" && video?.transcript_source === "unavailable" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-center"
          >
            <p className="text-red-400 text-sm">Transcript unavailable for this video.</p>
            <p className="text-white/40 text-xs mt-1">This video doesn't have captions enabled.</p>
          </motion.div>
        )}

        {expanded && video?.transcript_status === "deleted" && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 bg-white/5 border border-white/10 rounded-xl p-6 text-center"
          >
            <p className="text-white/60 text-sm mb-3">No transcript added yet.</p>
            <Button
              onClick={() => setShowManualInput(true)}
              className="bg-green-500/20 text-green-400 hover:bg-green-500/30 border-green-500/50"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add New Transcript
            </Button>
          </motion.div>
        )}

        {showHebrewInput && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 bg-green-500/10 border border-green-500/30 rounded-xl p-4"
          >
            <p className="text-white/60 text-sm mb-2">
              ✨ Paste {languageLabel(lang)} text - I'll auto-generate transliteration & translation:
            </p>
            <Textarea
              value={hebrewText}
              onChange={(e) => setHebrewText(e.target.value)}
              placeholder={isRtl ? "שָׁלוֹם לְכֻלָּם!&#10;הַיּוֹם נִלְמַד עִבְרִית.&#10;אֲנִי אוֹהֵב לִלְמוֹד שְׂפוֹת." : `Paste ${languageLabel(lang)} text here, one sentence per line...`}
              className="bg-white/5 border-white/20 text-white min-h-[200px] mb-3"
              dir={isRtl ? 'rtl' : 'ltr'}
            />
            <div className="flex gap-2">
              <Button 
                onClick={generateTranscript}
                disabled={generatingTranslations}
                className="flex-1 bg-green-500/20 text-green-400 hover:bg-green-500/30"
              >
                {generatingTranslations ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generate Transcript
                  </>
                )}
              </Button>
              <Button 
                onClick={() => { setShowHebrewInput(false); setHebrewText(""); }}
                variant="outline"
                className="border-white/20 text-white/60"
              >
                Cancel
              </Button>
            </div>
          </motion.div>
        )}

        {showManualInput && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 bg-white/5 border border-white/10 rounded-xl p-4"
          >
            <p className="text-white/60 text-sm mb-2">
              Paste {languageLabel(lang)} transcript with timestamps (format: [MM:SS] {languageLabel(lang)} text on same line):
            </p>
            <Textarea
              value={manualTranscript}
              onChange={(e) => setManualTranscript(e.target.value)}
              placeholder={isRtl ? "[00:00] בוקר טוב מה שלומכם היום נעשה סרטון&#10;[00:06] למתחילים&#10;[00:08] לנשים שלא יודעים עברית" : `[00:00] ${languageLabel(lang)} text on this line&#10;[00:06] next line&#10;[00:08] and so on`}
              className="bg-white/5 border-white/20 text-white min-h-[200px] mb-3"
              dir={isRtl ? 'rtl' : 'ltr'}
            />
            <div className="flex gap-2">
              <Button 
                onClick={saveManualTranscript}
                disabled={generatingTranslations}
                className="flex-1 bg-green-500/20 text-green-400 hover:bg-green-500/30"
              >
                {generatingTranslations ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  "Save & Generate"
                )}
              </Button>
              <Button 
                onClick={() => { setShowManualInput(false); setManualTranscript(""); }}
                variant="outline"
                className="border-white/20 text-white/60"
              >
                Cancel
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}