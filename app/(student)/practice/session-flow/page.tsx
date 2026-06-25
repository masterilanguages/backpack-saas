"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useNavigate } from "@/lib/router-compat";
import { base44 as base44Client } from "@/api/base44Client";
const base44: any = base44Client;
import { ArrowLeft, CheckCircle, Play, Mic, Sparkles, BookOpen } from "lucide-react";
import { motion } from "framer-motion";

function SessionFlowInner() {
  const navigate = useNavigate();
  const searchParams = useSearchParams();
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps] = useState<Set<number>>(new Set());
  const [videoData, setVideoData] = useState<any>(null);
  const [, setLoading] = useState(true);

  // navigate(-1) doesn't exist in the router-compat shim — use browser history.
  const goBack = () => {
    if (typeof window !== "undefined") window.history.back();
  };

  const sessionId = searchParams.get("sessionId") || searchParams.get("videoId");
  const dayId = searchParams.get("dayId");
  const taskId = searchParams.get("taskId");

  const steps = [
    { id: 0, label: "Watch", description: "Watch the video", icon: Play, color: "#6366f1" },
    {
      id: 1,
      label: "Listen & Write",
      description: "Transcribe sentences",
      icon: BookOpen,
      color: "#8b5cf6",
    },
    { id: 2, label: "Speak", description: "Speak aloud", icon: Mic, color: "#ec4899" },
    { id: 3, label: "Flashcards", description: "Practice vocab", icon: Sparkles, color: "#f59e0b" },
    { id: 4, label: "Journal", description: "Reflect & write", icon: BookOpen, color: "#10b981" },
  ];

  useEffect(() => {
    const fetchVideo = async () => {
      if (!sessionId) {
        setLoading(false);
        return;
      }
      try {
        const videos = await base44.entities.MediaLibrary.filter({ video_id: sessionId });
        if (videos[0]) {
          setVideoData(videos[0]);
        }
      } catch (e) {
        console.error("Failed to fetch video:", e);
      } finally {
        setLoading(false);
      }
    };
    fetchVideo();
  }, [sessionId]);

  const handleStepClick = (stepId: number) => {
    switch (stepId) {
      case 0: // Watch — the media library (Slice G) hosts the player
        navigate(`/library?videoId=${sessionId}`);
        break;
      case 1: // Listen & Write (Dictation)
        sessionStorage.setItem(
          "dictationData",
          JSON.stringify({
            videoId: sessionId,
            title: videoData?.title || "",
            transcript: (videoData?.processed_transcript || []).filter(
              (s: any) => s.transliteration || s.text
            ),
            dayId: dayId || "",
            taskId: taskId || "",
          })
        );
        navigate("/practice/dictation");
        break;
      case 2: // Speak (SpeakAudio)
        navigate(
          `/practice/speak-audio?videoId=${sessionId}&dayId=${dayId || ""}&taskId=${taskId || ""}`
        );
        break;
      case 3: // Flashcards (Slice B)
        navigate(`/library/flashcards?videoId=${sessionId}`);
        break;
      case 4: // Journal (Slice F)
        navigate(`/journal?videoId=${sessionId}`);
        break;
      default:
        break;
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "linear-gradient(160deg, #0f172a 0%, #1e1b4b 100%)" }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-white/10">
        <button onClick={goBack} className="text-white/60 hover:text-white transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-white font-bold text-lg">Learning Session</h1>
          {videoData && <p className="text-white/40 text-xs">{videoData.title}</p>}
        </div>
      </div>

      {/* Steps Progress */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12 max-w-2xl mx-auto w-full">
        {/* Vertical timeline */}
        <div className="space-y-6 w-full">
          {steps.map((step, idx) => {
            const Icon = step.icon;
            const isCompleted = completedSteps.has(idx);
            const isCurrent = currentStep === idx;

            return (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
              >
                <button
                  onClick={() => {
                    setCurrentStep(idx);
                    handleStepClick(idx);
                  }}
                  className="w-full group relative"
                >
                  {/* Connecting line (hidden on last) */}
                  {idx < steps.length - 1 && (
                    <div
                      className="absolute left-8 top-16 w-1 h-12 -ml-0.5 opacity-20"
                      style={{ background: step.color }}
                    />
                  )}

                  {/* Card */}
                  <motion.div
                    whileHover={{ scale: 1.02, x: 8 }}
                    className="relative flex items-center gap-4 p-4 rounded-xl border transition-all duration-200"
                    style={{
                      background: isCurrent
                        ? `${step.color}20`
                        : isCompleted
                          ? `${step.color}10`
                          : "rgba(255,255,255,0.05)",
                      borderColor: isCurrent
                        ? step.color
                        : isCompleted
                          ? `${step.color}60`
                          : "rgba(255,255,255,0.1)",
                    }}
                  >
                    {/* Icon circle */}
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 relative"
                      style={{
                        background: isCompleted
                          ? step.color
                          : isCurrent
                            ? `${step.color}40`
                            : "rgba(255,255,255,0.05)",
                      }}
                    >
                      {isCompleted ? (
                        <CheckCircle className="w-6 h-6 text-white" />
                      ) : (
                        <Icon className="w-6 h-6" style={{ color: step.color }} />
                      )}
                    </div>

                    {/* Text */}
                    <div className="flex-1 text-left">
                      <p className="font-bold" style={{ color: step.color }}>
                        Step {idx + 1}: {step.label}
                      </p>
                      <p className="text-white/40 text-sm">{step.description}</p>
                    </div>

                    {/* Status badge */}
                    <div className="flex-shrink-0">
                      {isCompleted ? (
                        <span
                          className="text-xs font-bold px-3 py-1 rounded-full text-white"
                          style={{ background: step.color }}
                        >
                          Done
                        </span>
                      ) : isCurrent ? (
                        <span
                          className="text-xs font-bold px-3 py-1 rounded-full text-white animate-pulse"
                          style={{ background: step.color }}
                        >
                          Now
                        </span>
                      ) : (
                        <span className="text-xs font-bold px-3 py-1 rounded-full text-white/40 bg-white/5">
                          Upcoming
                        </span>
                      )}
                    </div>
                  </motion.div>
                </button>
              </motion.div>
            );
          })}
        </div>

        {/* Info box */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-12 w-full max-w-md text-center space-y-3 bg-white/5 border border-white/10 rounded-xl p-6"
        >
          <p className="text-white/60 text-sm">
            Complete all steps to master this lesson. You can go back and repeat any step anytime.
          </p>
          <div className="text-white/40 text-xs">
            {completedSteps.size} / {steps.length} completed
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export default function SessionFlowPage() {
  return (
    <Suspense fallback={null}>
      <SessionFlowInner />
    </Suspense>
  );
}
