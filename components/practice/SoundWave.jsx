"use client";

import React from "react";
import { motion } from "framer-motion";

export default function SoundWave({ isPlaying }) {
  const bars = Array.from({ length: 5 });

  return (
    <div className="flex items-center justify-center gap-1.5 h-12">
      {bars.map((_, index) => (
        <motion.div
          key={index}
          className="w-1.5 bg-gradient-to-t from-violet-500 to-blue-500 rounded-full"
          animate={{
            height: isPlaying ? [12, 32, 12] : 12,
          }}
          transition={{
            duration: 0.6,
            repeat: Infinity,
            delay: index * 0.1,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}
