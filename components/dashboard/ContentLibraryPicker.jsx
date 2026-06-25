"use client";

import React, { useState } from "react";
import { base44 as base44Client } from "@/api/base44Client";
const base44 = base44Client;
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search, X, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function ContentLibraryPicker({ open, onOpenChange, onSelect, language }) {
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);

  const { data: media = [] } = useQuery({
    queryKey: ["mediaLibrary"],
    queryFn: () => base44.entities.MediaLibrary.list(),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const filtered = media
    .filter(m => m.is_active !== false)
    .filter(m => !language || m.language === language)
    .filter(m => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return m.title?.toLowerCase().includes(q) || (m.tags || "").toLowerCase().includes(q);
    });

  const getThumbnail = (m) => {
    if (m.thumbnail_url) return m.thumbnail_url;
    const id = m.video_id || extractYouTubeId(m.video_url);
    if (id) return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
    return null;
  };

  const extractYouTubeId = (url) => {
    if (!url) return null;
    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/);
    return match ? match[1] : null;
  };

  const isAudio = (m) => !m.video_id && !extractYouTubeId(m.video_url) && m.video_url;

  const handleAudioUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.includes('audio')) {
      toast.error("Please upload an audio file (MP3 or M4A)");
      return;
    }

    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      onSelect({
        title: file.name.replace(/\.[^/.]+$/, ""),
        video_url: file_url,
        is_active: true,
        difficulty_level: "All",
        language: language || "hebrew"
      });
      onOpenChange(false);
      toast.success("Audio uploaded!");
    } catch (err) {
      toast.error("Failed to upload audio");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col" style={{ background: '#f5f1eb', border: '1px solid #e0dcd4' }}>
        <DialogHeader>
          <DialogTitle style={{ color: '#3d4a2e', fontFamily: 'Cormorant Garamond, serif' }}>
            📚 Add from Content Library
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2 mb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <Input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search content..."
              className="pl-9 bg-white border-stone-300 text-stone-800"
            />
          </div>
          <label className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed border-stone-300 bg-stone-50 hover:bg-stone-100 cursor-pointer transition-all">
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 text-stone-600 animate-spin" />
                <span className="text-sm font-medium text-stone-600">Uploading...</span>
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 text-stone-600" />
                <span className="text-sm font-medium text-stone-600">Upload MP3 or M4A</span>
              </>
            )}
            <input
              type="file"
              accept=".mp3,.m4a,audio/mpeg,audio/mp4"
              onChange={handleAudioUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {filtered.length === 0 && (
            <p className="text-center text-stone-400 py-8 text-sm">No content found.</p>
          )}
          {filtered.map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => { onSelect(m); onOpenChange(false); }}
              className="w-full flex items-center gap-3 bg-white rounded-xl border border-stone-200 p-2.5 hover:border-stone-400 transition-all text-left"
            >
              {isAudio(m) ? (
                <div className="w-14 h-10 rounded-lg flex-shrink-0 flex items-center justify-center bg-stone-100 text-xl">🎵</div>
              ) : getThumbnail(m) ? (
                <img src={getThumbnail(m)} alt="" className="w-14 h-10 rounded-lg object-cover flex-shrink-0" />
              ) : (
                <div className="w-14 h-10 rounded-lg flex-shrink-0 bg-stone-100 flex items-center justify-center text-xl">📹</div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-stone-700 font-semibold text-sm truncate">{m.title}</p>
                <p className="text-stone-400 text-xs">{isAudio(m) ? "🎧 Audio" : "▶ Video"} · {m.difficulty_level || "All"}</p>
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
