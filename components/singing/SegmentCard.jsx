"use client";

import React from "react";
import { motion } from "framer-motion";
import { Check, Play } from "lucide-react";

export default function SegmentCard({ segment, isActive, isCompleted, showHebrew, showTranslit, phase, onClick }) {
  const phaseLabel = {
    listen: "Listen",
    your_turn_1: "Your Turn",
    model: "Hebrew Line",
    your_turn_2: "Repeat",
    review: "Review",
  }[phase] || "";

  return (
    <motion.div
      layout
      onClick={onClick}
      className={`rounded-2xl p-4 cursor-pointer transition-all border ${
        isActive
          ? "border-amber-300 shadow-md"
          : isCompleted
          ? "border-green-200 bg-green-50/50"
          : "border-stone-200 bg-white/60 hover:bg-white/80"
      }`}
      style={isActive ? { background: "linear-gradient(135deg, #fef3c7, #fde68a30)" } : {}}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
              style={{ background: isActive ? "#f59e0b20" : "#5a6b5a15", color: isActive ? "#b45309" : "#6b7c5a" }}>
              {segment.section_type}
            </span>
            {isActive && phaseLabel && (
              <span className="text-[10px] font-bold text-amber-600 animate-pulse">{phaseLabel}</span>
            )}
          </div>
          <p className="text-stone-700 font-medium text-sm leading-snug">{segment.english_line}</p>
          {(showHebrew || isCompleted) && segment.hebrew_line && (
            <p className="text-amber-800 font-bold text-base mt-1 leading-snug" dir="rtl">{segment.hebrew_line}</p>
          )}
          {(showTranslit || isCompleted) && segment.transliteration && (
            <p className="text-stone-500 text-xs mt-0.5 italic">{segment.transliteration}</p>
          )}
        </div>
        <div className="flex-shrink-0">
          {isCompleted ? (
            <div className="w-7 h-7 rounded-full bg-green-500 flex items-center justify-center">
              <Check className="w-4 h-4 text-white" />
            </div>
          ) : (
            <div className="w-7 h-7 rounded-full border-2 border-stone-200 flex items-center justify-center">
              <Play className="w-3 h-3 text-stone-300 ml-0.5" />
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
