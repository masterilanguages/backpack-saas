"use client";

import React, { useState, useEffect } from "react";
import { base44 as base44Client } from "@/api/base44Client";
// base44Client is a JS shim whose `entities` are built dynamically, so TS can't
// see entity keys like `Song`. Cast to `any` for ergonomic access — the runtime
// shape is guaranteed by the shim.
const base44: any = base44Client;
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Music,
  Plus,
  Check,
  ChevronRight,
  Upload,
  Trash2,
  GripVertical,
  Mic,
} from "lucide-react";
import { Link, createPageUrl } from "@/lib/router-compat";
import { toast } from "sonner";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import VideoTranscript from "@/components/video/VideoTranscript";
import KaraokeTranscript from "@/components/transcript/KaraokeTranscript";
import EditableWord from "@/components/learning/EditableWord";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function SongsPage() {
  const queryClient = useQueryClient();
  const [expandedSongId, setExpandedSongId] = useState<string | null>(null);
  const [addingSong, setAddingSong] = useState(false);
  const [newSongUrl, setNewSongUrl] = useState("");
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const user = await base44.auth.me();
        setCurrentUser(user);
      } catch (e) {}
    };
    fetchUser();
  }, []);

  const isAdmin = currentUser?.role === "admin";
  const canEdit = isAdmin;
  const canDeleteSong = (song: any) =>
    isAdmin || song.created_by === currentUser?.email;

  const { data: userProfile } = useQuery({
    queryKey: ["userProfile", currentUser?.email],
    queryFn: async () => {
      const profiles = await base44.entities.UserProfile.filter({
        created_by: currentUser.email,
      });
      return profiles[0] || null;
    },
    enabled: !!currentUser?.email,
    staleTime: 5 * 60 * 1000,
  });

  const { data: userCoins } = useQuery({
    queryKey: ["userCoins", currentUser?.email],
    queryFn: async () => {
      const coins = await base44.entities.UserCoins.filter({
        created_by: currentUser.email,
      });
      return coins[0] || { coins: 0 };
    },
    enabled: !!currentUser?.email,
    staleTime: 2 * 60 * 1000,
  });

  const {
    data: songs = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["songs"],
    queryFn: async () => {
      const allSongs = await base44.entities.Song.list();
      return (allSongs || []).sort(
        (a: any, b: any) => (a.order || 0) - (b.order || 0)
      );
    },
  });

  const { data: songProgress = [] } = useQuery({
    queryKey: ["songProgress"],
    queryFn: () => base44.entities.SongProgress.list(),
  });

  const { data: wordRatings = [] } = useQuery({
    queryKey: ["wordRatings", currentUser?.email],
    queryFn: () =>
      base44.entities.Word.filter({
        category: "wordbank",
        created_by: currentUser.email,
      }),
    enabled: !!currentUser?.email,
  });

  const createWordMutation = useMutation({
    mutationFn: (word: any) => base44.entities.Word.create(word),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["wordRatings"] }),
  });

  const createSongProgressMutation = useMutation({
    mutationFn: (data: any) => base44.entities.SongProgress.create(data),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["songProgress"] }),
  });

  const updateSongProgressMutation = useMutation({
    mutationFn: ({ id, data }: any) =>
      base44.entities.SongProgress.update(id, data),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["songProgress"] }),
  });

  const createSongMutation = useMutation({
    mutationFn: (song: any) => base44.entities.Song.create(song),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["songs"] });
      setAddingSong(false);
      setNewSongUrl("");
      toast.success("Song added! 🎵");
    },
    onError: (e: any) => {
      console.error("Song.create failed", e);
      toast.error("Couldn't save song — you don't have permission.");
    },
  });

  const updateSongMutation = useMutation({
    mutationFn: ({ id, data }: any) => base44.entities.Song.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["songs"] });
      toast.success("Updated!");
    },
    onError: (e: any) => {
      console.error("Song.update failed", e);
      toast.error("Couldn't save changes — you don't have permission.");
    },
  });

  const deleteSongMutation = useMutation({
    mutationFn: (id: string) => base44.entities.Song.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["songs"] });
      toast.success("Song deleted");
    },
    onError: (e: any) => {
      console.error("Song.delete failed", e);
      toast.error("Couldn't delete song — you don't have permission.");
    },
  });

  const reorderSongsMutation = useMutation({
    mutationFn: async (songsToReorder: any[]) => {
      await Promise.all(
        songsToReorder.map((song: any, index: number) =>
          base44.entities.Song.update(song.id, { order: index })
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["songs"] });
      toast.success("Order saved!");
    },
  });

  const addWordToBackpack = async (
    word: any,
    songId: string,
    songTitle: string
  ) => {
    const existingWord = wordRatings.find((w: any) => w.word === word.hebrew);
    if (existingWord) {
      toast.info("Already in backpack!");
      return;
    }

    await createWordMutation.mutateAsync({
      word: word.hebrew,
      translation: word.english,
      phonetic: word.transliteration,
      category: "wordbank",
      example_sentence: `From song: ${songTitle}`,
      times_practiced: 1,
      mastered: false,
    });

    toast.success(`Added "${word.transliteration}" to backpack! 🎒`);

    // Update song progress
    const progress = songProgress.find((p: any) => p.song_id === songId);
    const song = songs.find((s: any) => s.id === songId);

    if (song) {
      const allWordsAdded = song.transcript.every(
        (w: any) =>
          wordRatings.find((wr: any) => wr.word === w.hebrew) ||
          w.hebrew === word.hebrew
      );

      if (progress) {
        const newWordsAdded = [...(progress.words_added || []), word.hebrew];
        await updateSongProgressMutation.mutateAsync({
          id: progress.id,
          data: {
            words_added: newWordsAdded,
            completed: allWordsAdded,
          },
        });
        if (allWordsAdded) {
          toast.success("🎉 Song completed! All words added!");
        }
      } else {
        await createSongProgressMutation.mutateAsync({
          song_id: songId,
          words_added: [word.hebrew],
          completed: allWordsAdded,
        });
      }
    }
  };

  const getSongProgress = (songId: string) => {
    return songProgress.find((p: any) => p.song_id === songId);
  };

  const extractYouTubeId = (url: string) => {
    if (!url) return null;
    const match = url.match(
      /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([^&?]+)/
    );
    return match ? match[1] : null;
  };

  const handleAddSong = () => {
    const ytId = extractYouTubeId(newSongUrl);
    if (!ytId && !newSongUrl.includes("http")) {
      toast.error("Invalid YouTube URL");
      return;
    }

    createSongMutation.mutate({
      title: `Song ${songs.length + 1}`,
      youtube_url: newSongUrl,
      youtube_id: ytId,
      transcript: [],
      level: 1,
      order: songs.length,
    });
  };

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("audio/")) {
      toast.error("Please upload an audio file (MP3, WAV, etc.)");
      return;
    }

    setUploadingAudio(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });

      createSongMutation.mutate({
        title: `Song ${songs.length + 1}`,
        audio_url: file_url,
        transcript: [],
        level: 1,
        order: songs.length,
      });
    } catch (error) {
      toast.error("Failed to upload audio");
    }
    setUploadingAudio(false);
  };

  const handleDragEnd = (result: any) => {
    if (!result.destination) return;

    const reordered = Array.from(songs);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);

    reorderSongsMutation.mutate(reordered);
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <Link
            to={createPageUrl("Home")}
            className="mt-1 text-slate-500 transition hover:text-teal-400"
          >
            <ArrowLeft className="h-6 w-6" />
          </Link>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-teal-400">
              Learn
            </p>
            <h1 className="mt-1 text-3xl font-extrabold text-white">
              🎵 Learn Hebrew Songs
            </h1>
            <p className="mt-2 text-slate-400">
              Watch, listen, and add vocab to your backpack
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/learn/singing"
            className="inline-flex items-center rounded-md border border-amber-600/40 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-300 transition hover:bg-amber-500/20"
          >
            <Mic className="mr-2 h-4 w-4" />
            Singing
          </Link>
          {canEdit && (
            <Button
              onClick={() => setAddingSong(!addingSong)}
              className="bg-green-500 hover:bg-green-600"
            >
              <Plus className="mr-2 h-4 w-4" /> Add Song
            </Button>
          )}
        </div>
      </div>

      {addingSong && (
        <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h3 className="mb-4 font-bold text-white">Add New Song</h3>

          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm text-slate-400">
                YouTube URL
              </label>
              <div className="flex gap-2">
                <Input
                  value={newSongUrl}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setNewSongUrl(e.target.value)
                  }
                  placeholder="Paste YouTube URL..."
                  className="flex-1 border-slate-700 bg-slate-800 text-white"
                />
                <Button onClick={handleAddSong} disabled={!newSongUrl.trim()}>
                  Add Video
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="h-px flex-1 bg-slate-700" />
              <span className="text-sm text-slate-500">OR</span>
              <div className="h-px flex-1 bg-slate-700" />
            </div>

            <div>
              <label className="mb-2 block text-sm text-slate-400">
                Upload Audio File (MP3, WAV)
              </label>
              <label className="block">
                <input
                  type="file"
                  accept="audio/*"
                  onChange={handleAudioUpload}
                  className="hidden"
                />
                <span className="flex w-full cursor-pointer items-center justify-center rounded-md border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800">
                  <Upload className="mr-2 h-4 w-4" />
                  {uploadingAudio ? "Uploading..." : "Choose Audio File"}
                </span>
              </label>
            </div>

            <Button
              onClick={() => setAddingSong(false)}
              variant="outline"
              className="w-full border-slate-700 text-slate-200"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-8 text-slate-400">
          <Music className="h-5 w-5 animate-pulse text-teal-400" />
          Loading songs...
        </div>
      )}

      {/* Error */}
      {isError && !isLoading && (
        <div className="rounded-2xl border border-red-900/50 bg-red-950/30 p-8 text-red-300">
          Could not load songs. Please try again later.
        </div>
      )}

      {/* Empty */}
      {!isLoading && !isError && songs.length === 0 && (
        <div className="py-12 text-center">
          <Music className="mx-auto mb-4 h-16 w-16 text-slate-600" />
          <p className="text-slate-400">No songs yet! Come back soon.</p>
        </div>
      )}

      {/* List */}
      {!isLoading && !isError && songs.length > 0 && (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="songs">
            {(provided) => (
              <div
                ref={provided.innerRef}
                {...provided.droppableProps}
                className="space-y-4"
              >
                {songs.map((song: any, index: number) => {
                  const isExpanded = expandedSongId === song.id;
                  const progress = getSongProgress(song.id);
                  const isCompleted = progress?.completed || false;
                  const ytId = extractYouTubeId(song.youtube_url);
                  const hasVideo = !!song.youtube_url;
                  const hasAudio = !!song.audio_url;

                  return (
                    <Draggable
                      key={song.id}
                      draggableId={song.id}
                      index={index}
                      isDragDisabled={!isAdmin}
                    >
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={`overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 ${
                            snapshot.isDragging ? "scale-105 shadow-2xl" : ""
                          }`}
                        >
                          <div className="flex gap-4 p-4">
                            {isAdmin && (
                              <div
                                {...provided.dragHandleProps}
                                className="flex cursor-grab items-center active:cursor-grabbing"
                              >
                                <GripVertical className="h-5 w-5 text-slate-500" />
                              </div>
                            )}
                            <div
                              onClick={() =>
                                setExpandedSongId(isExpanded ? null : song.id)
                              }
                              className="flex flex-1 cursor-pointer gap-4 rounded-lg transition-all hover:bg-slate-800/40"
                            >
                              <div className="relative h-24 w-40 flex-shrink-0 overflow-hidden rounded-xl bg-black">
                                {ytId ? (
                                  <img
                                    src={`https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`}
                                    alt={song.title}
                                    className="h-full w-full object-cover"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
                                    }}
                                  />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-purple-600 to-pink-600">
                                    <Music className="h-12 w-12 text-white" />
                                  </div>
                                )}
                                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                  <Music className="h-10 w-10 text-white" />
                                </div>
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  {isCompleted && (
                                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500">
                                      <Check className="h-4 w-4 text-white" />
                                    </div>
                                  )}
                                  {isAdmin ? (
                                    <EditableWord
                                      text={song.title}
                                      onSave={(newTitle: string) =>
                                        updateSongMutation.mutate({
                                          id: song.id,
                                          data: { title: newTitle },
                                        })
                                      }
                                      className="font-bold text-white"
                                    />
                                  ) : (
                                    <h3 className="font-bold text-white">
                                      {song.title}
                                    </h3>
                                  )}
                                </div>
                                <p className="mt-1 text-sm text-slate-400">
                                  Level {song.level} •{" "}
                                  {hasVideo ? "📺 Video" : "🎵 Audio"} •{" "}
                                  {song.transcript?.length || 0} words
                                </p>
                                {isCompleted && (
                                  <span className="mt-2 inline-block rounded-full bg-green-500/20 px-2 py-1 text-xs text-green-400">
                                    ✓ Completed
                                  </span>
                                )}
                              </div>
                              <ChevronRight
                                className={`h-5 w-5 text-slate-500 transition-transform ${
                                  isExpanded ? "rotate-90" : ""
                                }`}
                              />
                            </div>
                            {canDeleteSong(song) && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm("Delete this song?"))
                                    deleteSongMutation.mutate(song.id);
                                }}
                                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-red-500/20 hover:bg-red-500/30"
                              >
                                <Trash2 className="h-4 w-4 text-red-400" />
                              </button>
                            )}
                          </div>

                          {isExpanded && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              className="space-y-4 border-t border-slate-800 bg-slate-950/40 p-4"
                            >
                              {hasVideo && ytId && (
                                <div className="aspect-video overflow-hidden rounded-xl bg-black">
                                  <iframe
                                    id={`youtube-player-${song.id}`}
                                    width="100%"
                                    height="100%"
                                    src={`https://www.youtube.com/embed/${ytId}?enablejsapi=1`}
                                    title={song.title}
                                    frameBorder="0"
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                    allowFullScreen
                                  />
                                </div>
                              )}

                              {hasAudio && !hasVideo && (
                                <div className="rounded-xl bg-slate-800/60 p-4">
                                  <audio
                                    id={`audio-player-${song.id}`}
                                    controls
                                    className="w-full"
                                  >
                                    <source
                                      src={song.audio_url}
                                      type="audio/mpeg"
                                    />
                                    Your browser does not support the audio
                                    element.
                                  </audio>
                                </div>
                              )}

                              {song.transcript &&
                              song.transcript.length > 0 &&
                              song.transcript[0].start_ms !== undefined ? (
                                <div className="mt-4">
                                  <p className="mb-3 text-sm text-slate-400">
                                    🎤 Karaoke Lyrics - Click line to jump
                                  </p>
                                  <KaraokeTranscript
                                    lines={song.transcript.map(
                                      (line: any, idx: number) => ({
                                        id: `line_${idx}`,
                                        start_ms: line.start_ms || idx * 5000,
                                        end_ms:
                                          line.end_ms || (idx + 1) * 5000,
                                        transliteration: line.transliteration,
                                        english: line.english,
                                        hebrew: line.hebrew,
                                      })
                                    )}
                                    audioRef={
                                      hasAudio && !hasVideo
                                        ? {
                                            current: document.getElementById(
                                              `audio-player-${song.id}`
                                            ),
                                          }
                                        : null
                                    }
                                    videoRef={
                                      hasVideo
                                        ? {
                                            current: document.getElementById(
                                              `youtube-player-${song.id}`
                                            ),
                                          }
                                        : null
                                    }
                                    onLineUpdate={(
                                      lineIndex: number,
                                      updatedLine: any
                                    ) => {
                                      const newTranscript = [
                                        ...song.transcript,
                                      ];
                                      newTranscript[lineIndex] = {
                                        ...song.transcript[lineIndex],
                                        transliteration:
                                          updatedLine.transliteration,
                                        english: updatedLine.english,
                                        hebrew: updatedLine.hebrew,
                                      };
                                      updateSongMutation.mutate({
                                        id: song.id,
                                        data: { transcript: newTranscript },
                                      });
                                    }}
                                    onAddToBackpack={(
                                      hebrew: string,
                                      transliteration: string,
                                      english: string
                                    ) => {
                                      addWordToBackpack(
                                        { hebrew, transliteration, english },
                                        song.id,
                                        song.title
                                      );
                                    }}
                                  />
                                </div>
                              ) : (
                                <VideoTranscript
                                  videoId={song.id}
                                  videoUrl={song.youtube_url || song.audio_url}
                                  onPauseVideo={() => {
                                    if (hasVideo) {
                                      const iframe = document.getElementById(
                                        `youtube-player-${song.id}`
                                      ) as HTMLIFrameElement | null;
                                      if (iframe && iframe.contentWindow) {
                                        iframe.contentWindow.postMessage(
                                          '{"event":"command","func":"pauseVideo","args":""}',
                                          "*"
                                        );
                                      }
                                    }
                                  }}
                                  onSeekVideo={(seconds: number) => {
                                    if (hasVideo) {
                                      const iframe = document.getElementById(
                                        `youtube-player-${song.id}`
                                      ) as HTMLIFrameElement | null;
                                      if (iframe && iframe.contentWindow) {
                                        iframe.contentWindow.postMessage(
                                          `{"event":"command","func":"seekTo","args":[${seconds}, true]}`,
                                          "*"
                                        );
                                        iframe.contentWindow.postMessage(
                                          '{"event":"command","func":"playVideo","args":""}',
                                          "*"
                                        );
                                      }
                                    }
                                  }}
                                />
                              )}
                            </motion.div>
                          )}
                        </div>
                      )}
                    </Draggable>
                  );
                })}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}
    </div>
  );
}
