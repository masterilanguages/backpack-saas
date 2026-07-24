"use client";

import React, { useState, useEffect, useRef } from "react";
import NextLink from "next/link";
import { useNavigate, createPageUrl } from "@/lib/router-compat";
import { base44 as base44Client } from "@/api/base44Client";
// base44Client is a JS shim whose `entities` are built dynamically, so TS can't
// see entity keys. Cast to `any` for ergonomic access — the runtime shape is
// guaranteed by the shim.
const base44: any = base44Client;
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Search, Video, Users, Loader2, ChevronDown, X, Pencil } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import EditableWord from "@/components/learning/EditableWord";
import GrammarTab from "@/components/grammar/GrammarTab";
import CoreVocabTab from "@/components/grammar/CoreVocabTab";
import ClickableTranscriptText from "@/components/learning/ClickableTranscriptText";
import TranslatorWidget from "@/components/TranslatorWidget";

import ContinuousTranscript from "@/components/video/ContinuousTranscript";
import AddVideoDialog from "@/components/media/AddVideoDialog";
import PostVideoFlashcards from "@/components/video/PostVideoFlashcards";
import { languageLabel, isRTLText } from "@/lib/language";
import { transcribeMediaSource, youtubeSource } from "@/lib/transcription";

// Shared, memoized loader for the YouTube IFrame API. The YT API calls the single
// global window.onYouTubeIframeAPIReady ONCE at script load — a single
// "window.onYouTubeIframeAPIReady = initPlayer" per component means last-writer-wins
// and other players' onReady never fire. This helper appends the script at most once,
// chains any previously-registered callback, and polls window.YT.Player as a fallback,
// so every caller's .then() runs. (See bug #33.)
let __ytApiPromise: any = null;
function loadYouTubeApi() {
  const w: any = window;
  if (w.YT && w.YT.Player) return Promise.resolve(w.YT);
  if (__ytApiPromise) return __ytApiPromise;
  __ytApiPromise = new Promise((resolve) => {
    const finish = () => { if (w.YT && w.YT.Player) resolve(w.YT); };
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      if (typeof prev === 'function') { try { prev(); } catch (e) {} }
      finish();
    };
    if (!document.getElementById('youtube-iframe-api')) {
      const tag = document.createElement('script');
      tag.id = 'youtube-iframe-api';
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
    // Fallback poll in case onYouTubeIframeAPIReady was already consumed.
    const poll = setInterval(() => {
      if (w.YT && w.YT.Player) { clearInterval(poll); resolve(w.YT); }
    }, 100);
  });
  return __ytApiPromise;
}

const DEFAULT_TOPICS = [
  "Religion / Spirituality",
  "Sports / Fitness",
  "Cooking / Food",
  "Nutrition",
  "Health / Wellness",
  "Meditation / Mindfulness",
  "Music",
  "Travel",
  "Culture",
  "Education / Learning",
  "Business / Career",
  "Personal Growth",
  "Relationships",
  "News / Current Events"
];

