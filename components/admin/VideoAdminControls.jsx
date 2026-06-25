"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Edit } from "lucide-react";
import { toast } from "sonner";

export default function VideoAdminControls({ video, onUpdate }) {
  const [showEditDialog, setShowEditDialog] = useState(false);

  const [editForm, setEditForm] = useState({
    title: video.title || "",
    day: video.level || 1,
    url: video.video_url || "",
    tags: video.tags || "",
    notes: video.notes || ""
  });

  const handleSaveEdit = async () => {
    try {
      await onUpdate({
        title: editForm.title,
        level: parseInt(editForm.day) || 1,
        video_url: editForm.url,
        tags: editForm.tags,
        notes: editForm.notes
      });
      setShowEditDialog(false);
      toast.success("Video updated!");
    } catch (e) {
      toast.error("Failed to update video");
    }
  };

  return (
    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
      <Button
        onClick={(e) => { e.stopPropagation(); setShowEditDialog(true); }}
        variant="outline"
        size="sm"
        className="bg-blue-500/20 border-blue-500/50 text-blue-400 hover:bg-blue-500/30"
      >
        <Edit className="w-4 h-4 mr-1" />
        Edit
      </Button>



      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="bg-slate-900 border-white/20 text-white">
          <DialogHeader>
            <DialogTitle>Edit Video</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title</Label>
              <Input
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                className="bg-white/5 border-white/20 text-white"
              />
            </div>
            <div>
              <Label>Day</Label>
              <Input
                type="number"
                min="1"
                max="100"
                value={editForm.day}
                onChange={(e) => setEditForm({ ...editForm, day: e.target.value })}
                className="bg-white/5 border-white/20 text-white"
              />
            </div>
            <div>
              <Label>URL or Link</Label>
              <Input
                value={editForm.url}
                onChange={(e) => setEditForm({ ...editForm, url: e.target.value })}
                placeholder="https://youtube.com/watch?v=..."
                className="bg-white/5 border-white/20 text-white"
              />
            </div>
            <div>
              <Label>Tags (comma separated)</Label>
              <Input
                value={editForm.tags}
                onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })}
                placeholder="beginner, vocabulary, daily life"
                className="bg-white/5 border-white/20 text-white"
              />
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                className="bg-white/5 border-white/20 text-white"
                rows={3}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSaveEdit} className="flex-1 bg-blue-500 hover:bg-blue-600">
                Save Changes
              </Button>
              <Button onClick={() => setShowEditDialog(false)} variant="outline" className="border-white/20">
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>


    </div>
  );
}
