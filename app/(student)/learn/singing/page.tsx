"use client";

import React, { useState, useEffect } from "react";
import { useNavigate } from "@/lib/router-compat";
import { base44 as base44Client } from "@/api/base44Client";
const base44: any = base44Client;
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Mic, ChevronRight, Music } from "lucide-react";

export default function SingingHome() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  const { data: songs = [] } = useQuery({
    queryKey: ["singingSongs"],
    queryFn: () => base44.entities.SingingSong.filter({ is_active: true }),
    staleTime: 5 * 60 * 1000,
  });

  const { data: progress = [] } = useQuery({
    queryKey: ["singingProgress"],
    queryFn: () => base44.entities.SingingProgress.list(),
    enabled: !!currentUser,
    staleTime: 2 * 60 * 1000,
  });

  const getProgress = (songId: string) =>
    progress.find((p: any) => p.song_id === songId);

  const difficultyColors: Record<string, { bg: string; text: string }> = {
    beginner: { bg: "#dcfce7", text: "#16a34a" },
    intermediate: { bg: "#fef3c7", text: "#d97706" },
    advanced: { bg: "#fee2e2", text: "#dc2626" },
  };

  return (
    <div
      className="min-h-screen"
      style={{
        background:
          "linear-gradient(160deg, #fdf8f0 0%, #f5efe3 50%, #ede8dc 100%)",
      }}
    >
      <div className="max-w-lg mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Music className="w-6 h-6" style={{ color: "#b45309" }} />
            <h1
              className="text-3xl font-bold"
              style={{ color: "#3d2e1a", fontFamily: "Cormorant Garamond, serif" }}
            >
              Singing Lesson
            </h1>
          </div>
          <p className="text-stone-500 text-sm">
            Learn Hebrew through music &amp; your voice
          </p>
        </div>

        {/* CTA */}
        {songs.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 rounded-3xl overflow-hidden shadow-lg cursor-pointer"
            style={{
              background: "linear-gradient(135deg, #92400e, #b45309, #d97706)",
            }}
            onClick={() =>
              navigate(`/learn/singing/lesson?songId=${songs[0].id}`)
            }
          >
            <div className="p-6 text-white">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-bold uppercase tracking-wider opacity-70">
                  Featured Song
                </span>
              </div>
              <h2 className="text-2xl font-bold mb-1">{songs[0].title}</h2>
              <p className="text-white/70 text-sm mb-5">
                {songs[0].description}
              </p>
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="flex items-center gap-2 bg-white/20 hover:bg-white/30 backdrop-blur px-5 py-2.5 rounded-full text-sm font-bold transition-all"
              >
                <Mic className="w-4 h-4" /> Start Singing
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* Song list */}
        <h3
          className="text-lg font-bold mb-3"
          style={{ color: "#3d2e1a", fontFamily: "Cormorant Garamond, serif" }}
        >
          All Songs
        </h3>
        <div className="space-y-3">
          {songs.map((song: any) => {
            const prog = getProgress(song.id);
            const pct =
              prog && song.duration_seconds
                ? Math.min(
                    100,
                    Math.round(
                      ((prog.completed_segments?.length || 0) / 3) * 100
                    )
                  )
                : 0;
            const dc =
              difficultyColors[song.difficulty_level] ||
              difficultyColors.beginner;
            return (
              <motion.div
                key={song.id}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() =>
                  navigate(`/learn/singing/lesson?songId=${song.id}`)
                }
                className="flex items-center gap-4 bg-white/70 border border-stone-200 rounded-2xl p-4 cursor-pointer hover:shadow-md transition-all"
              >
                <div
                  className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 text-2xl shadow-inner"
                  style={{ background: "linear-gradient(135deg, #fde68a, #fbbf24)" }}
                >
                  {song.cover_image ? (
                    <img
                      src={song.cover_image}
                      className="w-full h-full object-cover rounded-xl"
                      alt=""
                    />
                  ) : (
                    "🎵"
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-bold text-stone-800 text-sm truncate">
                      {song.title}
                    </span>
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                      style={{ background: dc.bg, color: dc.text }}
                    >
                      {song.difficulty_level}
                    </span>
                  </div>
                  <p className="text-stone-400 text-xs mb-2 truncate">
                    {song.description}
                  </p>
                  {pct > 0 && (
                    <div className="h-1.5 rounded-full bg-stone-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-amber-400 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-stone-300 flex-shrink-0" />
              </motion.div>
            );
          })}
          {songs.length === 0 && (
            <div className="text-center py-12 text-stone-400">
              <Music className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">
                No songs yet — an admin can seed sample data.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
