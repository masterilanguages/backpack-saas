"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 as base44Client } from "@/api/base44Client";
const base44 = base44Client;
import { useNavigate, createPageUrl } from "@/lib/router-compat";
import { Play } from "lucide-react";
import { motion } from "framer-motion";

export default function RecommendedForYou({ userProfile }) {
  const navigate = useNavigate();

  const { data: videos = [] } = useQuery({
    queryKey: ["mediaLibrary"],
    queryFn: () => base44.entities.MediaLibrary.list(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const recommended = videos
    .filter((v) => v.is_active !== false)
    .filter((v) => {
      const levelMatch =
        !userProfile.difficulty_level ||
        !v.difficulty_level ||
        v.difficulty_level === "All" ||
        v.difficulty_level?.toLowerCase() === userProfile.difficulty_level?.toLowerCase();

      const interestMatch =
        !userProfile.interests?.length ||
        !v.topics?.length ||
        (v.topics || []).some((t) =>
          (userProfile.interests || []).some((i) =>
            t.toLowerCase().includes(i.toLowerCase()) ||
            i.toLowerCase().includes(t.toLowerCase())
          )
        );

      return levelMatch || interestMatch;
    })
    .slice(0, 6);

  if (recommended.length === 0) return null;

  const extractYouTubeId = (url) => {
    const match = (url || "").match(
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([^&\n?#]+)/
    );
    return match ? match[1] : null;
  };

  const getThumbnail = (video) => {
    if (video.thumbnail_url) return video.thumbnail_url;
    const id = video.video_id || extractYouTubeId(video.video_url);
    return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
  };

  return (
    <div>
      <h2
        className="text-3xl font-bold mb-4 text-center"
        style={{ color: "#3d4a2e", fontFamily: "Cormorant Garamond, Georgia, serif" }}
      >
        ✨ Recommended for You
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {recommended.map((video) => {
          const thumb = getThumbnail(video);
          return (
            <motion.div
              key={video.id}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate(createPageUrl("MediaLibrary"))}
              className="rounded-xl overflow-hidden cursor-pointer shadow-md"
              style={{ border: "1px solid rgba(90,107,90,0.2)" }}
            >
              <div className="relative w-full aspect-video bg-stone-200">
                {thumb ? (
                  <img src={thumb} alt={video.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-stone-300">
                    <Play className="w-8 h-8 text-stone-500" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                  <Play className="w-8 h-8 text-white" />
                </div>
              </div>
              <div className="p-2" style={{ background: "rgba(255,255,255,0.6)" }}>
                <p className="text-xs font-semibold truncate" style={{ color: "#3d4a2e" }}>
                  {video.title}
                </p>
                {video.difficulty_level && video.difficulty_level !== "All" && (
                  <span className="text-xs" style={{ color: "#6b7c5a" }}>
                    {video.difficulty_level}
                  </span>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
