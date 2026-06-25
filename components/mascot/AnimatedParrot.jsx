"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const reactions = [
  "dance",
  "jump",
  "spin",
  "wave",
  "celebrate",
  "nod",
  "bounce",
  "wiggle",
];

const messages = [
  "Great job! 🎉",
  "You're amazing! ⭐",
  "Keep it up! 💪",
  "Fantastic! 🔥",
  "Wonderful! ✨",
  "Brilliant! 🌟",
  "Awesome! 🚀",
  "Perfect! 💯",
];

export default function AnimatedParrot({
  trigger = 0,
  size = "md",
  showMessage = true,
  className = ""
}) {
  const [currentReaction, setCurrentReaction] = useState("idle");
  const [message, setMessage] = useState("");
  const [isAnimating, setIsAnimating] = useState(false);

  const sizes = {
    sm: { container: "w-16 h-16", parrot: 64 },
    md: { container: "w-24 h-24", parrot: 96 },
    lg: { container: "w-32 h-32", parrot: 128 },
  };

  useEffect(() => {
    if (trigger > 0) {
      const randomReaction = reactions[Math.floor(Math.random() * reactions.length)];
      const randomMessage = messages[Math.floor(Math.random() * messages.length)];
      setCurrentReaction(randomReaction);
      setMessage(randomMessage);
      setIsAnimating(true);

      const timer = setTimeout(() => {
        setCurrentReaction("idle");
        setIsAnimating(false);
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [trigger]);

  const getAnimationVariants = () => {
    switch (currentReaction) {
      case "dance":
        return {
          animate: {
            rotate: [-10, 10, -10, 10, 0],
            y: [0, -10, 0, -10, 0],
            transition: { duration: 0.8, repeat: 2 }
          }
        };
      case "jump":
        return {
          animate: {
            y: [0, -30, 0],
            scale: [1, 1.1, 1],
            transition: { duration: 0.5, repeat: 3 }
          }
        };
      case "spin":
        return {
          animate: {
            rotate: [0, 360],
            scale: [1, 1.2, 1],
            transition: { duration: 0.6, repeat: 2 }
          }
        };
      case "wave":
        return {
          animate: {
            rotate: [-5, 5, -5, 5, 0],
            x: [-5, 5, -5, 5, 0],
            transition: { duration: 0.4, repeat: 3 }
          }
        };
      case "celebrate":
        return {
          animate: {
            scale: [1, 1.3, 1, 1.3, 1],
            rotate: [0, -10, 10, -10, 0],
            y: [0, -20, 0, -20, 0],
            transition: { duration: 1, repeat: 1 }
          }
        };
      case "nod":
        return {
          animate: {
            y: [0, 5, 0, 5, 0],
            rotate: [0, 5, 0, 5, 0],
            transition: { duration: 0.3, repeat: 4 }
          }
        };
      case "bounce":
        return {
          animate: {
            y: [0, -15, 0, -15, 0, -15, 0],
            scaleY: [1, 0.9, 1.1, 0.9, 1.1, 0.9, 1],
            transition: { duration: 1.2 }
          }
        };
      case "wiggle":
        return {
          animate: {
            x: [-8, 8, -8, 8, -8, 8, 0],
            rotate: [-5, 5, -5, 5, -5, 5, 0],
            transition: { duration: 0.8 }
          }
        };
      default:
        return {
          animate: {
            y: [0, -3, 0],
            transition: { duration: 2, repeat: Infinity }
          }
        };
    }
  };

  const variants = getAnimationVariants();

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <AnimatePresence mode="wait">
        {showMessage && message && isAnimating && (
          <motion.div
            key={message}
            initial={{ opacity: 0, y: 10, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.8 }}
            className="bg-gradient-to-r from-violet-500 to-blue-500 px-4 py-2 rounded-2xl shadow-lg text-sm text-white max-w-40 text-center relative font-bold"
          >
            {message}
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-3 h-3 bg-violet-500 rotate-45" />
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        className={`${sizes[size].container} relative cursor-pointer`}
        variants={variants}
        animate="animate"
        onClick={() => {
          const randomReaction = reactions[Math.floor(Math.random() * reactions.length)];
          const randomMessage = messages[Math.floor(Math.random() * messages.length)];
          setCurrentReaction(randomReaction);
          setMessage(randomMessage);
          setIsAnimating(true);
          setTimeout(() => {
            setCurrentReaction("idle");
            setIsAnimating(false);
          }, 2000);
        }}
      >
        {/* Glow effect when animating */}
        {isAnimating && (
          <motion.div
            className="absolute inset-0 rounded-full bg-gradient-to-r from-yellow-400 via-green-400 to-blue-400 blur-xl"
            animate={{
              opacity: [0.3, 0.6, 0.3],
              scale: [1, 1.3, 1]
            }}
            transition={{ duration: 0.5, repeat: Infinity }}
          />
        )}

        {/* Sparkles when celebrating */}
        {isAnimating && (
          <>
            {[...Array(6)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-2 h-2 bg-yellow-400 rounded-full"
                initial={{
                  x: sizes[size].parrot / 2,
                  y: sizes[size].parrot / 2,
                  opacity: 1
                }}
                animate={{
                  x: sizes[size].parrot / 2 + Math.cos(i * 60 * Math.PI / 180) * 50,
                  y: sizes[size].parrot / 2 + Math.sin(i * 60 * Math.PI / 180) * 50,
                  opacity: 0,
                  scale: [1, 1.5, 0]
                }}
                transition={{ duration: 0.8, delay: i * 0.1 }}
              />
            ))}
          </>
        )}

        <motion.svg
          viewBox="0 0 100 100"
          className="w-full h-full relative z-10 drop-shadow-xl"
        >
          {/* Background circle */}
          <circle cx="50" cy="50" r="48" fill="url(#bgGradient)" />

          {/* Body - colorful gradient */}
          <motion.ellipse
            cx="50"
            cy="62"
            rx="22"
            ry="28"
            fill="url(#bodyGradient)"
            animate={isAnimating ? { scaleY: [1, 1.05, 1] } : {}}
            transition={{ duration: 0.3, repeat: isAnimating ? Infinity : 0 }}
          />

          {/* Red vest/chest */}
          <ellipse cx="50" cy="70" rx="14" ry="16" fill="url(#vestGradient)" />

          {/* Wing left */}
          <motion.path
            d="M 28 55 Q 18 60 22 78 Q 32 72 34 58 Z"
            fill="url(#wingGradient)"
            animate={isAnimating ? { rotate: [-15, 15, -15] } : {}}
            transition={{ duration: 0.2, repeat: isAnimating ? Infinity : 0 }}
            style={{ transformOrigin: "34px 58px" }}
          />

          {/* Wing right */}
          <motion.path
            d="M 72 55 Q 82 60 78 78 Q 68 72 66 58 Z"
            fill="url(#wingGradient)"
            animate={isAnimating ? { rotate: [15, -15, 15] } : {}}
            transition={{ duration: 0.2, repeat: isAnimating ? Infinity : 0 }}
            style={{ transformOrigin: "66px 58px" }}
          />

          {/* Head - bright green/yellow */}
          <circle cx="50" cy="32" r="20" fill="url(#headGradient)" />

          {/* Green crest feathers */}
          <motion.g
            animate={isAnimating ? { rotate: [-10, 10, -10] } : { rotate: [-3, 3, -3] }}
            transition={{ duration: isAnimating ? 0.2 : 0.5, repeat: Infinity }}
            style={{ transformOrigin: "50px 15px" }}
          >
            <ellipse cx="42" cy="14" rx="4" ry="10" fill="#7CB342" />
            <ellipse cx="50" cy="11" rx="4" ry="12" fill="#8BC34A" />
            <ellipse cx="58" cy="14" rx="4" ry="10" fill="#9CCC65" />
          </motion.g>

          {/* Face - yellow/orange cheeks */}
          <motion.circle
            cx="38" cy="35" r="6" fill="#FFEB3B" opacity="0.6"
            animate={isAnimating ? { r: [6, 7, 6] } : {}}
            transition={{ duration: 0.3, repeat: isAnimating ? Infinity : 0 }}
          />
          <motion.circle
            cx="62" cy="35" r="6" fill="#FFEB3B" opacity="0.6"
            animate={isAnimating ? { r: [6, 7, 6] } : {}}
            transition={{ duration: 0.3, repeat: isAnimating ? Infinity : 0 }}
          />

          {/* Eyes - big and expressive */}
          <ellipse cx="42" cy="30" rx="7" ry="8" fill="white" />
          <ellipse cx="58" cy="30" rx="7" ry="8" fill="white" />

          {/* Pupils - animated */}
          <motion.circle
            cx="43"
            cy="30"
            r="4"
            fill="#1a1a2e"
            animate={isAnimating ? {
              cx: [43, 45, 41, 43],
              cy: [30, 28, 32, 30]
            } : {}}
            transition={{ duration: 0.5, repeat: isAnimating ? Infinity : 0 }}
          />
          <motion.circle
            cx="57"
            cy="30"
            r="4"
            fill="#1a1a2e"
            animate={isAnimating ? {
              cx: [57, 59, 55, 57],
              cy: [30, 28, 32, 30]
            } : {}}
            transition={{ duration: 0.5, repeat: isAnimating ? Infinity : 0 }}
          />

          {/* Eye sparkles */}
          <circle cx="45" cy="28" r="2" fill="white" />
          <circle cx="59" cy="28" r="2" fill="white" />

          {/* Beak - animated when celebrating */}
          <motion.path
            d="M 50 38 Q 40 42 45 50 L 50 48 L 55 50 Q 60 42 50 38 Z"
            fill="url(#beakGradient)"
            animate={isAnimating ? { scaleY: [1, 1.3, 1] } : {}}
            transition={{ duration: 0.15, repeat: isAnimating ? Infinity : 0 }}
            style={{ transformOrigin: "50px 44px" }}
          />

          {/* Beak highlight */}
          <path d="M 50 39 Q 45 41 47 45" stroke="#FFCC80" strokeWidth="1" fill="none" />

          {/* Feet - only visible when jumping */}
          {currentReaction === "jump" && (
            <>
              <motion.ellipse
                cx="42" cy="92" rx="6" ry="3"
                fill="#FF7043"
                animate={{ scaleX: [1, 1.3, 1] }}
                transition={{ duration: 0.3, repeat: Infinity }}
              />
              <motion.ellipse
                cx="58" cy="92" rx="6" ry="3"
                fill="#FF7043"
                animate={{ scaleX: [1, 1.3, 1] }}
                transition={{ duration: 0.3, repeat: Infinity }}
              />
            </>
          )}

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
