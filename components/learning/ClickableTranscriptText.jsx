"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function ClickableTranscriptText({ text, onAddWord, editable, onSave, language = "en", className = "" }) {
  const [clickedWord, setClickedWord] = useState(null);
  const [editValue, setEditValue] = useState(text);
  const [isEditing, setIsEditing] = useState(false);
  const [addedWord, setAddedWord] = useState(null);

  if (editable) {
    if (isEditing) {
      return (
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => {
            if (editValue !== text) onSave(editValue);
            setIsEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (editValue !== text) onSave(editValue);
              setIsEditing(false);
            }
          }}
          className="bg-white/20 border border-cyan-400 rounded px-1 outline-none text-white w-full"
          autoFocus
        />
      );
    }
    return (
      <span onClick={() => setIsEditing(true)} className={`cursor-pointer hover:bg-white/10 rounded px-1 ${className}`}>
        {text}
      </span>
    );
  }

  const words = text.split(/(\s+)/);

  return (
    <span className={className} dir={language === "he" ? "rtl" : "ltr"}>
      {words.map((word, idx) => {
        if (!word.trim()) return <span key={idx}>{word}</span>;
        
        const isClicked = clickedWord === idx;
        
        return (
          <span key={idx} className="relative inline-block">
            <span
              onClick={() => setClickedWord(isClicked ? null : idx)}
              className="cursor-pointer hover:bg-cyan-500/20 rounded px-0.5 transition-colors"
            >
              {word}
            </span>
            <AnimatePresence>
              {isClicked && (
                <motion.button
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    const cleanWord = word.replace(/[.,!?;:]/g, '').trim();
                    onAddWord(cleanWord);
                    setAddedWord(idx);
                    setTimeout(() => {
                      setClickedWord(null);
                      setAddedWord(null);
                    }, 1000);
                  }}
                  className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg px-2 py-1 shadow-lg z-10 flex items-center gap-1 text-sm whitespace-nowrap"
                >
                  {addedWord === idx ? (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1.3 }}
                      className="text-2xl"
                    >
                      ✓
                    </motion.span>
                  ) : (
                    <>
                      <span className="text-lg">🎒</span>
                      Add
                    </>
                  )}
                </motion.button>
              )}
            </AnimatePresence>
          </span>
        );
      })}
    </span>
  );
}