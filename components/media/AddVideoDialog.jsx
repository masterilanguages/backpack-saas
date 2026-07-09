"use client";

import React, { useState, useRef, useEffect } from "react";
import { Loader2, X, ChevronDown, Wand2, Plus } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

const topics = [
  "Religion / Spirituality", "Sports / Fitness", "Cooking / Food", "Nutrition",
  "Health / Wellness", "Meditation / Mindfulness", "Music", "Travel", "Culture",
  "Education / Learning", "Business / Career", "Personal Growth", "Relationships", "News / Current Events"
];

const LANGUAGES = ["hebrew", "english", "spanish", "french", "portuguese", "italian"];
const LEVELS = ["Beginner", "Intermediate", "Advanced", "All"];

// Shared field styles — dark slate + teal focus, matching the student sidebar.
const inputCls =
  "w-full rounded-lg bg-slate-800 border border-slate-700 text-white text-sm px-3 py-2 placeholder:text-slate-500 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500/40 transition";
const labelCls = "block text-sm font-medium text-slate-300 mb-1.5";

export default function AddVideoDialog({ open, onOpenChange, editingVideo, formData, setFormData, mediaType, setMediaType, uploadingAudio, onSubmit, onCancel, onAudioUpload, onLoadYoutube, isPending, allUsers = [], sessionOptions = [], sessionLanguageLabel = "" }) {
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [generatingTranscript, setGeneratingTranscript] = useState(false);
  const dropdownRef = useRef(null);

  // A default_day on the video that isn't among the sessions of the currently
  // selected language.
  const staleSession =
    !!formData.default_day &&
    !sessionOptions.some(s => String(s.day_number) === String(formData.default_day));

  const handleGenerateTranscript = async () => {
    const videoId = formData.video_id || (formData.video_url?.match(/(?:v=|youtu\.be\/)([^&\n?#]+)/)?.[1]);
    if (!videoId) { toast.error("Please load a video URL first"); return; }
    setGeneratingTranscript(true);
    toast.info("Fetching transcript from YouTube...");
    try {
      const result = await base44.functions.invoke('youtubeTranscript', { videoId });
      if (!result?.data?.transcript?.length) { toast.error(result?.data?.error || "No transcript found"); return; }
      const rawText = result.data.transcript.map(s => s.text).join('\n');
      setFormData(p => ({ ...p, transcript_phonetics: rawText }));
      toast.success(`Transcript loaded (${result.data.transcript.length} segments)!`);
    } catch (e) {
      toast.error("Failed to fetch transcript");
    } finally {
      setGeneratingTranscript(false);
    }
  };

  // assigned_users: [{ email, session }]
  const assignedUsers = formData.assigned_users || [];

  const toggleUserAssign = (email) => {
    const exists = assignedUsers.find(u => u.email === email);
    if (exists) {
      setFormData(p => ({ ...p, assigned_users: assignedUsers.filter(u => u.email !== email) }));
    } else {
      setFormData(p => ({ ...p, assigned_users: [...assignedUsers, { email, session: "" }] }));
    }
  };

  const setUserSession = (email, session) => {
    setFormData(p => ({
      ...p,
      assigned_users: (p.assigned_users || []).map(u => u.email === email ? { ...u, session } : u)
    }));
  };

  // Close the user multiselect when clicking outside it.
  useEffect(() => {
    const handler = (e) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setUserDropdownOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close the whole modal on Escape, and lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onCancel?.(); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onCancel]);

  const toggleTopic = (topic) => {
    setFormData(prev => ({
      ...prev,
      topics: prev.topics.includes(topic) ? prev.topics.filter(t => t !== topic) : [...prev.topics, topic]
    }));
  };

  if (!open) return null;

  return (
    // Plain fixed overlay (no Radix portal) — same pattern as the transcript
    // overlay in the media page, which renders reliably in production.
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/70 backdrop-blur-sm p-4 sm:p-6"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel?.(); }}
    >
      <div className="my-4 w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <h2 className="text-lg font-semibold text-white">
            {editingVideo ? "Edit Media" : "Add Media to Library"}
          </h2>
          <button
            type="button"
            onClick={() => onCancel?.()}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-[calc(90vh-9rem)] space-y-4 overflow-y-auto px-6 py-5">
          {/* Media type toggle */}
          <div className="flex gap-2">
            {["video", "audio", "song"].map(type => (
              <button
                key={type}
                type="button"
                onClick={() => setMediaType(type)}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  mediaType === type
                    ? "bg-teal-500 text-white"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                {type === "video" ? "📹 Video" : type === "audio" ? "🎵 Audio" : "🎶 Song"}
              </button>
            ))}
          </div>

          {mediaType === "video" ? (
            <div>
              <label className={labelCls}>Video URL <span className="text-teal-400">*</span></label>
              <div className="flex gap-2">
                <input
                  value={formData.video_url}
                  onChange={(e) => setFormData(p => ({ ...p, video_url: e.target.value }))}
                  placeholder="https://youtube.com/watch?v=..."
                  className={inputCls}
                />
                <button
                  type="button"
                  onClick={() => onLoadYoutube(formData.video_url)}
                  disabled={!formData.video_url}
                  className="shrink-0 rounded-lg bg-teal-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-teal-400 disabled:opacity-40"
                >
                  Load
                </button>
              </div>
            </div>
          ) : (
            <div>
              <label className={labelCls}>Upload {mediaType === "audio" ? "MP3 Audio" : "Song (MP3)"} <span className="text-teal-400">*</span></label>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  accept="audio/mp3,audio/mpeg,audio/wav,audio/ogg,.mp3,.wav,.ogg"
                  onChange={onAudioUpload}
                  disabled={uploadingAudio}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 text-sm text-slate-300 file:mr-3 file:border-0 file:bg-slate-700 file:px-3 file:py-2 file:text-sm file:text-white hover:file:bg-slate-600"
                />
                {uploadingAudio && <Loader2 className="h-5 w-5 shrink-0 animate-spin text-teal-400" />}
              </div>
              {formData.video_url && <p className="mt-1 text-xs text-teal-400">✓ Uploaded</p>}
            </div>
          )}

          <div>
            <label className={labelCls}>Video ID <span className="text-slate-500">(auto-populated)</span></label>
            <input value={formData.video_id} readOnly placeholder="Auto-populated from URL" className={`${inputCls} text-slate-400`} />
          </div>

          <div>
            <label className={labelCls}>Title <span className="text-teal-400">*</span></label>
            <input
              value={formData.title}
              onChange={(e) => setFormData(p => ({ ...p, title: e.target.value }))}
              placeholder="Auto-populated from YouTube"
              className={inputCls}
            />
          </div>

          {allUsers.length > 0 && (
            <div>
              <label className={labelCls}>Assign to Users <span className="text-slate-500">(optional)</span></label>
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setUserDropdownOpen(o => !o)}
                  className="flex w-full items-center justify-between rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white"
                >
                  <span className="text-slate-400">
                    {assignedUsers.length === 0 ? "Select users..." : `${assignedUsers.length} user${assignedUsers.length > 1 ? "s" : ""} selected`}
                  </span>
                  <ChevronDown className="h-4 w-4 text-slate-500" />
                </button>
                {userDropdownOpen && (
                  <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-700 bg-slate-800 shadow-xl">
                    {allUsers.map(u => {
                      const checked = assignedUsers.some(a => a.email === u.email);
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => toggleUserAssign(u.email)}
                          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-white/5 ${checked ? "text-teal-300" : "text-slate-200"}`}
                        >
                          <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${checked ? "border-teal-500 bg-teal-500 text-white" : "border-slate-600"}`}>
                            {checked ? "✓" : ""}
                          </span>
                          {u.full_name || u.email}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {assignedUsers.length > 0 && (
                <div className="mt-2 space-y-2">
                  {assignedUsers.map(au => (
                    <div key={au.email} className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2">
                      <span className="flex-1 truncate text-xs text-slate-300">{au.email}</span>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={au.session}
                        onChange={e => setUserSession(au.email, e.target.value)}
                        placeholder="Session #"
                        className="h-7 w-28 rounded-md border border-slate-600 bg-slate-700 px-2 text-xs text-white placeholder:text-slate-500 focus:border-teal-500 focus:outline-none"
                      />
                      <button type="button" onClick={() => toggleUserAssign(au.email)} className="text-slate-500 transition hover:text-red-400">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <label className={labelCls}>Designate to Session (Day) <span className="text-slate-500">— for all users</span></label>
            {sessionOptions.length === 0 && !formData.default_day ? (
              <select disabled className={`${inputCls} cursor-not-allowed opacity-60`}>
                <option>No sessions exist for {sessionLanguageLabel}</option>
              </select>
            ) : (
              <select
                value={formData.default_day ?? ""}
                onChange={(e) => setFormData(p => ({ ...p, default_day: e.target.value }))}
                className={inputCls}
              >
                <option value="" className="bg-slate-800">— None —</option>
                {sessionOptions.map(s => (
                  <option key={s.day_number} value={s.day_number} className="bg-slate-800">
                    Session {s.day_number} {s.count === 0 ? "— empty" : `— ${s.count} item${s.count > 1 ? "s" : ""}`}
                  </option>
                ))}
                {/* A session stored on the video that no longer exists for this language —
                    e.g. the language was changed after saving. Keep it listed so editing
                    the video neither hides it nor silently drops it; "— None —" clears it. */}
                {staleSession && (
                  <option value={formData.default_day} className="bg-slate-800">
                    Session {formData.default_day} — doesn't exist for {sessionLanguageLabel}
                  </option>
                )}
              </select>
            )}
            {sessionOptions.length === 0 ? (
              <p className="mt-1 text-xs text-amber-400/80">
                Create sessions in Lessons → Days with your learning language set to {sessionLanguageLabel}.
              </p>
            ) : (
              <p className="mt-1 text-xs text-slate-500">Video will auto-populate in this session's schedule</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Language <span className="text-teal-400">*</span></label>
              <select
                value={formData.language}
                onChange={(e) => setFormData(p => ({ ...p, language: e.target.value }))}
                className={inputCls}
              >
                {LANGUAGES.map(l => <option key={l} value={l} className="bg-slate-800">{l.charAt(0).toUpperCase() + l.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Difficulty</label>
              <select
                value={formData.difficulty_level}
                onChange={(e) => setFormData(p => ({ ...p, difficulty_level: e.target.value }))}
                className={inputCls}
              >
                {LEVELS.map(d => <option key={d} value={d} className="bg-slate-800">{d}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>Topics</label>
            <div className="grid grid-cols-2 gap-2">
              {topics.map(topic => (
                <button
                  key={topic}
                  type="button"
                  onClick={() => toggleTopic(topic)}
                  className={`rounded-lg border px-3 py-2 text-sm transition ${
                    formData.topics.includes(topic)
                      ? "border-teal-500 bg-teal-500/15 text-teal-300"
                      : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  {topic}
                </button>
              ))}
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={formData.is_active}
              onChange={(e) => setFormData(p => ({ ...p, is_active: e.target.checked }))}
              className="h-4 w-4 accent-teal-500"
            />
            Active
          </label>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className={`${labelCls} mb-0`}>Transcript</label>
              {mediaType === "video" && (
                <button
                  type="button"
                  onClick={handleGenerateTranscript}
                  disabled={generatingTranscript || !formData.video_id}
                  className="flex items-center gap-1 rounded-lg border border-teal-500/40 bg-teal-500/15 px-2 py-1 text-xs font-medium text-teal-300 transition hover:bg-teal-500/25 disabled:opacity-40"
                >
                  {generatingTranscript ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                  Auto-fetch from YouTube
                </button>
              )}
            </div>
            <p className="mb-2 text-xs text-slate-500">Paste transcript in any language (target language, English, or phonetics). System will generate the target language text + English translation for each sentence.</p>
            <textarea
              value={formData.transcript_phonetics}
              onChange={(e) => setFormData(p => ({ ...p, transcript_phonetics: e.target.value }))}
              placeholder="Paste transcript here (Spanish, English, Hebrew, etc.)..."
              rows={6}
              className={`${inputCls} resize-y`}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 border-t border-slate-800 px-6 py-4">
          <button
            type="button"
            onClick={onSubmit}
            disabled={isPending}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-400 disabled:opacity-50"
          >
            {isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" />{editingVideo ? "Updating..." : "Adding..."}</>
            ) : (
              <>{editingVideo ? null : <Plus className="h-4 w-4" />}{editingVideo ? "Update Video" : "Add to Library"}</>
            )}
          </button>
          <button
            type="button"
            onClick={() => onCancel?.()}
            className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-slate-800"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
