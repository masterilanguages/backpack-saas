"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, Users, X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export default function AvatarMenu({
  open,
  onClose,
  onChangeAvatar,
  onRestartLife,
  avatarName
}) {
  const [confirmRestart, setConfirmRestart] = React.useState(false);

  const handleRestartConfirm = () => {
    setConfirmRestart(false);
    onRestartLife();
    onClose();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle>Avatar Options</DialogTitle>
            <DialogDescription className="text-slate-400">
              Manage {avatarName}'s journey
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setConfirmRestart(true)}
              className="w-full flex items-center gap-4 p-4 bg-gradient-to-r from-red-500/20 to-orange-500/20 border border-red-500/30 rounded-xl hover:border-red-400 transition-all"
            >
              <div className="w-12 h-12 rounded-full bg-red-500/30 flex items-center justify-center">
                <RefreshCw className="w-6 h-6 text-red-400" />
              </div>
              <div className="text-left">
                <p className="font-bold text-white">Start New Life From Beginning</p>
                <p className="text-slate-400 text-sm">Reset everything and start fresh as a baby</p>
              </div>
            </motion.button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Restart Confirmation Dialog */}
      <Dialog open={confirmRestart} onOpenChange={setConfirmRestart}>
        <DialogContent className="bg-slate-900 border-red-500/30 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-5 h-5" />
              Restart Life?
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              This will reset {avatarName} back to age 3. Your coins and items will be kept, but all progress will be lost.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-3 mt-4">
            <Button
              variant="outline"
              onClick={() => setConfirmRestart(false)}
              className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleRestartConfirm}
              className="flex-1 bg-red-500 hover:bg-red-600"
            >
              Yes, Restart
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