export default function MediaLibrary() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingVideo, setEditingVideo] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterLanguage, setFilterLanguage] = useState("");
  const [filterDifficulty, setFilterDifficulty] = useState<any[]>([]);
  const [filterTopics, setFilterTopics] = useState<any[]>([]);
  const [filterContentTypes, setFilterContentTypes] = useState(["videos", "songs", "audio"]);
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedVideo, setSelectedVideo] = useState<any>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [transcript, setTranscript] = useState<any[]>([]);
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [translationInProgress, setTranslationInProgress] = useState(false);
  const [videoPlayer, setVideoPlayer] = useState<any>(null);
  const videoPlayerRef = useRef<any>(null);
  const [showRecommended, setShowRecommended] = useState(false);
  const [showLibrary, setShowLibrary] = useState(true);
  const [editingSegment, setEditingSegment] = useState<any>(null);
  const [editingWords, setEditingWords] = useState<any>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [pastedTranscript, setPastedTranscript] = useState("");
  const [mediaType, setMediaType] = useState("video");
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [activeMediaTab, setActiveMediaTab] = useState("videos");
  const [draggedButton, setDraggedButton] = useState<any>(null);
  const [showBackpackSubmenu, setShowBackpackSubmenu] = useState(false);
  const [activeBackpackTab, setActiveBackpackTab] = useState("allwords");
  const [buttonOrder, setButtonOrder] = useState<any[]>(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("mediaLibraryButtonOrder") : null;
    const parsed = saved ? JSON.parse(saved) : ["videos", "songs", "audio"];
    return parsed.filter((b: any) => b !== "backpack");
  });
  const [selectedVerb, setSelectedVerb] = useState<any>(null);
  const [extractingVocab, setExtractingVocab] = useState(false);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  // Language the current recommendations were fetched for — stale recs are
  // refetched when the user switches learning language.
  const [recommendationsLanguage, setRecommendationsLanguage] = useState("");
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [showPostVideoFlashcards, setShowPostVideoFlashcards] = useState(false);
  const [sessionVocabWords, setSessionVocabWords] = useState<any[]>([]);
  const [videoEnded, setVideoEnded] = useState(false);
  const [loadingFlashcards, setLoadingFlashcards] = useState(false);
  const [topics, setTopics] = useState<any[]>(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("mediaLibraryTopics") : null;
    return saved ? JSON.parse(saved) : DEFAULT_TOPICS;
  });
  const [editingTopics, setEditingTopics] = useState(false);
  const [newTopicInput, setNewTopicInput] = useState("");

  const sessionDay = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get('sessionDay') : null;
  const urlDayId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get('dayId') : null;
  const urlTaskId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get('taskId') : null;

  const markTaskComplete = async () => {
    if (!urlDayId || !urlTaskId) return;
    try {
      const progList = await base44.entities.DayProgress.filter({ day_id: urlDayId });
      const prog = progList[0];
      if (prog) {
        const already = (prog.subsections_completed || []).includes(urlTaskId);
        if (!already) {
          await base44.entities.DayProgress.update(prog.id, {
            subsections_completed: [...(prog.subsections_completed || []), urlTaskId]
          });
        }
      } else {
        // day_number is NOT NULL with no default — resolve it from the Day row.
        const day = await base44.entities.Day.get(urlDayId);
        await base44.entities.DayProgress.create({
          day_id: urlDayId,
          day_number: day?.day_number ?? 0,
          subsections_completed: [urlTaskId]
        });
      }
    } catch (e) { console.error('Failed to mark task complete', e); toast.error('No se pudo guardar el progreso.'); }
  };

  const handleStartFlashcards = async () => {
    setLoadingFlashcards(true);
    await markTaskComplete();
    setLoadingFlashcards(false);
    // Pass video + transcript to dictation page
    const videoId = selectedVideo?.video_id || selectedVideo?.youtube_video_id || extractYouTubeId(selectedVideo?.video_url || "");
    if (typeof window !== "undefined") {
      sessionStorage.setItem("dictationData", JSON.stringify({
        videoId,
        title: selectedVideo?.title || "",
        transcript: transcript.filter((s: any) => s.transliteration || s.text),
      }));
    }
    navigate("/practice/dictation");
  };

  const handleRankWords = async () => {
    if (!sessionDay) return;
    await markTaskComplete();
    navigate("/home");
  };

  const [formData, setFormData] = useState<any>({
    title: "",
    language: "hebrew",
    video_url: "",
    video_id: "",
    topics: [],
    difficulty_level: "All",
    duration_minutes: "",
    tags: "",
    speaking_speed: "Normal",
    accent_region: "",
    suitable_for_journaling: false,
    suitable_for_speaking: false,
    is_active: true,
    thumbnail_url: "",
    notes: "",
    default_day: "",
    transcript_phonetics: ""
  });

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const user = await base44.auth.me();
        setCurrentUser(user);
      } catch (e) {}
    };
    fetchUser();
    document.title = "Media Library - Lashon Languages";

    // Auto-open video if videoId param is present
    const urlParams = new URLSearchParams(window.location.search);
    const videoId = urlParams.get('videoId');
    if (videoId) {
      base44.entities.MediaLibrary.filter({ video_id: videoId }).then((results: any) => {
        if (results[0]) {
          handleVideoClick(results[0]);
        }
      }).catch(() => {});
    }
  }, []);

  const { data: videos = [] } = useQuery({
    queryKey: ['mediaLibrary'],
    queryFn: () => base44.entities.MediaLibrary.list(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Personal per-user videos (user_saved_video). RLS scopes the list: a
  // student gets only their own rows; an org admin gets every student's
  // rows (that is the admin's approval queue).
  const { data: savedVideos = [] } = useQuery({
    queryKey: ['userSavedVideos', currentUser?.email],
    queryFn: () => base44.entities.UserSavedVideo.list(),
    enabled: !!currentUser?.email,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: userProfile } = useQuery({
    queryKey: ['userProfile', currentUser?.email],
    queryFn: async () => {
      if (!currentUser?.email) return null;
      const profiles = await base44.entities.UserProfile.filter({ created_by: currentUser.email });
      return profiles[0] || null;
    },
    enabled: !!currentUser?.email,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Follow the learning language picked in the sidebar. This effect only re-runs
  // when userProfile.language actually changes, so a filter the user picked by
  // hand survives — it's only overridden when they switch learning language.
  useEffect(() => {
    if (userProfile?.language) {
      setFilterLanguage(userProfile.language);
    }
  }, [userProfile?.language]);

  const { data: userCoins } = useQuery({
    queryKey: ['userCoins', currentUser?.email],
    queryFn: async () => {
      if (!currentUser?.email) return null;
      const coins = await base44.entities.UserCoins.filter({ created_by: currentUser.email });
      return coins[0] || null;
    },
    enabled: !!currentUser?.email,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: allVideosData = [] } = useQuery({
    queryKey: ['allVideos'],
    queryFn: () => base44.entities.Video.list(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: !!currentUser,
  });

  const { data: userVideos = [] } = useQuery({
    queryKey: ['userVideos', userProfile?.language],
    queryFn: async () => {
      const list = await base44.entities.Video.list();
      const lang = userProfile?.language;
      return list
        .filter((v: any) => !v.deleted_at && v.is_active !== false)
        .filter((v: any) => !lang || v.language === lang || v.language === lang.slice(0, 2))
        .sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: !!currentUser && !!userProfile,
  });

  const { data: myProgram = [] } = useQuery({
    queryKey: ['myProgram'],
    queryFn: async () => {
      if (!currentUser?.email) return [];
      return await base44.entities.UserProgram.filter({ user_email: currentUser.email });
    },
    enabled: !!currentUser,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: wordRatings = [] } = useQuery({
    queryKey: ['wordRatings', currentUser?.email],
    queryFn: () => base44.entities.Word.filter({ category: "wordbank", created_by: currentUser.email }),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: activeMediaTab === 'verbs' && !!currentUser?.email,
  });

  const createWordMutation = useMutation({
    mutationFn: (wordData: any) => base44.entities.Word.create(wordData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['words'] });
      toast.success("Added to backpack! 🎒");
    },
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['allUsers'],
    queryFn: async () => {
      if (currentUser?.role !== 'admin' && currentUser?.role !== 'coach') return [];
      return await base44.entities.User.list();
    },
    enabled: currentUser?.role === 'admin' || currentUser?.role === 'coach',
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Sessions that actually exist for the language picked INSIDE the modal (not the
  // profile's) — that's the language the schedule lookup uses on save. Shares the
  // ['days', lang] cache with the Days page.
  const { data: sessionDays = [] } = useQuery({
    queryKey: ['days', formData.language],
    queryFn: () => base44.entities.Day.filter({ language: formData.language }),
    enabled: showAddDialog && !!formData.language,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const sessionOptions = [...sessionDays]
    .sort((a: any, b: any) => a.day_number - b.day_number)
    .map((d: any) => ({ day_number: d.day_number, count: (d.subsections || []).length }));

  const createVideoMutation = useMutation({
    mutationFn: (data: any) => base44.entities.MediaLibrary.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mediaLibrary'] });
      setShowAddDialog(false);
      resetForm();
      toast.success("Video added to library!");
    },
  });

  // Helper to determine which entity the selected video belongs to
  const getVideoEntity = (video: any) => {
    // Personal videos a user added to their own account (tagged client-side
    // when merging savedVideos into the library list below).
    if (video?._source === 'personal') {
      return base44.entities.UserSavedVideo;
    }
    // Videos from userVideos (Video entity) have youtube_video_id but no topics/difficulty_level
    if (video?.youtube_video_id !== undefined && video?.topics === undefined) {
      return base44.entities.Video;
    }
    return base44.entities.MediaLibrary;
  };

  const createSavedVideoMutation = useMutation({
    mutationFn: (data: any) => base44.entities.UserSavedVideo.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userSavedVideos'] });
      toast.success("Video added to your library!");
    },
    onError: (e: any) => {
      console.error("createSavedVideoMutation failed", e);
      toast.error("Could not add video");
    },
  });

  const deleteSavedVideoMutation = useMutation({
    mutationFn: async (id: any) => {
      const deleted = await base44.entities.UserSavedVideo.delete(id);
      if (!deleted || deleted.length === 0) throw new Error("Not allowed to delete this video");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userSavedVideos'] });
      toast.success("Video removed");
    },
    onError: (e: any) => {
      console.error("deleteSavedVideoMutation failed", e);
      toast.error("Could not remove video");
    },
  });

  // Admin approves a student's video: copy it into the master library
  // (media_library is admin-write-only, which is exactly why this runs from
  // the admin's session) and remove the personal row.
  const approveSavedVideoMutation = useMutation({
    mutationFn: async (video: any) => {
      await base44.entities.MediaLibrary.create({
        title: video.title,
        language: video.language || userProfile?.language || 'hebrew',
        video_url: video.video_url,
        video_id: video.video_id,
        topics: video.topics || [],
        difficulty_level: video.difficulty_level || 'All',
        duration_minutes: video.duration_minutes ?? null,
        tags: video.tags || '',
        thumbnail_url: video.thumbnail_url || '',
        notes: video.notes || '',
        processed_transcript: video.processed_transcript || [],
        session_vocab_words: video.session_vocab_words || [],
        is_active: true,
      });
      await base44.entities.UserSavedVideo.delete(video.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mediaLibrary'] });
      queryClient.invalidateQueries({ queryKey: ['userSavedVideos'] });
      toast.success("Approved — video is now in the master library!");
    },
    onError: (e: any) => {
      console.error("approveSavedVideoMutation failed", e);
      toast.error("Could not approve video");
    },
  });

  const updateVideoMutation = useMutation({
    mutationFn: ({ id, data, entity }: any) => (entity || base44.entities.MediaLibrary).update(id, data),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['mediaLibrary'] });
      queryClient.invalidateQueries({ queryKey: ['userSavedVideos'] });
      setEditingVideo(null);
      setShowAddDialog(false);
      resetForm();
      toast.success("Video updated!");
    },
    onError: (e: any) => {
      console.error("updateVideoMutation failed", e);
      toast.error("Failed to save video changes");
    },
  });

  // Helper: extract vocab words from processed transcript and store on the MediaLibrary record
  const extractAndStoreVocabWords = async (videoId: any, processedTranscript: any[], language: any) => {
    try {
      const fullText = processedTranscript.map((s: any) => s.transliteration || s.hebrew || s.text || '').join(' ');
      if (!fullText.trim()) return;
      const lang = language || userProfile?.language || 'hebrew';
      const langCap = lang.charAt(0).toUpperCase() + lang.slice(1);
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Extract 8-12 important vocabulary words from this ${langCap} learning transcript. Only meaningful content words (nouns, verbs, adjectives). Transcript: "${fullText.slice(0, 3000)}". Return JSON with a "words" array, each item: { phonetic: Latin transliteration, translation: English meaning (1-4 words), hebrew: native script }.`,
        response_json_schema: {
          type: 'object',
          properties: {
            words: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  phonetic: { type: 'string' },
                  translation: { type: 'string' },
                  hebrew: { type: 'string' }
                }
              }
            }
          }
        }
      });
      const words = result?.words || [];
      if (words.length > 0) {
        await base44.entities.MediaLibrary.update(videoId, { session_vocab_words: words });
        queryClient.invalidateQueries({ queryKey: ['mediaLibrary'] });
      }
    } catch (e) {
      console.error('Failed to extract vocab words:', e);
    }
  };

  const saveTranscriptEdit = async (segmentIdx: number, field: string, value: any) => {
    if (!selectedVideo) return;
    setTranscript(prev => {
      const updatedTranscript = prev.map((seg, i) =>
        i === segmentIdx ? { ...seg, [field]: value } : seg
      );
      // Save to DB using the latest transcript
      updateVideoMutation.mutate({
        id: selectedVideo.id,
        data: { processed_transcript: updatedTranscript }
      });
      return updatedTranscript;
    });
  };

  // Bulk variant used by the reader's self-repair pass (nikud + translit
  // restoration): apply many segment patches in ONE state update and ONE DB
  // write, instead of a mutation per field.
  const saveTranscriptBulk = async (patches: { idx: number; fields: Record<string, any> }[]) => {
    if (!selectedVideo || !patches?.length) return;
    setTranscript(prev => {
      const byIdx = new Map(patches.map(p => [p.idx, p.fields]));
      const updatedTranscript = prev.map((seg, i) => (byIdx.has(i) ? { ...seg, ...byIdx.get(i) } : seg));
      updateVideoMutation.mutate({
        id: selectedVideo.id,
        data: { processed_transcript: updatedTranscript }
      });
      return updatedTranscript;
    });
  };

  const deleteTranscriptSegment = async (segmentIdx: number) => {
    if (!selectedVideo) return;
    const updatedTranscript = transcript.filter((_, i) => i !== segmentIdx);
    setTranscript(updatedTranscript);
    await updateVideoMutation.mutateAsync({
      id: selectedVideo.id,
      data: { processed_transcript: updatedTranscript }
    });
  };

  const toggleApproval = async (segmentIdx: number) => {
    if (!selectedVideo) return;
    const updatedTranscript = [...transcript];
    updatedTranscript[segmentIdx] = {
      ...updatedTranscript[segmentIdx],
      approved: !updatedTranscript[segmentIdx].approved
    };
    setTranscript(updatedTranscript);

    await updateVideoMutation.mutateAsync({
      id: selectedVideo.id,
      data: { processed_transcript: updatedTranscript }
    });
  };

  const deleteSegment = async (segmentIdx: number) => {
    if (!selectedVideo || !confirm("Delete this segment?")) return;
    const updatedTranscript = transcript.filter((_, idx) => idx !== segmentIdx);
    setTranscript(updatedTranscript);

    await updateVideoMutation.mutateAsync({
      id: selectedVideo.id,
      data: { processed_transcript: updatedTranscript }
    });
    toast.success("Segment deleted");
  };

  const deleteVideoMutation = useMutation({
    mutationFn: (id: any) => base44.entities.MediaLibrary.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mediaLibrary'] });
      toast.success("Video deleted from library");
    },
  });

  const addToLibraryMutation = useMutation({
    mutationFn: async (video: any) => {
      const videoId = video.youtube_id || video.youtube_video_id || extractYouTubeId(video.video_url || `https://youtube.com/watch?v=${video.youtube_id}`);
      return base44.entities.MediaLibrary.create({
        title: video.title,
        language: userProfile?.language || "hebrew",
        video_url: `https://www.youtube.com/watch?v=${videoId}`,
        video_id: videoId,
        topics: [],
        difficulty_level: "All",
        tags: video.tags || video.channel || "",
        is_active: true,
        thumbnail_url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        notes: ""
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mediaLibrary'] });
      toast.success("Added to library!");
    },
  });

  const assignVideoMutation = useMutation({
    mutationFn: (data: any) => base44.entities.UserProgram.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userPrograms'] });
      queryClient.invalidateQueries({ queryKey: ['myProgram'] });
      toast.success("Video assigned!");
    },
  });

  const extractYouTubeId = (url: string) => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /youtube\.com\/shorts\/([^&\n?#]+)/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  };

  const fetchYouTubeMetadata = async (url: string) => {
    const videoId = extractYouTubeId(url);
    if (!videoId) {
      toast.error("Invalid YouTube URL");
      return;
    }

    setFormData((prev: any) => ({ ...prev, video_id: videoId }));

    try {
      const response = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
      const data = await response.json();

      const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

      // Get video duration and detect language/topics using LLM
      const analysisResult = await base44.integrations.Core.InvokeLLM({
        prompt: `Analyze this YouTube video with URL: ${url}

    1. Detect the PRIMARY language of the video (return one of: hebrew, english, spanish, french, portuguese, italian)
    2. Suggest 2-4 relevant topics from this list: Religion / Spirituality, Sports / Fitness, Cooking / Food, Nutrition, Health / Wellness, Meditation / Mindfulness, Music, Travel, Culture, Education / Learning, Business / Career, Personal Growth, Relationships, News / Current Events
    3. CRITICAL: Find the exact video duration/length and return it in MINUTES as a decimal number (e.g., 2.5 for 2 minutes 30 seconds, NOT seconds)

    Return JSON only.`,
        add_context_from_internet: true,
        response_json_schema: {
          type: "object",
          properties: {
            language: { type: "string" },
            topics: { type: "array", items: { type: "string" } },
            duration_minutes: { type: "number" }
          }
        }
      });

      setFormData((prev: any) => ({
        ...prev,
        title: prev.title || data.title || "",
        thumbnail_url: thumbnailUrl,
        language: analysisResult.language || prev.language,
        topics: analysisResult.topics || [],
        duration_minutes: analysisResult.duration_minutes || ""
      }));

      toast.success("Video info loaded!");
    } catch (e) {
      toast.error("Could not fetch video details");
    }
  };

  const resetForm = () => {
    setFormData({
      title: "",
      language: "hebrew",
      video_url: "",
      video_id: "",
      topics: [],
      difficulty_level: "All",
      duration_minutes: "",
      tags: "",
      accent_region: "",
      is_active: true,
      thumbnail_url: "",
      notes: "",
      default_day: "",
      transcript_phonetics: "",
      assign_to_user: "",
      assigned_users: [],
    });
  };

  // Create/update a video in the user's own personal collection. Students
  // route here (the master library is admin-write-only); the row lands in
  // the admin's approval queue automatically because org admins can read
  // every student's user_saved_video rows.
  const handleSubmitPersonalAsync = async (formData: any, editingVideo: any) => {
    let videoId = formData.video_id;
    if (!videoId && formData.video_url) {
      videoId = extractYouTubeId(formData.video_url) || undefined;
    }
    const data = {
      title: formData.title,
      language: formData.language || userProfile?.language || 'hebrew',
      video_url: formData.video_url,
      video_id: videoId,
      topics: formData.topics || [],
      difficulty_level: formData.difficulty_level || 'All',
      duration_minutes: formData.duration_minutes ? parseFloat(formData.duration_minutes) : null,
      tags: formData.tags || '',
      thumbnail_url: formData.thumbnail_url || '',
      notes: formData.notes || '',
    };
    try {
      if (editingVideo) {
        await updateVideoMutation.mutateAsync({ id: editingVideo.id, data, entity: base44.entities.UserSavedVideo });
        queryClient.invalidateQueries({ queryKey: ['userSavedVideos'] });
      } else {
        await createSavedVideoMutation.mutateAsync(data);
      }
    } catch (e) {
      // onError already toasted.
    }
  };

  const handleSubmit = () => {
    if (!formData.title) {
      toast.error("Title is required");
      return;
    }
    if (!editingVideo && !formData.video_url && !formData.video_id) {
      toast.error("Please add a video URL or upload an audio file first");
      return;
    }

    // Close dialog immediately before any async work
    setShowAddDialog(false);

    // Personal rows: creation by non-admins, and edits of rows that came
    // from the personal collection (regardless of who edits — admins fix a
    // student's submission in place).
    if ((!editingVideo && !canEdit) || editingVideo?._source === 'personal') {
      handleSubmitPersonalAsync(formData, editingVideo);
      setEditingVideo(null);
      resetForm();
      return;
    }

    handleSubmitAsync(formData, editingVideo);
    setEditingVideo(null);
    resetForm();
  };

  const handleSubmitAsync = async (formData: any, editingVideo: any) => {

    // Auto-extract video_id from URL if missing
    if (!formData.video_id && formData.video_url) {
      const extracted = extractYouTubeId(formData.video_url);
      if (extracted) {
        setFormData((prev: any) => ({ ...prev, video_id: extracted }));
        formData.video_id = extracted;
      }
    }

    let processedTranscript: any = undefined;

    // Process transcript only if new phonetics provided
    if (formData.transcript_phonetics && formData.transcript_phonetics.trim()) {
      toast.info("Processing transcript...");
      try {
        const targetLang = formData.language || userProfile?.language || 'spanish';
        const targetLangCap = targetLang.charAt(0).toUpperCase() + targetLang.slice(1);
        const result = await base44.integrations.Core.InvokeLLM({
          prompt: `You are processing a transcript for a language learning app. The TARGET language of this video is ${targetLangCap}.

Input transcript (may be in ${targetLangCap}, English, or phonetic form):
"${formData.transcript_phonetics}"

For each sentence/line:
1. Detect the input language automatically.
2. "transliteration": the sentence in ${targetLangCap} (native script). If input is already in ${targetLangCap}, keep it. If input is in English or phonetics, convert/translate to ${targetLangCap}.
3. "english": the English translation of the sentence.
4. "text": the original input line (keep as-is).
5. "start": estimated timestamp in seconds (starting at 0, ~5-8 seconds per sentence).

Keep natural sentence breaks. Return a JSON object with a "transcript" array.`,
          response_json_schema: {
            type: "object",
            properties: {
              transcript: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    text: { type: "string" },
                    transliteration: { type: "string" },
                    english: { type: "string" },
                    start: { type: "number" }
                  }
                }
              }
            }
          }
        });
        processedTranscript = result.transcript;
        toast.success("Transcript processed!");
      } catch (e) {
        toast.error("Failed to process transcript");
      }
    }

    const data: any = {
      ...formData,
      duration_minutes: formData.duration_minutes ? parseFloat(formData.duration_minutes) : null,
      default_day: formData.default_day ? parseInt(formData.default_day) : null,
    };

    // If new transcript was processed, replace the old one entirely (clear then set)
    if (processedTranscript !== undefined) {
      data.processed_transcript = processedTranscript;
    }

    // If a default_day is set, inject/update a video task into that Day's subsections for ALL users
    if (formData.default_day) {
      const dayNum = parseInt(formData.default_day);
      const dayLang = data.language || formData.language;
      // Count the writes that actually landed. Day.update() resolves to null when
      // RLS blocks the write (zero rows updated, no error thrown) — e.g. an org
      // member who isn't an admin. Without this we'd report a schedule change
      // that never happened.
      let scheduledDays = 0;
      try {
        const matchingDays = await base44.entities.Day.filter({ day_number: dayNum, language: dayLang });
        for (const day of matchingDays) {
          const subsections = day.subsections || [];
          const videoTaskId = `video_${data.video_id || formData.video_id}`;
          const existingIdx = subsections.findIndex((s: any) => s.id === videoTaskId || s.video_id === (data.video_id || formData.video_id));
          const videoTask = {
            id: videoTaskId,
            name: `Watch: ${data.title || formData.title}`,
            duration: data.duration_minutes ? `${data.duration_minutes} min` : "",
            page: "MediaLibrary",
            video_id: data.video_id || formData.video_id,
          };
          let updatedSubsections;
          if (existingIdx >= 0) {
            updatedSubsections = subsections.map((s: any, i: number) => i === existingIdx ? videoTask : s);
          } else {
            // Remove generic "Watch a video" task (id: "video") since we now have a specific one
            const withoutGeneric = subsections.filter((s: any) => s.id !== 'video');
            updatedSubsections = [videoTask, ...withoutGeneric];
          }
          const updated = await base44.entities.Day.update(day.id, { subsections: updatedSubsections });
          if (updated) scheduledDays++;
        }

        if (matchingDays.length === 0) {
          toast.error(`Day ${dayNum} doesn't exist for ${languageLabel(dayLang)}. The video was saved to the library, but not added to any schedule.`);
        } else if (scheduledDays === 0) {
          toast.error(`Couldn't add the video to Day ${dayNum} — you don't have permission to edit the schedule. The video was saved to the library.`);
        } else {
          toast.success(`Video added to Day ${dayNum} schedule!`);
        }

        // Auto-extract vocab from transcript and tag it with this session.
        // Only when the video really landed on the session — otherwise we'd
        // tag words with a "Session N" that has no video attached.
        if (scheduledDays > 0 && (processedTranscript?.length || data.processed_transcript?.length)) {
          const transcriptToUse = processedTranscript || data.processed_transcript;
          const sessionLabel = `Session ${dayNum}`;
          const fullText = transcriptToUse.map((s: any) => s.transliteration || s.text).join(' ');
          const lang = data.language || userProfile?.language || 'spanish';
          const langCap = lang.charAt(0).toUpperCase() + lang.slice(1);
          try {
            const vocabResult = await base44.integrations.Core.InvokeLLM({
              prompt: `Extract the 10-15 most important vocabulary words from this ${langCap} learning transcript. Transcript: "${fullText.slice(0, 3000)}". Only meaningful content words (nouns, verbs, adjectives). For each word: the word in ${langCap}, its phonetic (Latin spelling if needed, else same word), and English translation.`,
              response_json_schema: { type: "object", properties: { words: { type: "array", items: { type: "object", properties: { word: { type: "string" }, phonetic: { type: "string" }, translation: { type: "string" } } } } } }
            });
            for (const w of (vocabResult.words || [])) {
              if (!w.word || !w.translation) continue;
              const phonetic = w.phonetic || w.word;
              const existing = await base44.entities.Word.filter({ phonetic, created_by: currentUser?.email });
              if (existing.length === 0) {
                await base44.entities.Word.create({
                  word: w.word,
                  translation: w.translation,
                  phonetic,
                  category: "wordbank",
                  times_practiced: 0,
                  mastered: false,
                  vocab_level: 0,
                  example_sentence: sessionLabel,
                });
              }
            }
            toast.success(`Vocab auto-populated for ${sessionLabel}!`);
          } catch (e) {
            console.error("Failed to auto-extract vocab:", e);
          }
        }
      } catch (e) {
        console.error("Failed to update day schedule:", e);
        toast.error(`Couldn't add the video to Day ${dayNum}'s schedule. The video was saved to the library.`);
      }
    }

    if (editingVideo) {
      try {
        await updateVideoMutation.mutateAsync({ id: editingVideo.id, data });
      } catch (e) {
        // onError already logged + toasted; bail so we don't run vocab extraction
        // on a save that never persisted (user must not think the edit succeeded).
        return;
      }
      // If a transcript was just processed, extract vocab words
      if (processedTranscript?.length) {
        extractAndStoreVocabWords(editingVideo.id, processedTranscript, data.language);
      }
    } else {
      let created;
      try {
        created = await base44.entities.MediaLibrary.create(data);
      } catch (e: any) {
        const detail = [e?.message, e?.details, e?.hint, e?.code].filter(Boolean).join(' | ');
        console.error('MediaLibrary.create FAILED →', detail || e, '| payload:', JSON.stringify(data));
        toast.error(`No se pudo guardar: ${detail || 'ver consola'}`);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['mediaLibrary'] });
      toast.success("Added to library!");
      // Assign to multiple users with their individual session numbers
      const assignedUsers = formData.assigned_users || [];
      // Sessions we were asked to put the video on but couldn't (missing day row,
      // or a Day.update() that RLS silently turned into a no-op). Reported below
      // so an assignment never looks more complete than it is.
      const unscheduled: string[] = [];
      for (const au of assignedUsers) {
        if (!au.email) continue;
        await base44.entities.UserProgram.create({
          user_email: au.email,
          media_library_id: created.id,
          assigned_by: currentUser?.email,
          assigned_at: new Date().toISOString(),
          order: au.session ? parseInt(au.session) : 0,
        });
        // Also inject into the user's specific session day if session # provided
        if (au.session) {
          const sessionNum = parseInt(au.session);
          const matchingDays = await base44.entities.Day.filter({ day_number: sessionNum, language: data.language || formData.language });
          if (matchingDays.length === 0) {
            unscheduled.push(`Day ${sessionNum} (doesn't exist)`);
          }
          for (const day of matchingDays) {
            const subsections = day.subsections || [];
            const videoTaskId = `video_${data.video_id}`;
            if (subsections.find((s: any) => s.id === videoTaskId)) continue;
            const updated = await base44.entities.Day.update(day.id, {
              subsections: [...subsections, { id: videoTaskId, name: `▶ ${data.title}`, video_id: data.video_id, page: "MediaLibrary" }]
            });
            if (!updated) unscheduled.push(`Day ${sessionNum} (no permission)`);
          }
        }
      }
      if (assignedUsers.length > 0) toast.success(`Assigned to ${assignedUsers.length} user(s)!`);
      if (unscheduled.length > 0) {
        const detail = unscheduled.filter((s, i) => unscheduled.indexOf(s) === i).join(", ");
        toast.error(`Assigned, but not added to the schedule: ${detail}.`);
      }
    }
  };

  const handleEdit = (video: any) => {
    setEditingVideo(video);
    setMediaType(video.video_url?.endsWith('.mp3') || video.video_url?.includes('audio') ? "audio" : "video");
    setFormData({
      title: video.title,
      language: video.language,
      video_url: video.video_url,
      video_id: video.video_id,
      topics: video.topics || [],
      difficulty_level: video.difficulty_level || "All",
      duration_minutes: video.duration_minutes || "",
      tags: video.tags || "",
      accent_region: video.accent_region || "",
      is_active: video.is_active !== false,
      thumbnail_url: video.thumbnail_url || "",
      notes: video.notes || "",
      default_day: video.default_day || "",
      transcript_phonetics: video.transcript_phonetics || ""
    });
    setShowAddDialog(true);
  };

  const handleAudioUpload = async (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.includes('audio') && !file.name.endsWith('.mp3')) {
      toast.error("Please upload an MP3 audio file");
      return;
    }

    setUploadingAudio(true);
    try {
      const result = await base44.integrations.Core.UploadFile({ file });
      setFormData((prev: any) => ({
        ...prev,
        video_url: result.file_url,
        video_id: `audio_${Date.now()}`,
        thumbnail_url: ""
      }));
      toast.success("Audio uploaded!");
    } catch (e) {
      toast.error("Failed to upload audio");
    } finally {
      setUploadingAudio(false);
    }
  };



  const toggleTopic = (topic: string) => {
    setFormData((prev: any) => ({
      ...prev,
      topics: prev.topics.includes(topic)
        ? prev.topics.filter((t: string) => t !== topic)
        : [...prev.topics, topic]
    }));
  };

  // Master library + the current user's OWN personal videos, tagged with
  // _source so the card/detail code knows the write target (entity routing,
  // delete permission). Other students' rows an admin can read belong in the
  // approval queue below, not in their main grid.
  const combinedVideos = [
    ...videos.map((v: any) => ({ ...v, _source: 'catalog' })),
    ...savedVideos
      .filter((v: any) => v.created_by === currentUser?.email)
      .map((v: any) => ({ ...v, _source: 'personal' })),
  ];

  // A student's videos awaiting admin review (admin RLS returns all rows).
  const pendingStudentVideos = savedVideos.filter((v: any) => v.created_by !== currentUser?.email);

  const filteredVideos = combinedVideos.filter((video: any) => {
    const matchesSearch = video.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (video.tags || "").toLowerCase().includes(searchTerm.toLowerCase());
    const userLang = userProfile?.language;
    // "all" means all — don't quietly fall back to the profile language.
    // An empty filter (profile still loading) falls back to it.
    const effectiveLangFilter = filterLanguage === "all" ? "" : (filterLanguage || userLang);
    const matchesLanguage = !effectiveLangFilter || video.language === effectiveLangFilter;
    const matchesDifficulty = filterDifficulty.length === 0 || filterDifficulty.includes(video.difficulty_level);
    const matchesTopic = filterTopics.length === 0 || filterTopics.some((t: string) => (video.topics || []).includes(t));
    return matchesSearch && matchesLanguage && matchesDifficulty && matchesTopic && video.is_active !== false;
  }).sort((a: any, b: any) => {
    // Extract day numbers from titles (e.g., "day 1", "Day 2", etc.)
    const dayRegex = /day\s*(\d+)/i;
    const aDayMatch = a.title.match(dayRegex);
    const bDayMatch = b.title.match(dayRegex);

    if (aDayMatch && bDayMatch) {
      return parseInt(aDayMatch[1]) - parseInt(bDayMatch[1]);
    }
    if (aDayMatch) return -1;
    if (bDayMatch) return 1;

    return a.title.localeCompare(b.title);
  });

  // Master-library writes are admin-only (matches media_library RLS — a
  // non-admin's edit/delete would silently affect 0 rows). Students manage
  // their own personal videos instead; see canModifyVideo.
  const canEdit = currentUser?.role === 'admin';
  const canDelete = currentUser?.role === 'admin';
  const canAssign = currentUser?.role === 'admin' || currentUser?.role === 'coach';
  // Per-card permission: admins everything; owners their personal videos.
  const canModifyVideo = (video: any) =>
    canEdit || (video?._source === 'personal' && video?.created_by === currentUser?.email);

  const myVideos = myProgram.map((prog: any) => {
    const video = videos.find((v: any) => v.id === prog.media_library_id);
    return video ? { ...video, programId: prog.id, completed: prog.completed } : null;
  }).filter(Boolean);

  const buildTranscriptPrompt = (batch: any[], detectedLang: string, userLang: string) => {
    const isEnglishSource = detectedLang === 'english';
    const targetLang = userLang || 'spanish';
    const targetLangCap = targetLang.charAt(0).toUpperCase() + targetLang.slice(1);

    if (isEnglishSource) {
      return `These are English sentences. Translate each to ${targetLangCap}. Return exactly ${batch.length} segments.

${batch.map((s, idx) => `[${idx + 1}] "${s.text}"`).join('\n')}

For each segment:
- transliteration: the original English text
- english: ${targetLangCap} translation of the sentence`;
    } else {
      // Non-English source → three fields per segment: a Latin-letter
      // phonetic transliteration, an English translation, and the original
      // native-script sentence (with nikud for Hebrew). Describe the source
      // as the DETECTED language, not the user's profile language: a Hebrew
      // transcript enriched while the profile said "french" used to tell the
      // LLM "these are French sentences" — so it translated the Hebrew into
      // French instead of keeping it.
      const srcLang = detectedLang || targetLang;
      const srcLangCap = srcLang.charAt(0).toUpperCase() + srcLang.slice(1);
      const nikudHint = srcLang === 'hebrew' ? ' with nikud (vowel points) added' : '';
      return `These are ${srcLangCap} sentences. Return exactly ${batch.length} segments. Do NOT translate the original sentences into any language other than English.

${batch.map((s, idx) => `[${idx + 1}] "${s.text}"`).join('\n')}

For each segment:
- transliteration: phonetic transliteration of the sentence in Latin letters${srcLang === 'hebrew' ? ', following modern Israeli pronunciation, punctuation matching the original' : ''}
- english: English translation of the sentence
- hebrew: the original ${srcLangCap} sentence in its native script${nikudHint}`;
    }
  };

  const detectTranscriptLanguage = async (sampleText: string) => {
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `Detect the language of this text. Return only one word: english, spanish, hebrew, french, portuguese, or italian.\n\nText: "${sampleText.slice(0, 300)}"`,
    });
    return result.trim().toLowerCase().replace(/[^a-z]/g, '');
  };

  const processManualTranscript = async (video: any, text: string) => {
    if (!text || !text.trim()) {
      toast.error("Please paste a transcript");
      return;
    }

    setLoadingTranscript(true);
    toast.info("Processing transcript...");

    try {
      // Try to parse [timestamp] text format first (YouTube transcript format)
      const timestampLineRegex = /\[(\d+):(\d+)\]\s*(.+)/g;
      const timestampMatches = [...text.matchAll(timestampLineRegex)];

      let rawSegments;
      if (timestampMatches.length > 0) {
        rawSegments = timestampMatches.map(match => ({
          text: match[3].trim(),
          start: parseInt(match[1]) * 60 + parseInt(match[2]),
          duration: 5
        }));
      } else {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        rawSegments = lines.map((line, idx) => ({
          text: line,
          start: idx * 5,
          duration: 5
        }));
      }

      // Detect language of transcript
      const detectedLang = await detectTranscriptLanguage(rawSegments.slice(0, 3).map(s => s.text).join(' '));
      const userLang = userProfile?.language || video.language || 'spanish';
      toast.info(`Detected: ${detectedLang} → translating...`);

      // Process with AI
      const processedSegments: any[] = [];
      const batchSize = 5;

      for (let i = 0; i < rawSegments.length; i += batchSize) {
        const batch = rawSegments.slice(i, i + batchSize);

        try {
          const llmResult = await base44.integrations.Core.InvokeLLM({
            prompt: buildTranscriptPrompt(batch, detectedLang, userLang),
            response_json_schema: {
              type: "object",
              properties: {
                segments: {
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

          batch.forEach((segment, idx) => {
            const processed = llmResult.segments?.[idx] || {};
            processedSegments.push({
              text: segment.text,
              transliteration: processed.transliteration || segment.text,
              english: processed.english || '',
              // Native-script row: the LLM's (nikud-added) version, falling
              // back to the raw ASR text for non-English sources so the row
              // never goes missing.
              hebrew: processed.hebrew || (detectedLang !== 'english' ? segment.text : ''),
              start: segment.start
            });
          });

          toast.info(`${Math.min(i + batchSize, rawSegments.length)} / ${rawSegments.length} done`);
        } catch (e) {
          console.error('Batch error:', e);
          batch.forEach(segment => processedSegments.push({ ...segment, transliteration: segment.text, english: '' }));
        }
      }

      await updateVideoMutation.mutateAsync({
        id: video.id,
        data: { processed_transcript: processedSegments },
        entity: getVideoEntity(video)
      });

      setTranscript(processedSegments);
      setPastedTranscript("");
      toast.success("Transcript processed!");
      // Auto-extract vocab words for session flashcards
      extractAndStoreVocabWords(video.id, processedSegments, video.language);
    } catch (e: any) {
      console.error('Error:', e);
      toast.error(e.message || "Failed to process");
    } finally {
      setLoadingTranscript(false);
    }
  };

  const generateTranscriptFromYouTube = async (video: any) => {
    let statusToast: any;
    try {
      const videoId = video.video_id || video.youtube_video_id || extractYouTubeId(video.video_url);
      console.log('Starting transcript generation for video ID:', videoId);

      if (!videoId) {
        toast.error("Could not extract video ID");
        return;
      }

      setLoadingTranscript(true);

      // Show initial status
      statusToast = toast.loading("Step 1/5: Fetching YouTube data...", { duration: Infinity });

      try {
        // Fetch YouTube captions with timeout. 3 min: when the video has no
        // usable captions in the target language the function AI-transcribes
        // the audio, which takes longer than a caption fetch.
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout after 180 seconds')), 180000)
        );

        // Provider-agnostic transcription (lib/transcription). YouTube ids are
        // transcribed from the actual audio in the target language, sidestepping
        // the wrong-language (Arabic) auto-caption tracks. Wrap the result as
        // { data } so the downstream `result.data.*` reads are unchanged.
        const resultPromise = transcribeMediaSource(
          youtubeSource(videoId),
          { language: video.language || userProfile?.language || '' },
        ).then((data: any) => ({ data }));
        const result: any = await Promise.race([resultPromise, timeoutPromise]);

        console.log('Function response:', result);

        if (!result || !result.data) {
          toast.dismiss(statusToast);
          toast.error("No response from transcription service");
          setLoadingTranscript(false);
          return;
        }

        // Show step progress
        if (result.data.steps) {
          const stepLabels: any = {
            'page_fetched': 'Step 2/5: Extracting audio stream...',
            'audio_extracted': 'Step 3/5: Downloading audio...',
            'audio_downloaded': 'Step 4/5: Transcribing with AI...',
            'whisper_transcribed': 'Step 5/5: Processing transcript...',
            'complete': 'Complete!'
          };
          toast.dismiss(statusToast);
          toast.success(`Complete in ${result.data.processingTime}s!`);
        }

        if (!result.data.transcript || result.data.transcript.length === 0) {
          toast.dismiss(statusToast);
          const errorMsg = result.data.error || "No transcript available";
          toast.error(errorMsg, {
            duration: 6000,
            description: result.data.details ? "Check browser console for details" : undefined
          });
          if (result.data.details) {
            console.error("Transcript error details:", result.data.details);
          }
          setLoadingTranscript(false);
          return;
        }

        toast.dismiss(statusToast);
        const rawTranscript = result.data.transcript;

        // Show the synced (karaoke) transcript IMMEDIATELY from the raw
        // timestamped lines, so it syncs with the video right away instead of
        // waiting ~2 min for translations. The enrichment loop below overwrites
        // these lines with transliteration + English when ready.
        const rawSegments = rawTranscript.map((s: any) => ({
          text: s.text,
          transliteration: s.text,
          english: '',
          // Raw ASR text doubles as the native-script row until enrichment
          // replaces it (and adds a real Latin transliteration).
          hebrew: s.text,
          start: s.start,
        }));
        setTranscript(rawSegments);
        setLoadingTranscript(false);
        // Mark background translation as running so ContinuousTranscript holds off
        // its auto-generate-Hebrew pass until the transcript settles (bug #31).
        setTranslationInProgress(true);
        try {
          await updateVideoMutation.mutateAsync({
            id: video.id,
            data: { processed_transcript: rawSegments },
            entity: getVideoEntity(video),
          });
        } catch (e) { console.error('Failed to save raw transcript', e); }
        toast.success(`Transcript loaded (${rawTranscript.length} lines)! Translating in background…`);

        toast.info(`Processing ${rawTranscript.length} segments...`);

        // Detect language
        const sampleText = rawTranscript.slice(0, 3).map((s: any) => s.text).join(' ');
        const detectedLang = await detectTranscriptLanguage(sampleText);
        const userLang = userProfile?.language || video.language || 'spanish';
        toast.info(`Detected: ${detectedLang} → translating...`);

      // Translate in PARALLEL batches (transliteration + English). Running the
      // batches concurrently with a larger batch size turns ~2 min of sequential
      // calls into a few seconds. `enriched` starts as the raw karaoke lines, so
      // any failed batch simply keeps the original text.
      const enriched = rawSegments.map((s: any) => ({ ...s }));
      const batchSize = 20;
      let doneCount = 0;

      const batchPromises = [];
      for (let i = 0; i < rawTranscript.length; i += batchSize) {
        const startIdx = i;
        const batch = rawTranscript.slice(i, i + batchSize);
        batchPromises.push(
          base44.integrations.Core.InvokeLLM({
            prompt: buildTranscriptPrompt(batch, detectedLang, userLang),
            response_json_schema: {
              type: "object",
              properties: {
                segments: {
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
          })
            .then((llmResult: any) => {
              batch.forEach((segment: any, idx: number) => {
                const processed = llmResult.segments?.[idx] || {};
                enriched[startIdx + idx] = {
                  text: segment.text,
                  transliteration: processed.transliteration || segment.text,
                  english: processed.english || '',
                  // Native-script row (nikud-added for Hebrew); raw ASR text
                  // as fallback so the row never goes missing.
                  hebrew: processed.hebrew || (detectedLang !== 'english' ? segment.text : ''),
                  start: segment.start
                };
              });
            })
            .catch((e: any) => { console.error('Batch translate error:', e); })
            .finally(() => {
              doneCount += batch.length;
              setTranscript([...enriched]); // progressive update as batches finish
              toast.info(`${Math.min(doneCount, rawTranscript.length)} / ${rawTranscript.length} translated`);
            })
        );
      }

      await Promise.all(batchPromises);

      // Save the enriched transcript.
      await updateVideoMutation.mutateAsync({
        id: video.id,
        data: { processed_transcript: enriched },
        entity: getVideoEntity(video)
      });

      setTranscript(enriched);
      setTranslationInProgress(false);
      toast.success("Translations ready! ✅");
      // Auto-extract vocab words for session flashcards
      extractAndStoreVocabWords(video.id, enriched, video.language);
      } catch (timeoutError) {
        toast.dismiss(statusToast);
        console.error('Timeout or fetch error:', timeoutError);
        toast.error("Request timeout - this video may be too long or restricted", {
          duration: 8000,
          description: "Try pasting the transcript manually or use a shorter video"
        });
        setLoadingTranscript(false);
      }
      } catch (e: any) {
      console.error('Full error:', e);
      toast.error(e.message || "Failed to generate transcript", {
        duration: 6000,
        description: "Check console for details or try manual paste"
      });
      console.error("Error details:", e);
      } finally {
      setLoadingTranscript(false);
      setTranslationInProgress(false);
      }
      };

  const handleVideoClick = async (video: any) => {
    setSelectedVideo(video);
    setShowTranscript(true);
    setTranscript([]);
    setLoadingTranscript(true);
    // Destroy any previously-created player before swapping videos (bug #32).
    try { videoPlayerRef.current?.destroy?.(); } catch (e) {}
    videoPlayerRef.current = null;
    setVideoPlayer(null);
    setVideoEnded(false);

    const videoId = video.video_id || video.youtube_video_id || extractYouTubeId(video.video_url);

    if (!videoId) {
      toast.error("Could not extract video ID");
      setLoadingTranscript(false);
      return;
    }

    const initPlayer = () => {
      const w: any = window;
      const container = document.getElementById('youtube-player');
      // The transcript view may have been closed before the API loaded.
      if (!container) return;
      // Tear down any prior player before re-creating (bug #32).
      try { videoPlayerRef.current?.destroy?.(); } catch (e) {}
      container.innerHTML = '';
      videoPlayerRef.current = new w.YT.Player('youtube-player', {
        videoId,
        playerVars: { enablejsapi: 1, autoplay: 0, controls: 1 },
        events: {
          onReady: (event: any) => { videoPlayerRef.current = event.target; setVideoPlayer(event.target); },
          onStateChange: (event: any) => {
            if (event.data === 0) {
              setVideoEnded(true);
            }
          }
        }
      });
    };

    // Use the shared, memoized API loader so concurrent components don't stomp
    // each other's onYouTubeIframeAPIReady (bug #33).
    loadYouTubeApi().then(() => initPlayer());

    // Always fetch fresh from DB (to get latest transcript after updates).
    // Personal videos re-read their OWN row — swapping in a catalog row here
    // would lose _source and route later transcript saves to the wrong table.
    try {
      if (video._source === 'personal') {
        const fresh = await base44.entities.UserSavedVideo.get(video.id);
        if (fresh?.processed_transcript?.length > 0) {
          setTranscript(fresh.processed_transcript);
          setSelectedVideo({ ...fresh, _source: 'personal' });
          setLoadingTranscript(false);
          return;
        }
      } else {
        const saved = await base44.entities.MediaLibrary.filter({ video_id: videoId });
        // Pick the one with most recent update or most segments
        const savedVideo = saved.sort((a: any, b: any) =>
          (b.processed_transcript?.length || 0) - (a.processed_transcript?.length || 0)
        )[0];
        if (savedVideo?.processed_transcript?.length > 0) {
          setTranscript(savedVideo.processed_transcript);
          setSelectedVideo({ ...savedVideo, _source: 'catalog' });
          setLoadingTranscript(false);
          return;
        }
      }
    } catch (e) {}

    // Fall back to passed video's transcript
    if (video.processed_transcript && video.processed_transcript.length > 0) {
      setTranscript(video.processed_transcript);
      setLoadingTranscript(false);
      return;
    }

    // No saved transcript found — auto-generate from YouTube
    generateTranscriptFromYouTube(video);
  };

  const extractVocabFromTranscript = async (video: any, transcriptSegments: any[]) => {
    if (!transcriptSegments?.length) { toast.error("No transcript to extract from"); return; }
    setExtractingVocab(true);
    try {
      const sessionLabel = video.notes?.match(/Session \d+/)?.[0] || (video.default_day ? `Session ${video.default_day}` : video.title);
      const lang = video.language || userProfile?.language || 'spanish';
      const langCap = lang.charAt(0).toUpperCase() + lang.slice(1);

      // Build sentence mapping: word -> list of sentences it appears in (from transcript)
      const wordToSentences: any = {};
      for (const segment of transcriptSegments) {
        const sentence = segment.transliteration || segment.text || segment.english || '';
        if (!sentence.trim()) continue;
        const words = sentence.split(/\s+/).map((w: string) => w.toLowerCase().replace(/[.,!?;:]/g, ''));
        for (const word of words) {
          if (!word) continue;
          if (!wordToSentences[word]) wordToSentences[word] = [];
          if (!wordToSentences[word].includes(sentence)) wordToSentences[word].push(sentence);
        }
      }

      const fullText = transcriptSegments.map((s: any) => s.transliteration || s.text).join(' ');
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Extract the 10-15 most important vocabulary words from this ${langCap} learning transcript for a beginner. Transcript: "${fullText.slice(0, 3000)}". Only meaningful content words (nouns, verbs, adjectives). For each: the word in ${langCap}, phonetic (Latin spelling if needed, else the word itself), and English translation.`,
        response_json_schema: { type: "object", properties: { words: { type: "array", items: { type: "object", properties: { word: { type: "string" }, phonetic: { type: "string" }, translation: { type: "string" } } } } } }
      });

      let added = 0;
      for (const w of (result.words || [])) {
        if (!w.word || !w.translation) continue;
        const phonetic = w.phonetic || w.word;
        const existing = await base44.entities.Word.filter({ phonetic, created_by: currentUser?.email });

        // Find a sentence from the video that contains this word
        const wordKey = w.word.toLowerCase().replace(/[.,!?;:]/g, '');
        const exampleSentence = wordToSentences[wordKey]?.[0] || sessionLabel;

        if (existing.length === 0) {
          await base44.entities.Word.create({
            word: w.word,
            translation: w.translation,
            phonetic,
            category: "wordbank",
            times_practiced: 0,
            mastered: false,
            vocab_level: 0,
            example_sentence: exampleSentence
          });
          added++;
        }
      }
      toast.success(`Added ${added} key words from "${sessionLabel}" to your Backpack! 🎒`);
    } catch (e) { toast.error("Failed to extract vocab"); }
    setExtractingVocab(false);
  };

  const handleAddWordFromTranscript = async (word: string) => {
    const lang = selectedVideo?.language || userProfile?.language || 'hebrew';
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Translate this ${languageLabel(lang)} word to English: "${word}". Return only the English translation, nothing else.`
      });

      createWordMutation.mutate({
        word: word,
        translation: result,
        category: "wordbank",
        language: lang,
        times_practiced: 0,
        mastered: false,
        vocab_level: 0,
      });
    } catch (e) {
      toast.error("Translation failed");
    }
  };

  const handleSeekTo = async (seconds: number, shouldPlay = false) => {
    if (videoPlayer && videoPlayer.seekTo) {
      if (shouldPlay) {
        videoPlayer.seekTo(seconds, true);
        videoPlayer.playVideo();
      } else {
        videoPlayer.pauseVideo();
      }
    }
  };

  // Track current playback time
  useEffect(() => {
    if (!videoPlayer || !showTranscript) return;

    const interval = setInterval(async () => {
      try {
        const time = await videoPlayer.getCurrentTime?.();
        if (typeof time === 'number') {
          setCurrentTime(time);
        }
        const state = await videoPlayer.getPlayerState?.();
        setIsPlaying(state === 1); // 1 = playing
      } catch (e) {
        // Player not ready
      }
    }, 100); // Update every 100ms for smooth highlighting

    return () => clearInterval(interval);
  }, [videoPlayer, showTranscript]);

  // Destroy the YouTube player when the transcript view closes or the page
  // unmounts, so its internal timers/postMessage listeners don't leak (bug #32).
  useEffect(() => {
    if (showTranscript) return;
    try { videoPlayerRef.current?.destroy?.(); } catch (e) {}
    videoPlayerRef.current = null;
    setVideoPlayer(null);
  }, [showTranscript]);

  useEffect(() => {
    return () => {
      try { videoPlayerRef.current?.destroy?.(); } catch (e) {}
      videoPlayerRef.current = null;
    };
  }, []);

  // Space bar to play/pause video
  useEffect(() => {
    const handleKeyPress = async (e: any) => {
      if (e.code === 'Space' && videoPlayer && !e.target.matches('input, textarea')) {
        e.preventDefault();
        const playerState = await videoPlayer.getPlayerState?.();
        if (playerState === 1) {
          videoPlayer.pauseVideo();
        } else {
          videoPlayer.playVideo();
        }
      }
    };

    if (showTranscript) {
      window.addEventListener('keydown', handleKeyPress);
      return () => window.removeEventListener('keydown', handleKeyPress);
    }
  }, [videoPlayer, showTranscript]);

  const getThumbnailUrl = (video: any) => {
    // Try thumbnail_url first
    if (video.thumbnail_url && video.thumbnail_url.trim()) {
      return video.thumbnail_url;
    }

    let videoId = null;

    // Try stored video_id first
    if (video.video_id && video.video_id.trim()) {
      videoId = video.video_id;
    }
    // Try extracting from video_url
    else if (video.video_url && video.video_url.trim()) {
      videoId = extractYouTubeId(video.video_url);
    }
    // For Video entity with youtube_video_id
    else if (video.youtube_video_id && video.youtube_video_id.trim()) {
      videoId = video.youtube_video_id;
    }

    if (videoId) {
      return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    }

    return null;
  };

  const buttonConfigs: any = {
    videos: { label: "Videos", emoji: "📹" },
    songs: { label: "Songs", emoji: "🎵" },
    audio: { label: "Audio Training", emoji: "🎧" },
    backpack: { label: "Words Backpack", emoji: "🎒", submenu: ["allwords", "verbs", "corevocab"] }
  };

  const backpackSubmenuConfigs: any = {
    allwords: { label: "All words", emoji: "📝" },
    verbs: { label: "Verbs", emoji: "📖" },
    corevocab: { label: "Core Vocab", emoji: "📚" }
  };

  const fetchRecommendations = async () => {
    if (loadingRecommendations) return;
    // Recommend in the language the page is actually showing: the explicit
    // filter first, then the profile's learning language. Never guess — a
    // fallback here used to default to Spanish and recommend Spanish
    // channels to Hebrew learners while the profile was still loading.
    const lang = (filterLanguage && filterLanguage !== 'all' ? filterLanguage : userProfile?.language) || '';
    if (!lang) {
      toast.info("Still loading your language — try again in a second.");
      return;
    }
    // Cached recs are only valid for the language they were fetched for.
    if (recommendations.length > 0 && recommendationsLanguage === lang) return;
    setRecommendations([]);
    setRecommendationsLanguage(lang);
    setLoadingRecommendations(true);
    try {
      const existingVideoIds = new Set(filteredVideos.map((v: any) => v.video_id).filter(Boolean));

      const langCap = lang.charAt(0).toUpperCase() + lang.slice(1);

      const channelNames = [];
      for (const video of filteredVideos.slice(0, 3)) {
        if (!video.video_url) continue;
        try {
          const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(video.video_url)}&format=json`);
          const meta = await res.json();
          if (meta.author_name) channelNames.push(meta.author_name);
        } catch {}
      }

      const channelContext = channelNames.length > 0
        ? `The user already watches videos from these channels: ${channelNames.join(', ')}.`
        : '';

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Find 8 popular YouTube videos for learning ${langCap} as a beginner/intermediate student. ONLY recommend videos that teach the ${langCap} language — no other languages, even if the user's watched channels teach something else. ${channelContext}

Prioritize videos from the same channels if mentioned ONLY when they teach ${langCap}; otherwise use similar educational ${langCap} learning channels.
Focus on videos with high view counts and good educational value.

Return a JSON with a "videos" array. Each video must have:
- title: video title
- youtube_id: the exact YouTube video ID (11 characters)
- channel: channel name
- description: one sentence about what you learn`,
        add_context_from_internet: true,
        response_json_schema: {
          type: "object",
          properties: {
            videos: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  youtube_id: { type: "string" },
                  channel: { type: "string" },
                  description: { type: "string" }
                }
              }
            }
          }
        }
      });

      const newRecs = (result.videos || []).filter((v: any) => v.youtube_id && !existingVideoIds.has(v.youtube_id));
      setRecommendations(newRecs);
    } catch (e) {
      console.error('Failed to fetch recommendations', e);
    }
    setLoadingRecommendations(false);
  };

  const handleDragStart = (e: any, id: any) => {
    setDraggedButton(id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: any) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: any, targetId: any) => {
    e.preventDefault();
    if (!draggedButton || draggedButton === targetId) {
      setDraggedButton(null);
      return;
    }

    const newOrder = [...buttonOrder];
    const draggedIndex = newOrder.indexOf(draggedButton);
    const targetIndex = newOrder.indexOf(targetId);

    newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, draggedButton);

    setButtonOrder(newOrder);
    if (typeof window !== "undefined") {
      localStorage.setItem("mediaLibraryButtonOrder", JSON.stringify(newOrder));
    }
    setDraggedButton(null);
  };

  const handleDragEnd = () => {
    setDraggedButton(null);
  };

  return (
    <>
    <div className="min-h-screen">
      <div className="mx-auto w-full max-w-6xl pb-16">
        <div className="mb-8 pt-1">
          <h1 className="flex items-center gap-2.5 text-3xl font-bold tracking-tight text-white">
            <span>📚</span> Content Library
          </h1>
          <p className="mt-1.5 text-sm text-slate-400">Browse and manage videos, songs and audio for language practice.</p>
        </div>

        {/* Quick lessons — vocab lessons and songs that live inside the Library */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { href: "/learn/lessons/days-lesson", emoji: "📅", title: "Days of the Week", description: "Learn the days of the week and rate them 1-5." },
            { href: "/learn/lessons/months", emoji: "🗓️", title: "Months of the Year", description: "Learn the months and rate how well you know them." },
            { href: "/learn/songs", emoji: "🎵", title: "Songs", description: "Learn through music with lyric-by-lyric songs." },
          ].map((item) => (
            <NextLink
              key={item.href}
              href={item.href}
              className="group flex flex-col rounded-2xl border border-slate-800 bg-slate-900 p-5 transition hover:border-teal-700 hover:bg-slate-800/60"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-white">
                  <span className="mr-1.5">{item.emoji}</span>
                  {item.title}
                </h2>
                <ChevronDown className="h-5 w-5 -rotate-90 text-slate-600 transition group-hover:text-teal-400" />
              </div>
              <p className="mt-1 text-sm text-slate-400">{item.description}</p>
            </NextLink>
          ))}
        </div>

        {/* Unified filter bar */}
        <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <div className="flex flex-wrap items-center gap-3">

            {/* + Add New Content — admins add to the master library; every
                other user adds to their own personal collection (which also
                lands in the admin's approval queue). */}
            {currentUser && (
              <button
                onClick={() => { resetForm(); setEditingVideo(null); setMediaType("video"); setShowAddDialog(true); }}
                className="flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-teal-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-400"
              >
                <Plus className="h-4 w-4" /> {canEdit ? "Add New Content" : "Add Video"}
              </button>
            )}

            {/* Language */}
            <select
              value={filterLanguage}
              onChange={(e) => setFilterLanguage(e.target.value)}
              className="w-40 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:border-teal-500 focus:outline-none"
            >
              <option value="all" className="bg-slate-800">All Languages</option>
              <option value="hebrew" className="bg-slate-800">Hebrew</option>
              <option value="english" className="bg-slate-800">English</option>
              <option value="spanish" className="bg-slate-800">Spanish</option>
              <option value="french" className="bg-slate-800">French</option>
              <option value="portuguese" className="bg-slate-800">Portuguese</option>
              <option value="italian" className="bg-slate-800">Italian</option>
            </select>

            {/* Difficulty - multiselect */}
            <div className="relative group">
              <button
                className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-600"
              >
                {filterDifficulty.length === 0 ? 'All Levels' : `${filterDifficulty.length} Level${filterDifficulty.length > 1 ? 's' : ''}`}
                <ChevronDown className="h-3 w-3 text-slate-400" />
              </button>
              <div className="absolute top-full left-0 z-20 mt-1 hidden min-w-[160px] rounded-lg border border-slate-700 bg-slate-800 py-1 shadow-xl group-focus-within:block group-hover:block">
                <button
                  onClick={() => setFilterDifficulty([])}
                  className={`w-full px-4 py-2 text-left text-sm transition ${filterDifficulty.length === 0 ? 'bg-white/5 font-semibold text-teal-300' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}
                >
                  All Levels
                </button>
                {['Beginner', 'Intermediate', 'Advanced'].map(level => (
                  <button
                    key={level}
                    onClick={() => setFilterDifficulty(prev =>
                      prev.includes(level) ? prev.filter(l => l !== level) : [...prev, level]
                    )}
                    className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition hover:bg-white/5 ${filterDifficulty.includes(level) ? 'font-semibold text-teal-300' : 'text-slate-300'}`}
                  >
                    <span className={`flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded border text-[9px] ${filterDifficulty.includes(level) ? 'border-teal-500 bg-teal-500 text-white' : 'border-slate-600'}`}>
                      {filterDifficulty.includes(level) ? '✓' : ''}
                    </span>
                    {level}
                  </button>
                ))}
              </div>
            </div>

            {/* Topics multi-select */}
            <div className="relative group">
              <button
                className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-600"
              >
                {filterTopics.length === 0 ? 'All Topics' : `${filterTopics.length} Topic${filterTopics.length > 1 ? 's' : ''}`}
                <ChevronDown className="h-3 w-3 text-slate-400" />
              </button>
              <div className="absolute top-full left-0 z-20 mt-1 hidden max-h-80 min-w-[240px] overflow-y-auto rounded-lg border border-slate-700 bg-slate-800 py-1 shadow-xl group-focus-within:block group-hover:block">
                {/* Header row */}
                <div className="flex items-center justify-between border-b border-slate-700 px-4 py-1.5">
                  <button
                    onClick={() => setFilterTopics([])}
                    className={`text-sm transition ${filterTopics.length === 0 ? 'font-semibold text-teal-300' : 'text-slate-400 hover:text-white'}`}
                  >
                    All Topics
                  </button>
                  {canEdit && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditingTopics(t => !t); setNewTopicInput(""); }}
                      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-slate-400 transition hover:bg-white/5 hover:text-white"
                    >
                      <Pencil className="h-3 w-3" /> {editingTopics ? 'Done' : 'Edit'}
                    </button>
                  )}
                </div>

                {/* Topic list */}
                {topics.map(topic => (
                  <div key={topic} className="flex items-center group/item">
                    <button
                      onClick={() => setFilterTopics(prev =>
                        prev.includes(topic) ? prev.filter(t => t !== topic) : [...prev, topic]
                      )}
                      className={`flex flex-1 items-center gap-2 px-4 py-2 text-left text-sm transition hover:bg-white/5 ${filterTopics.includes(topic) ? 'font-semibold text-teal-300' : 'text-slate-300'}`}
                    >
                      <span className={`flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded border text-[9px] ${filterTopics.includes(topic) ? 'border-teal-500 bg-teal-500 text-white' : 'border-slate-600'}`}>
                        {filterTopics.includes(topic) ? '✓' : ''}
                      </span>
                      {topic}
                    </button>
                    {editingTopics && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const updated = topics.filter(t => t !== topic);
                          setTopics(updated);
                          if (typeof window !== "undefined") localStorage.setItem("mediaLibraryTopics", JSON.stringify(updated));
                          setFilterTopics(prev => prev.filter(t => t !== topic));
                        }}
                        className="pr-3 text-red-400 opacity-0 transition hover:text-red-300 group-hover/item:opacity-100"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}

                {/* Add new topic */}
                {editingTopics && (
                  <div className="flex gap-1.5 border-t border-slate-700 px-3 pb-2 pt-2">
                    <input
                      value={newTopicInput}
                      onChange={e => setNewTopicInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && newTopicInput.trim()) {
                          const updated = [...topics, newTopicInput.trim()];
                          setTopics(updated);
                          if (typeof window !== "undefined") localStorage.setItem("mediaLibraryTopics", JSON.stringify(updated));
                          setNewTopicInput("");
                        }
                      }}
                      placeholder="Add topic..."
                      className="flex-1 rounded-lg border border-slate-600 bg-slate-700 px-2 py-1.5 text-xs text-white placeholder:text-slate-500 focus:border-teal-500 focus:outline-none"
                    />
                    <button
                      onClick={() => {
                        if (!newTopicInput.trim()) return;
                        const updated = [...topics, newTopicInput.trim()];
                        setTopics(updated);
                        if (typeof window !== "undefined") localStorage.setItem("mediaLibraryTopics", JSON.stringify(updated));
                        setNewTopicInput("");
                      }}
                      className="rounded-lg bg-teal-500 px-2 py-1.5 text-xs font-semibold text-white transition hover:bg-teal-400"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>


          </div>
        </div>

        {/* Backpack - All words with levels */}
        {activeMediaTab === 'allwords' && (
          <div>
            <h2 className="text-2xl font-bold mb-6" style={{ color: '#3d4a2e', fontFamily: 'Cormorant Garamond, Georgia, serif' }}>🎒 Words Backpack</h2>
            <div className="flex flex-wrap gap-4 justify-center">
              {[
                { name: 'New', color: '#999999' },
                { name: 'Recognized', color: '#dc2626' },
                { name: 'Familiar', color: '#eab308' },
                { name: 'Can Use', color: '#86efac' },
                { name: 'Mastered', color: '#16a34a' },
              ].map((level) => (
                <motion.div
                  key={level.name}
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => navigate(createPageUrl("Backpack"))}
                  className="w-24 h-24 rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all shadow-lg"
                  style={{ background: `${level.color}15`, border: `2px solid ${level.color}50` }}
                >
                  <p className="text-center text-sm font-bold" style={{ color: level.color }}>{level.name}</p>
                </motion.div>
              ))}
              <motion.div
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => navigate(createPageUrl("Backpack"))}
                className="w-24 h-24 rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all shadow-lg"
                style={{ background: '#8b5cf615', border: '2px solid #8b5cf650' }}
              >
                <p className="text-center text-sm font-bold" style={{ color: '#8b5cf6' }}>Verbs</p>
              </motion.div>
              <motion.div
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => navigate(createPageUrl("Backpack"))}
                className="w-24 h-24 rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all shadow-lg"
                style={{ background: '#06b6d415', border: '2px solid #06b6d450' }}
              >
                <p className="text-center text-sm font-bold" style={{ color: '#06b6d4' }}>Core Vocab</p>
              </motion.div>
            </div>
          </div>
        )}

        {/* Verbs Tab */}
         {activeMediaTab === 'verbs' && (
          <div>
            <h2 className="text-2xl font-bold text-white mb-4">Verbs from Backpack</h2>
            {wordRatings.filter((w: any) => w.is_verb).length === 0 ? (
              <div className="text-center py-8">
                <p className="text-white/60">No verbs in your backpack yet. Add verbs while learning!</p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-3">
                {wordRatings.filter((w: any) => w.is_verb).map((verb: any) => (
                  <motion.button
                    key={verb.id}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setSelectedVerb(verb)}
                    className="px-4 py-2 rounded-lg bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 border border-cyan-500/50 font-semibold transition-all"
                  >
                    {verb.infinitive || verb.phonetic}
                  </motion.button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Core Vocab Tab */}
        {activeMediaTab === 'corevocab' && <CoreVocabTab />}

        {/* Student submissions — admin approval queue. Personal videos added
            by students; Approve copies one into the master library. */}
        {canEdit && pendingStudentVideos.length > 0 && (
          <div className="mb-8 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
            <h2 className="mb-3 text-lg font-semibold text-amber-300">
              Student submissions ({pendingStudentVideos.length})
            </h2>
            <div className="space-y-3">
              {pendingStudentVideos.map((video: any) => (
                <div key={video.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900 p-3">
                  <img
                    src={getThumbnailUrl(video) || `https://i.ytimg.com/vi/${video.video_id || extractYouTubeId(video.video_url) || 'default'}/hqdefault.jpg`}
                    alt={video.title}
                    className="h-16 w-28 flex-shrink-0 cursor-pointer rounded-lg object-cover"
                    onClick={() => handleVideoClick({ ...video, _source: 'personal' })}
                    onError={(e: any) => { e.target.style.display = 'none'; }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="cursor-pointer truncate text-sm font-semibold text-white hover:text-teal-300" onClick={() => handleVideoClick({ ...video, _source: 'personal' })}>{video.title}</p>
                    <p className="truncate text-xs text-slate-400">Added by {video.created_by}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {video.language && <span className="rounded-md bg-teal-500/15 px-2 py-0.5 text-xs font-medium capitalize text-teal-300">{video.language}</span>}
                      {video.difficulty_level && <span className="rounded-md bg-slate-700 px-2 py-0.5 text-xs font-medium text-slate-300">{video.difficulty_level}</span>}
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1.5">
                    <button
                      onClick={() => approveSavedVideoMutation.mutate(video)}
                      disabled={approveSavedVideoMutation.isPending}
                      className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/30 disabled:opacity-50"
                    >
                      ✓ Approve
                    </button>
                    <button
                      onClick={() => handleEdit({ ...video, _source: 'personal' })}
                      className="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-white/10"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => { if (confirm(`Delete "${video.title}" (added by ${video.created_by})?`)) deleteSavedVideoMutation.mutate(video.id); }}
                      className="rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300 transition hover:bg-red-500/20"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Library Videos Grid */}
        {(filterContentTypes.includes('videos') || filterContentTypes.includes('audio') || filterContentTypes.includes('songs')) && (
          <div className="mb-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredVideos.map((video: any) => (
                <motion.div
                  key={video.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => handleVideoClick(video)}
                  className="group cursor-pointer overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 transition-all hover:border-teal-500/50 hover:shadow-lg hover:shadow-teal-500/5"
                >
                  <div className="aspect-video w-full bg-black">
                    <img
                      src={getThumbnailUrl(video) || `https://i.ytimg.com/vi/${extractYouTubeId(video.video_url) || 'default'}/hqdefault.jpg`}
                      alt={video.title}
                      className="h-full w-full object-cover"
                      onError={(e: any) => { e.target.style.display = 'none'; }}
                    />
                  </div>
                  <div className="p-3.5">
                    <div className="mb-2.5 flex items-start justify-between gap-2">
                      <h3 className="flex-1 text-sm font-semibold leading-snug text-white line-clamp-2">{video.title}</h3>
                      <div className="flex flex-shrink-0 gap-0.5">
                        {canModifyVideo(video) && (
                          <button onClick={(e) => { e.stopPropagation(); handleEdit(video); }} className="rounded-md p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white" aria-label="Edit">
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                        {(video._source === 'personal' ? canModifyVideo(video) : canDelete) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!confirm("Delete this video from library?")) return;
                              if (video._source === 'personal') {
                                deleteSavedVideoMutation.mutate(video.id);
                              } else {
                                deleteVideoMutation.mutate(video.id);
                              }
                            }}
                            className="rounded-md p-1.5 text-slate-400 transition hover:bg-red-500/15 hover:text-red-400"
                            aria-label="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-md bg-teal-500/15 px-2 py-0.5 text-xs font-medium capitalize text-teal-300">{video.language}</span>
                      {video.difficulty_level && <span className="rounded-md bg-slate-700 px-2 py-0.5 text-xs font-medium text-slate-300">{video.difficulty_level}</span>}
                      {video.duration_minutes && <span className="rounded-md bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-400">{video.duration_minutes} min</span>}
                      {video._source === 'personal' && <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-300">My Video</span>}
                    </div>
                    {canAssign && video._source !== 'personal' && (
                      <select
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => {
                          const userEmail = e.target.value;
                          if (userEmail) {
                            assignVideoMutation.mutate({ user_email: userEmail, media_library_id: video.id, assigned_by: currentUser.email, assigned_at: new Date().toISOString(), order: 0 });
                            e.target.value = "";
                          }
                        }}
                        defaultValue=""
                        className="mt-3 h-8 w-full rounded-lg border border-teal-500/40 bg-teal-500/10 px-2 text-xs text-teal-300 focus:border-teal-500 focus:outline-none"
                      >
                        <option value="" disabled className="bg-slate-800 text-slate-300">Assign to session...</option>
                        {allUsers.map((user: any) => (
                          <option key={user.id} value={user.email} className="bg-slate-800 text-white">{user.full_name || user.email}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
            {filteredVideos.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-800 py-12 text-center">
                <p className="text-slate-400">No videos found. Try adjusting your filters or add media above.</p>
              </div>
            )}
          </div>
        )}

          {/* Recommended Videos Section */}
          {filterContentTypes.includes('videos') && (
          <div className="mt-8">
            <button
              onClick={() => { setShowRecommended(!showRecommended); if (!showRecommended) fetchRecommendations(); }}
              className="mb-4 flex w-full items-center justify-between rounded-2xl border border-slate-800 bg-slate-900 p-4 transition hover:border-slate-700 hover:bg-slate-800"
            >
              <h2 className="text-lg font-semibold text-white">
                Recommended Videos {recommendations.length > 0 ? <span className="text-teal-400">({recommendations.length})</span> : ''}
              </h2>
              <ChevronDown className={`h-5 w-5 text-slate-400 transition-transform ${showRecommended ? 'rotate-180' : ''}`} />
            </button>
            {showRecommended && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-4"
              >
                {loadingRecommendations && (
                  <div className="flex items-center justify-center gap-3 py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-teal-400" />
                    <p className="text-slate-400">Finding recommendations from similar channels...</p>
                  </div>
                )}
                {recommendations.map((video: any, idx: number) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 transition hover:border-teal-500/50"
                >
                  <img
                    src={`https://img.youtube.com/vi/${video.youtube_id}/hqdefault.jpg`}
                    alt={video.title}
                    className="h-32 w-48 flex-shrink-0 cursor-pointer object-cover"
                    onClick={() => handleVideoClick({ video_id: video.youtube_id, video_url: `https://youtube.com/watch?v=${video.youtube_id}`, title: video.title })}
                  />
                  <div className="flex-1 p-4">
                    <h3 className="mb-0.5 cursor-pointer text-base font-semibold text-white transition hover:text-teal-300" onClick={() => handleVideoClick({ video_id: video.youtube_id, video_url: `https://youtube.com/watch?v=${video.youtube_id}`, title: video.title })}>{video.title}</h3>
                    <p className="mb-1 text-xs text-teal-400">{video.channel}</p>
                    {video.description && <p className="mb-3 text-sm text-slate-400">{video.description}</p>}
                    {canEdit && (
                      <button
                        onClick={() => addToLibraryMutation.mutate({ title: video.title, video_url: `https://youtube.com/watch?v=${video.youtube_id}`, youtube_video_id: video.youtube_id, tags: video.channel })}
                        className="inline-flex items-center gap-1 rounded-lg border border-teal-500/40 bg-teal-500/15 px-3 py-1.5 text-xs font-medium text-teal-300 transition hover:bg-teal-500/25"
                      >
                        <Plus className="h-4 w-4" />
                        Add to My Schedule
                      </button>
                    )}
                  </div>
                </motion.div>
                ))}
                {!loadingRecommendations && recommendations.length === 0 && (
                  <p className="py-4 text-center text-slate-500">No recommendations found. Try again.</p>
                )}
              </motion.div>
            )}
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <AddVideoDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        editingVideo={editingVideo}
        formData={formData}
        setFormData={setFormData}
        mediaType={mediaType}
        setMediaType={setMediaType}
        uploadingAudio={uploadingAudio}
        onSubmit={handleSubmit}
        onCancel={() => { setShowAddDialog(false); setEditingVideo(null); resetForm(); }}
        onAudioUpload={handleAudioUpload}
        onLoadYoutube={fetchYouTubeMetadata}
        isPending={false}
        allUsers={allUsers}
        sessionOptions={sessionOptions}
        sessionLanguageLabel={languageLabel(formData.language)}
        canManageCatalog={canEdit && editingVideo?._source !== 'personal'}
      />



      {/* Verb Conjugation Modal */}
      <Dialog open={!!selectedVerb} onOpenChange={() => setSelectedVerb(null)}>
        <DialogContent className="bg-slate-900 border-white/20 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-center text-2xl">
              <span className="text-cyan-400">{selectedVerb?.infinitive || selectedVerb?.phonetic}</span>
            </DialogTitle>
          </DialogHeader>
          {selectedVerb?.verb_conjugations && (
            <div className="space-y-6">
              {['past', 'present', 'future'].map((tense) => (
                <div key={tense}>
                  <h3 className="text-lg font-bold text-amber-400 mb-3 capitalize">{tense} Tense</h3>
                  <div className="grid grid-cols-2 gap-3 bg-white/5 rounded-lg p-4">
                    {selectedVerb.verb_conjugations[tense] && Object.entries(selectedVerb.verb_conjugations[tense]).map(([person, conj]: any) => (
                      <div key={person} className="border-l-2 border-cyan-500/50 pl-3">
                        <p className="text-white/60 text-xs capitalize">{person.replace('_', ' ')}</p>
                        <p className="text-cyan-300 font-semibold" dir={isRTLText(conj.native) ? 'rtl' : 'ltr'}>{conj.native}</p>
                        <p className="text-white/70 text-sm">{conj.transliteration}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Video Transcript Dialog - Fullscreen */}
      {showTranscript && (
        <div className="fixed inset-0 z-50 bg-slate-900">
          <div className="h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <h2 className="text-white font-bold text-xl">{selectedVideo?.title}</h2>
              <div className="flex items-center gap-2">
                {/* Re-fetch the transcript from the source audio — for fixing
                    old saved transcripts that came from a wrong-language
                    caption track (e.g. Arabic auto-captions on Hebrew videos). */}
                {transcript.length > 0 && !loadingTranscript && canModifyVideo(selectedVideo) && (
                  <button
                    onClick={() => { if (confirm("Replace this transcript with a freshly generated one?")) generateTranscriptFromYouTube(selectedVideo); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 text-sm font-medium border border-purple-500/40 transition-all"
                  >
                    ♻️ Regenerate transcript
                  </button>
                )}
                {transcript.length > 0 && (
                  <button
                    onClick={() => extractVocabFromTranscript(selectedVideo, transcript)}
                    disabled={extractingVocab}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 text-sm font-medium border border-cyan-500/40 transition-all disabled:opacity-50"
                  >
                    {extractingVocab ? <Loader2 className="w-4 h-4 animate-spin" /> : "🎒"}
                    {extractingVocab ? "Extracting..." : "Save key words to Backpack"}
                  </button>
                )}
                <button
                  onClick={() => setShowTranscript(false)}
                  className="text-white/60 hover:text-white p-2"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Main content: video + transcript side by side on wide screens, stacked on mobile */}
            <div className="flex-1 overflow-hidden flex flex-col items-center">
              {/* Video Player - constrained width */}
              <div className="w-full max-w-3xl bg-black" style={{ height: '35vh' }}>
                {(selectedVideo?.video_id || selectedVideo?.youtube_video_id || selectedVideo?.video_url) && (
                  <div id="youtube-player" className="w-full h-full" />
                )}
              </div>

            {/* Transcript - always show, player not required */}
            <div className="w-full max-w-3xl flex-1 overflow-y-auto py-4 px-2">
              {loadingTranscript ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
                </div>
              ) : transcript.length > 0 ? (
                <>
                  <ContinuousTranscript
                    transcript={transcript}
                    currentTime={currentTime}
                    onSeekTo={handleSeekTo}
                    onAddWord={handleAddWordFromTranscript}
                    onEditWord={saveTranscriptEdit}
                    onBulkEdit={saveTranscriptBulk}
                    onDeleteSegment={deleteTranscriptSegment}
                    canEdit={canEdit}
                    isPlaying={isPlaying}
                    language={selectedVideo?.language || userProfile?.language || 'hebrew'}
                    translationInProgress={translationInProgress}
                  />
                  <div className="mt-6 pb-8 flex justify-center">
                    {sessionDay ? (
                      <button
                        onClick={handleRankWords}
                        className="px-8 py-4 rounded-2xl text-white font-bold text-lg transition-all hover:scale-105"
                        style={{ background: 'linear-gradient(135deg, #5a6b5a, #3d4a2e)' }}
                      >
                        ✅ I'm Done — Rank Words
                      </button>
                    ) : (
                      <button
                        onClick={handleStartFlashcards}
                        disabled={loadingFlashcards}
                        className={`px-8 py-4 rounded-2xl text-white font-bold text-lg transition-all hover:scale-105 flex items-center gap-2 ${videoEnded ? 'animate-pulse' : ''}`}
                        style={{ background: 'linear-gradient(135deg, #5a6b5a, #3d4a2e)' }}
                      >
                        {loadingFlashcards ? <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : '✅'}
                        {loadingFlashcards ? 'Loading...' : "I'm Done Hearing — Write It"}
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="max-w-3xl mx-auto bg-white/5 rounded-xl p-8 space-y-6">
                  <div className="text-center">
                    <p className="text-white/60 mb-4">No transcript available</p>
                    <p className="text-white/40 text-sm mb-6">Paste transcript from YouTube "Show transcript" or DownSub</p>
                  </div>

                  <Textarea
                    value={pastedTranscript}
                    onChange={(e) => setPastedTranscript(e.target.value)}
                    placeholder="Paste transcript here..."
                    className="bg-white/5 border-white/20 text-white min-h-[200px]"
                  />

                  <div className="flex gap-3">
                    <Button
                      onClick={() => processManualTranscript(selectedVideo, pastedTranscript)}
                      disabled={!pastedTranscript.trim()}
                      className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500"
                    >
                      Paste Transcript
                    </Button>
                    {canModifyVideo(selectedVideo) && (
                      <Button
                        onClick={() => generateTranscriptFromYouTube(selectedVideo)}
                        variant="outline"
                        className="border-cyan-500/50 text-cyan-400"
                      >
                        Try YouTube Auto
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
            </div>
          </div>
        </div>
      )}
    </div>


    <TranslatorWidget />
    </>
    );
}
