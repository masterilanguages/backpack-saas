"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const motivationalMessages = [
  "You're doing great! 🎉",
  "Keep learning! 💪",
  "Almost there! 🌟",
  "You've got this! 🔥",
  "Amazing progress! ✨",
  "One word at a time! 📚",
  "Practice makes perfect! 🎯",
  "You're a star! ⭐",
];

export default function ParrotMascot({ size = "md", message, className = "", interactive = true }) {
  const [currentMessage, setCurrentMessage] = useState(message);
  const [isHovered, setIsHovered] = useState(false);
  const [isTalking, setIsTalking] = useState(false);

  const sizes = {
    sm: "w-14 h-14",
    md: "w-24 h-24",
    lg: "w-36 h-36",
  };

  useEffect(() => {
    setCurrentMessage(message);
  }, [message]);

  const handleClick = () => {
    if (!interactive) return;
    const randomMsg = motivationalMessages[Math.floor(Math.random() * motivationalMessages.length)];
    setCurrentMessage(randomMsg);
    setIsTalking(true);
    setTimeout(() => setIsTalking(false), 500);
  };

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <AnimatePresence mode="wait">
        {currentMessage && (
          <motion.div
            key={currentMessage}
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.9 }}
            className="bg-gradient-to-r from-violet-500 to-blue-500 px-4 py-2 rounded-2xl shadow-lg text-sm text-white max-w-52 text-center relative font-medium"
          >
            {currentMessage}
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-3 h-3 bg-violet-500 rotate-45" />
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        className={`${sizes[size]} cursor-pointer relative`}
        onClick={handleClick}
        onHoverStart={() => setIsHovered(true)}
        onHoverEnd={() => setIsHovered(false)}
        animate={{
          scale: isHovered ? 1.1 : 1,
          y: isHovered ? -5 : 0,
        }}
        transition={{ type: "spring", stiffness: 400, damping: 17 }}
      >
        {/* Glow effect */}
        <motion.div
          className="absolute inset-0 rounded-full bg-gradient-to-r from-green-400 to-yellow-400 blur-xl opacity-30"
          animate={{ scale: [1, 1.2, 1], opacity: [0.2, 0.4, 0.2] }}
          transition={{ repeat: Infinity, duration: 2 }}
        />

        <motion.svg
          viewBox="0 0 100 100"
          className="w-full h-full relative z-10 drop-shadow-lg"
          animate={{ rotate: [-2, 2, -2] }}
          transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
        >
          {/* Background circle */}
          <circle cx="50" cy="50" r="48" fill="url(#bgGradient)" />

          {/* Body - colorful gradient like the reference */}
          <motion.ellipse
            cx="50"
            cy="62"
            rx="22"
            ry="28"
            fill="url(#bodyGradient)"
            animate={{ scaleY: [1, 1.02, 1] }}
            transition={{ repeat: Infinity, duration: 0.8 }}
          />

          {/* Red vest/chest */}
          <ellipse cx="50" cy="70" rx="14" ry="16" fill="url(#vestGradient)" />

          {/* Wing left */}
          <motion.path
            d="M 28 55 Q 18 60 22 78 Q 32 72 34 58 Z"
            fill="url(#wingGradient)"
            animate={{ rotate: isHovered ? [-5, 5, -5] : 0 }}
            transition={{ repeat: Infinity, duration: 0.3 }}
            style={{ transformOrigin: "34px 58px" }}
          />

          {/* Wing right */}
          <motion.path
            d="M 72 55 Q 82 60 78 78 Q 68 72 66 58 Z"
            fill="url(#wingGradient)"
            animate={{ rotate: isHovered ? [5, -5, 5] : 0 }}
            transition={{ repeat: Infinity, duration: 0.3 }}
            style={{ transformOrigin: "66px 58px" }}
          />

          {/* Head - bright green/yellow */}
          <circle cx="50" cy="32" r="20" fill="url(#headGradient)" />

          {/* Green crest feathers */}
          <motion.g
            animate={{ rotate: [-3, 3, -3] }}
            transition={{ repeat: Infinity, duration: 0.5 }}
            style={{ transformOrigin: "50px 15px" }}
          >
            <ellipse cx="42" cy="14" rx="4" ry="10" fill="#7CB342" />
            <ellipse cx="50" cy="11" rx="4" ry="12" fill="#8BC34A" />
            <ellipse cx="58" cy="14" rx="4" ry="10" fill="#9CCC65" />
          </motion.g>

          {/* Face - yellow/orange cheeks */}
          <circle cx="38" cy="35" r="6" fill="#FFEB3B" opacity="0.6" />
          <circle cx="62" cy="35" r="6" fill="#FFEB3B" opacity="0.6" />

          {/* Eyes - big and expressive */}
          <ellipse cx="42" cy="30" rx="7" ry="8" fill="white" />
          <ellipse cx="58" cy="30" rx="7" ry="8" fill="white" />

          {/* Pupils */}
          <motion.circle
            cx="43"
            cy="30"
            r="4"
            fill="#1a1a2e"
            animate={{ cx: isHovered ? [43, 45, 43] : 43 }}
            transition={{ repeat: Infinity, duration: 0.5 }}
          />
          <motion.circle
            cx="57"
            cy="30"
            r="4"
            fill="#1a1a2e"
            animate={{ cx: isHovered ? [57, 55, 57] : 57 }}
            transition={{ repeat: Infinity, duration: 0.5 }}
          />

          {/* Eye sparkles */}
          <circle cx="45" cy="28" r="2" fill="white" />
          <circle cx="59" cy="28" r="2" fill="white" />

          {/* Beak - large orange/red */}
          <motion.path
            d="M 50 38 Q 40 42 45 50 L 50 48 L 55 50 Q 60 42 50 38 Z"
            fill="url(#beakGradient)"
            animate={{ scaleY: isTalking ? [1, 1.2, 1] : 1 }}
            transition={{ repeat: isTalking ? Infinity : 0, duration: 0.15 }}
            style={{ transformOrigin: "50px 44px" }}
          />

          {/* Beak highlight */}
          <path d="M 50 39 Q 45 41 47 45" stroke="#FFCC80" strokeWidth="1" fill="none" />

          {/* Gradients */}
          <defs>
            <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#1a1a2e" />
              <stop offset="100%" stopColor="#16213e" />
            </linearGradient>
            <linearGradient id="bodyGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#26C6DA" />
              <stop offset="50%" stopColor="#00ACC1" />
              <stop offset="100%" stopColor="#0097A7" />
            </linearGradient>
            <linearGradient id="headGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#8BC34A" />
              <stop offset="50%" stopColor="#7CB342" />
              <stop offset="100%" stopColor="#689F38" />
            </linearGradient>
            <linearGradient id="wingGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#4DD0E1" />
              <stop offset="50%" stopColor="#26C6DA" />
              <stop offset="100%" stopColor="#00BCD4" />
            </linearGradient>
            <linearGradient id="vestGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#EF5350" />
              <stop offset="100%" stopColor="#C62828" />
            </linearGradient>
            <linearGradient id="beakGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#FF7043" />
              <stop offset="100%" stopColor="#E64A19" />
            </linearGradient>
          </defs>
        </motion.svg>
      </motion.div>
    </div>
  );
}
