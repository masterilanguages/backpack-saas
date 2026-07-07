"use client";

import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { X, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function SongTranscriptModal({ open, onOpenChange, song, onSave, isSaving }) {
  const [transcript, setTranscript] = useState(song?.lyrics_he || "");

  useEffect(() => {
    if (open) setTranscript(song?.lyrics_he || "");
  }, [song, open]);

  const handleSave = async () => {
    if (!transcript.trim()) {
      toast.error("Please enter a transcript");
      return;
    }
    await onSave(transcript);
    setTranscript("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-800 max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white">📝 Song Transcript</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-white mb-1">{song?.vocab_words?.[0] || "Song"}</p>
            <p className="text-xs text-slate-400">Paste lyrics or transcript below</p>
          </div>

          <Textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Paste song lyrics or transcript here..."
            className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 min-h-[200px]"
          />

          <div className="flex gap-2">
            <Button
              onClick={() => {
                setTranscript("");
                onOpenChange(false);
              }}
              variant="outline"
              className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800"
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || !transcript.trim()}
              className="flex-1 bg-teal-500 hover:bg-teal-400 text-white"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...
                </>
              ) : (
                "Save Transcript"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
