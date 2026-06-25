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
      <DialogContent className="bg-white border-stone-200 max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-stone-800">📝 Song Transcript</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-stone-700 mb-1">{song?.vocab_words?.[0] || "Song"}</p>
            <p className="text-xs text-stone-400">Paste lyrics or transcript below</p>
          </div>

          <Textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Paste song lyrics or transcript here..."
            className="bg-stone-50 border-stone-200 text-stone-800 min-h-[200px]"
          />

          <div className="flex gap-2">
            <Button
              onClick={() => {
                setTranscript("");
                onOpenChange(false);
              }}
              variant="outline"
              className="flex-1"
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || !transcript.trim()}
              className="flex-1 bg-amber-500 hover:bg-amber-600 text-white"
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
