"use client";

import React, { useRef, useState, useImperativeHandle, forwardRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff } from "lucide-react";

const MicRecorder = forwardRef(({ onRecordingComplete }, ref) => {
  const [isRecording, setIsRecording] = useState(false);
  const [hasPermission, setHasPermission] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const countdownRef = useRef(null);

  useEffect(() => () => {
    clearInterval(countdownRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  useImperativeHandle(ref, () => ({
    async startRecording(durationSeconds) {
      if (hasPermission === false) return;
      try {
        if (!streamRef.current) {
          streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
          setHasPermission(true);
        }
        chunksRef.current = [];
        const mr = new MediaRecorder(streamRef.current);
        mediaRecorderRef.current = mr;
        mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
        mr.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          const url = URL.createObjectURL(blob);
          onRecordingComplete?.(url, blob);
        };
        mr.start();
        setIsRecording(true);

        let remaining = Math.ceil(durationSeconds);
        setCountdown(remaining);
        countdownRef.current = setInterval(() => {
          remaining -= 1;
          setCountdown(remaining > 0 ? remaining : null);
          if (remaining <= 0) clearInterval(countdownRef.current);
        }, 1000);
      } catch (e) {
        setHasPermission(false);
      }
    },
    stopRecording() {
      clearInterval(countdownRef.current);
      setCountdown(null);
      if (mediaRecorderRef.current?.state !== "inactive") {
        mediaRecorderRef.current?.stop();
      }
      setIsRecording(false);
    },
    isRecording() { return isRecording; }
  }));

  if (hasPermission === false) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-50 border border-red-200 text-red-500 text-sm">
        <MicOff className="w-4 h-4" /> Microphone access denied — playback still works
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <AnimatePresence mode="wait">
        {isRecording ? (
          <motion.div key="rec" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.8, opacity: 0 }} className="flex flex-col items-center gap-2">
            <div className="relative">
              <motion.div
                animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0.1, 0.4] }}
                transition={{ duration: 1.2, repeat: Infinity }}
                className="absolute inset-0 rounded-full bg-red-400"
                style={{ margin: -12 }}
              />
              <div className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center shadow-lg">
                <Mic className="w-7 h-7 text-white" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-red-500 font-bold text-sm animate-pulse">● REC</span>
              {countdown !== null && (
                <span className="text-stone-500 text-sm font-mono">{countdown}s</span>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="w-16 h-16 rounded-full bg-stone-100 border-2 border-stone-200 flex items-center justify-center">
            <Mic className="w-7 h-7 text-stone-400" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

MicRecorder.displayName = "MicRecorder";
export default MicRecorder;
