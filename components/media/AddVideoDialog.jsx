"use client";

import React, { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, X, ChevronDown, Wand2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

const topics = [
  "Religion / Spirituality", "Sports / Fitness", "Cooking / Food", "Nutrition",
  "Health / Wellness", "Meditation / Mindfulness", "Music", "Travel", "Culture",
  "Education / Learning", "Business / Career", "Personal Growth", "Relationships", "News / Current Events"
];

const tagOptions = ['Learning', 'Hebrew', 'Beginner', 'Intermediate', 'Advanced', 'Grammar', 'Vocabulary', 'Conversation', 'Music', 'Stories', 'Culture', 'Daily Routine', 'Business', 'Travel', 'Food', 'Health'];

export default function AddVideoDialog({ open, onOpenChange, editingVideo, formData, setFormData, mediaType, setMediaType, uploadingAudio, onSubmit, onCancel, onAudioUpload, onLoadYoutube, isPending, allUsers = [] }) {
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [generatingTranscript, setGeneratingTranscript] = useState(false);
  const dropdownRef = useRef(null);

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

  useEffect(() => {
    const handler = (e) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setUserDropdownOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggleTopic = (topic) => {
    setFormData(prev => ({
      ...prev,
      topics: prev.topics.includes(topic) ? prev.topics.filter(t => t !== topic) : [...prev.topics, topic]
    }));
  };

  const toggleTag = (tag, checked) => {
    let tagsList = formData.tags.split(',').map(t => t.trim()).filter(Boolean);
    if (checked) { tagsList.push(tag); } else { tagsList = tagsList.filter(t => t !== tag); }
    setFormData(prev => ({ ...prev, tags: tagsList.join(', ') }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-white/20 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingVideo ? "Edit Media" : "Add Media to Library"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2 mb-4">
              {["video", "audio", "song"].map(type => (
                <Button key={type} type="button" onClick={() => setMediaType(type)} className={mediaType === type ? "bg-cyan-500" : "bg-white/10"}>
                  {type === "video" ? "📹 Video" : type === "audio" ? "🎵 Audio" : "🎶 Song"}
                </Button>
              ))}
          </div>

          {mediaType === "video" ? (
            <div>
              <Label>Video URL *</Label>
              <div className="flex gap-2">
                <Input value={formData.video_url} onChange={(e) => setFormData(p => ({ ...p, video_url: e.target.value }))} placeholder="https://youtube.com/watch?v=..." className="bg-white/5 border-white/20 text-white flex-1" />
                <Button type="button" onClick={() => onLoadYoutube(formData.video_url)} disabled={!formData.video_url} className="bg-cyan-500 hover:bg-cyan-600">Load</Button>
              </div>
            </div>
          ) : (
            <div>
              <Label>Upload {mediaType === "audio" ? "MP3 Audio" : "Song (MP3)"} *</Label>
              <div className="flex items-center gap-2">
                <Input type="file" accept="audio/mp3,audio/mpeg,audio/wav,audio/ogg,.mp3,.wav,.ogg" onChange={onAudioUpload} className="bg-white/5 border-white/20 text-white flex-1" disabled={uploadingAudio} />
                {uploadingAudio && <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />}
              </div>
              {formData.video_url && <p className="text-xs text-green-400 mt-1">✓ Uploaded</p>}
            </div>
          )}

          <div>
            <Label>Video ID * (auto-populated)</Label>
            <Input value={formData.video_id} readOnly placeholder="Auto-populated from URL" className="bg-white/5 border-white/20 text-white/60" />
          </div>

          <div>
            <Label>Title * (editable)</Label>
            <Input value={formData.title} onChange={(e) => setFormData(p => ({ ...p, title: e.target.value }))} placeholder="Auto-populated from YouTube" className="bg-white/5 border-white/20 text-white" />
          </div>

          {allUsers.length > 0 && (
            <div>
              <Label>Assign to Users (optional)</Label>
              {/* Multi-select dropdown */}
              <div className="relative mt-1" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setUserDropdownOpen(o => !o)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-md border border-white/20 bg-white/5 text-white text-sm"
                >
                  <span className="text-white/70">
                    {assignedUsers.length === 0 ? "Select users..." : `${assignedUsers.length} user${assignedUsers.length > 1 ? "s" : ""} selected`}
                  </span>
                  <ChevronDown className="w-4 h-4 text-white/50" />
                </button>
                {userDropdownOpen && (
                  <div className="absolute z-50 mt-1 w-full bg-slate-800 border border-white/20 rounded-md shadow-xl max-h-48 overflow-y-auto">
                    {allUsers.map(u => {
                      const checked = assignedUsers.some(a => a.email === u.email);
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => toggleUserAssign(u.email)}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-all hover:bg-white/10 ${checked ? "text-cyan-300" : "text-white/80"}`}
                        >
                          <span className={`w-4 h-4 rounded border flex items-center justify-center text-[10px] flex-shrink-0 ${checked ? "bg-cyan-500 border-cyan-500 text-white" : "border-white/30"}`}>
                            {checked ? "✓" : ""}
                          </span>
                          {u.full_name || u.email}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Per-user session number inputs */}
              {assignedUsers.length > 0 && (
                <div className="mt-2 space-y-2">
                  {assignedUsers.map(au => (
                    <div key={au.email} className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
                      <span className="text-xs text-white/70 flex-1 truncate">{au.email}</span>
                      <Input
                        type="number"
                        min="1"
                        max="100"
                        value={au.session}
                        onChange={e => setUserSession(au.email, e.target.value)}
                        placeholder="Session #"
                        className="bg-white/10 border-white/20 text-white w-28 h-7 text-xs"
                      />
                      <button type="button" onClick={() => toggleUserAssign(au.email)} className="text-white/40 hover:text-red-400 transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <Label>Designate to Session (Day) — for all users</Label>
            <Input type="number" min="1" max="100" value={formData.default_day} onChange={(e) => setFormData(p => ({ ...p, default_day: e.target.value }))} placeholder="Which session? (1-100)" className="bg-white/5 border-white/20 text-white" />
            <p className="text-xs text-white/50 mt-1">Video will auto-populate in this session's schedule</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Language *</Label>
              <Select value={formData.language} onValueChange={(val) => setFormData(p => ({ ...p, language: val }))}>
                <SelectTrigger className="bg-white/5 border-white/20 text-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["hebrew","english","spanish","french","portuguese","italian"].map(l => <SelectItem key={l} value={l}>{l.charAt(0).toUpperCase()+l.slice(1)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Difficulty</Label>
              <Select value={formData.difficulty_level} onValueChange={(val) => setFormData(p => ({ ...p, difficulty_level: val }))}>
                <SelectTrigger className="bg-white/5 border-white/20 text-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Beginner","Intermediate","Advanced","All"].map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Topics</Label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {topics.map(topic => (
                <button key={topic} type="button" onClick={() => toggleTopic(topic)} className={`text-sm px-3 py-2 rounded border transition-all ${formData.topics.includes(topic) ? 'bg-cyan-500/30 border-cyan-500 text-cyan-400' : 'bg-white/5 border-white/20 text-white/70 hover:bg-white/10'}`}>{topic}</button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-white/80 cursor-pointer">
            <input type="checkbox" checked={formData.is_active} onChange={(e) => setFormData(p => ({ ...p, is_active: e.target.checked }))} className="w-4 h-4" />
            Active
          </label>

          <div>
            <div className="flex items-center justify-between mb-1">
              <Label>Transcript</Label>
              {mediaType === "video" && (
                <Button type="button" size="sm" onClick={handleGenerateTranscript} disabled={generatingTranscript || !formData.video_id} className="bg-purple-500/30 hover:bg-purple-500/50 text-purple-300 border border-purple-500/40 text-xs h-7 px-2">
                  {generatingTranscript ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Wand2 className="w-3 h-3 mr-1" />}
                  Auto-fetch from YouTube
                </Button>
              )}
            </div>
            <p className="text-xs text-white/60 mb-2">Paste transcript in any language (target language, English, or phonetics). System will generate the target language text + English translation for each sentence.</p>
            <Textarea value={formData.transcript_phonetics} onChange={(e) => setFormData(p => ({ ...p, transcript_phonetics: e.target.value }))} placeholder="Paste transcript here (Spanish, English, Hebrew, etc.)..." className="bg-white/5 border-white/20 text-white" rows={6} />
          </div>

          <div className="flex gap-2">
            <Button onClick={onSubmit} disabled={isPending} className="flex-1 bg-gradient-to-r from-cyan-500 to-blue-500">
              {isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{editingVideo ? "Updating..." : "Adding..."}</> : editingVideo ? "Update Video" : "Add to Library"}
            </Button>
            <Button onClick={onCancel} variant="outline" className="border-white/20">Cancel</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}