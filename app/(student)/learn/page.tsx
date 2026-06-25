"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 as base44Client } from "@/api/base44Client";

// base44Client is a JS shim whose `entities` are built dynamically in a loop, so
// TS can't see entity keys like `Video`. Cast to `any` for ergonomic access —
// the runtime shape is guaranteed by the shim.
const base44: any = base44Client;
import { toast } from "sonner";
import { Plus, Loader2, Video as VideoIcon } from "lucide-react";
import VideoTranscript from "@/components/video/VideoTranscript";
import AddVideoDialog from "@/components/media/AddVideoDialog";

// Pull a YouTube video id out of any common YouTube URL shape.
function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const match = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([^&?]+)/
  );
  return match ? match[1] : null;
}

const EMPTY_FORM = {
  title: "",
  language: "hebrew",
  video_url: "",
  video_id: "",
  topics: [] as string[],
  difficulty_level: "All",
  duration_minutes: "",
  tags: "",
  is_active: true,
  thumbnail_url: "",
  default_day: "",
  transcript_phonetics: "",
  assigned_users: [] as Array<{ email: string; session: string }>,
};

export default function LearnPage() {
  const queryClient = useQueryClient();
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [mediaType, setMediaType] = useState("video");
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [formData, setFormData] = useState<any>(EMPTY_FORM);

  // The `video` table is the source of truth here (it is empty to start, which
  // the UI must handle gracefully). VideoTranscript itself looks rows up by
  // video_url / youtube_video_id, so we just feed it the chosen row.
  const {
    data: videos = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["learnVideos"],
    queryFn: async () => {
      const all = await base44.entities.Video.list("-created_date");
      return (all || []).filter(
        (v: any) => !v.deleted_at && v.is_active !== false
      );
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const createVideoMutation = useMutation({
    mutationFn: (data: any) => base44.entities.Video.create(data),
    onSuccess: (newVideo: any) => {
      queryClient.invalidateQueries({ queryKey: ["learnVideos"] });
      setShowAddDialog(false);
      setFormData(EMPTY_FORM);
      if (newVideo?.id) setSelectedVideoId(newVideo.id);
      toast.success("Video added!");
    },
    onError: (e: any) => {
      toast.error(`Failed to add video: ${e?.message || "Unknown error"}`);
    },
  });

  // Best-effort metadata: extract the id + grab the public oembed title.
  // We intentionally avoid the LLM enrichment used by the admin MediaLibrary
  // so this page never depends on edge functions that may not be deployed.
  const onLoadYoutube = async (url: string) => {
    const ytId = extractYouTubeId(url);
    if (!ytId) {
      toast.error("Invalid YouTube URL");
      return;
    }
    setFormData((prev: any) => ({
      ...prev,
      video_id: ytId,
      thumbnail_url: `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`,
    }));
    try {
      const res = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
      );
      if (res.ok) {
        const data = await res.json();
        setFormData((prev: any) => ({
          ...prev,
          title: prev.title || data.title || "",
        }));
      }
      toast.success("Video info loaded!");
    } catch {
      // oembed can fail (CORS / private video) — the user can still type a title.
      toast.message("Loaded video id. Add a title manually if needed.");
    }
  };

  const onAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAudio(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setFormData((prev: any) => ({ ...prev, video_url: file_url }));
      toast.success("Audio uploaded!");
    } catch (err: any) {
      toast.error(`Upload failed: ${err?.message || "Unknown error"}`);
    } finally {
      setUploadingAudio(false);
    }
  };

  const handleSubmit = () => {
    if (!formData.title) {
      toast.error("Please add a title");
      return;
    }
    const ytId =
      formData.video_id ||
      (formData.video_url ? extractYouTubeId(formData.video_url) : null);

    if (!formData.video_url && !ytId) {
      toast.error("Please provide a video URL");
      return;
    }

    createVideoMutation.mutate({
      title: formData.title,
      video_url: formData.video_url,
      youtube_video_id: ytId || undefined,
      language: formData.language,
      difficulty_level: formData.difficulty_level,
      tags: formData.tags,
      is_active: formData.is_active,
      thumbnail_url: formData.thumbnail_url,
      transcript_status: "pending",
    });
  };

  const openAddDialog = () => {
    setFormData(EMPTY_FORM);
    setMediaType("video");
    setShowAddDialog(true);
  };

  const selectedVideo =
    videos.find((v: any) => v.id === selectedVideoId) || videos[0] || null;

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-teal-400">
            Learn
          </p>
          <h1 className="mt-1 text-3xl font-extrabold text-white">
            Video Transcription
          </h1>
          <p className="mt-2 text-slate-400">
            Watch a video and follow along with an interactive, tappable
            transcript.
          </p>
        </div>
        <button
          onClick={openAddDialog}
          className="inline-flex shrink-0 items-center rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-500"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Video
        </button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-8 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin text-teal-400" />
          Loading your videos...
        </div>
      )}

      {/* Error */}
      {isError && !isLoading && (
        <div className="rounded-2xl border border-red-900/50 bg-red-950/30 p-8 text-red-300">
          Could not load videos. Please try again later.
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isError && videos.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-700 bg-slate-900/60 p-12 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-500/10 text-teal-400">
            <VideoIcon className="h-7 w-7" />
          </div>
          <h2 className="text-lg font-bold text-white">No videos yet</h2>
          <p className="mt-2 max-w-md text-sm text-slate-400">
            Add a YouTube video to generate an interactive transcript you can
            read, tap, and learn from.
          </p>
          <button
            onClick={openAddDialog}
            className="mt-6 inline-flex items-center rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-500"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add your first video
          </button>
        </div>
      )}

      {/* Video list + player */}
      {!isLoading && !isError && videos.length > 0 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
          {/* Sidebar list */}
          <div className="space-y-2">
            {videos.map((v: any) => {
              const isActive = selectedVideo && v.id === selectedVideo.id;
              return (
                <button
                  key={v.id}
                  onClick={() => setSelectedVideoId(v.id)}
                  className={`w-full rounded-xl border p-4 text-left transition ${
                    isActive
                      ? "border-teal-600 bg-slate-800"
                      : "border-slate-800 bg-slate-900 hover:border-teal-700 hover:bg-slate-800/60"
                  }`}
                >
                  <p
                    className={`font-semibold ${
                      isActive ? "text-teal-400" : "text-white"
                    }`}
                  >
                    {v.title || "Untitled video"}
                  </p>
                  {v.language && (
                    <p className="mt-1 text-xs capitalize text-slate-500">
                      {v.language}
                    </p>
                  )}
                </button>
              );
            })}
          </div>

          {/* Selected video player + transcript */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
            {selectedVideo ? (
              (() => {
                const iframeId = `youtube-player-${selectedVideo.id}`;
                const ytId =
                  selectedVideo.youtube_video_id ||
                  extractYouTubeId(selectedVideo.video_url || "");

                // Mirror the source pages: the parent renders the iframe and
                // VideoTranscript drives it via postMessage seek/pause.
                const postToPlayer = (func: string, args: string) => {
                  const iframe = document.getElementById(
                    iframeId
                  ) as HTMLIFrameElement | null;
                  iframe?.contentWindow?.postMessage(
                    `{"event":"command","func":"${func}","args":${args}}`,
                    "*"
                  );
                };

                return (
                  <>
                    {ytId && (
                      <div className="mb-4 aspect-video overflow-hidden rounded-xl bg-black">
                        <iframe
                          id={iframeId}
                          width="100%"
                          height="100%"
                          src={`https://www.youtube.com/embed/${ytId}?enablejsapi=1`}
                          title={selectedVideo.title || "Video"}
                          frameBorder="0"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        />
                      </div>
                    )}
                    <VideoTranscript
                      key={selectedVideo.id}
                      videoId={ytId}
                      videoUrl={selectedVideo.video_url}
                      iframeId={iframeId}
                      onPauseVideo={() => postToPlayer("pauseVideo", '""')}
                      onSeekVideo={(seconds: number) => {
                        postToPlayer("seekTo", `[${seconds}, true]`);
                        postToPlayer("playVideo", '""');
                      }}
                    />
                  </>
                );
              })()
            ) : (
              <p className="p-8 text-center text-slate-400">
                Select a video to view its transcript.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Add / edit dialog */}
      <AddVideoDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        editingVideo={null}
        formData={formData}
        setFormData={setFormData}
        mediaType={mediaType}
        setMediaType={setMediaType}
        uploadingAudio={uploadingAudio}
        onSubmit={handleSubmit}
        onCancel={() => setShowAddDialog(false)}
        onAudioUpload={onAudioUpload}
        onLoadYoutube={onLoadYoutube}
        isPending={createVideoMutation.isPending}
        allUsers={[]}
      />
    </div>
  );
}
