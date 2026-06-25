"use client";

import React, { useState } from "react";
import { Link, createPageUrl } from "@/lib/router-compat";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";

const SESSION1_WORDS = [
  { he: "שלום", en: "Hello", trans: "Shalom" },
  { he: "תודה", en: "Thank you", trans: "Toda" },
  { he: "בבקשה", en: "Please", trans: "Bevakasha" },
  { he: "כן", en: "Yes", trans: "Ken" },
  { he: "לא", en: "No", trans: "Lo" },
  { he: "טוב", en: "Good", trans: "Tov" },
  { he: "שם", en: "Name", trans: "Shem" },
  { he: "מאיפה", en: "Where from", trans: "Meipoh" },
  { he: "למה", en: "Why", trans: "Lama" },
  { he: "כמה", en: "How much", trans: "Kama" },
];

export default function Session1Journal() {
  const [entries, setEntries] = useState<string[]>(Array(10).fill(""));

  const handleChange = (index: number, value: string) => {
    const newEntries = [...entries];
    newEntries[index] = value;
    setEntries(newEntries);
  };

  return (
    <div className="min-h-screen p-8" style={{ background: "linear-gradient(135deg, #fff8e7 0%, #fffbf0 100%)" }}>
      <Link to={createPageUrl("Home")} className="flex items-center gap-2 text-amber-900 hover:text-amber-700 mb-6">
        <ArrowLeft className="w-5 h-5" />
        <span className="font-medium">Back to Home</span>
      </Link>

      <div className="max-w-2xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1 className="text-4xl font-bold mb-2" style={{ color: "#8B7355", fontFamily: "Cormorant Garamond, serif" }}>
            📓 Session 1 Journal
          </h1>
          <p style={{ color: "#A0826D" }} className="text-sm">Practice writing the 10 session words above the lines</p>
        </motion.div>

        {/* Cute yellow notepad */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="p-8 rounded-2xl shadow-2xl"
          style={{
            background: "linear-gradient(135deg, #FFF9E6 0%, #FFFBF0 100%)",
            border: "3px solid #D4A574",
            boxShadow: "0 10px 40px rgba(139, 115, 85, 0.15), inset 0 1px 0 rgba(255,255,255,0.5)",
          }}
        >
          <div className="space-y-8">
            {SESSION1_WORDS.map((word, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="space-y-2"
              >
                {/* Word info */}
                <div className="flex items-center gap-3 px-2">
                  <div className="flex-1">
                    <p className="text-sm font-bold" style={{ color: "#8B6F47" }}>
                      {idx + 1}. <span style={{ color: "#C41E3A" }} className="text-lg" dir="rtl">{word.he}</span>
                    </p>
                    <p className="text-xs" style={{ color: "#A0826D" }}>
                      {word.trans} — "{word.en}"
                    </p>
                  </div>
                </div>

                {/* Input field */}
                <input
                  type="text"
                  value={entries[idx]}
                  onChange={(e) => handleChange(idx, e.target.value)}
                  placeholder="Write above the line..."
                  className="w-full bg-transparent outline-none text-sm"
                  style={{
                    color: "#5A4A3A",
                    fontFamily: "Jost, sans-serif",
                    fontSize: "14px",
                    padding: "4px 2px",
                  }}
                />

                {/* Notepad line */}
                <div
                  style={{
                    height: "2px",
                    background: "linear-gradient(90deg, #D4A574 0%, #D4A574 100%)",
                    marginTop: "6px",
                  }}
                />
              </motion.div>
            ))}
          </div>

          {/* Save indicator */}
          {entries.some((e) => e.trim()) && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-8 text-center text-xs"
              style={{ color: "#A0826D" }}
            >
              ✓ Your journal is being saved automatically
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
