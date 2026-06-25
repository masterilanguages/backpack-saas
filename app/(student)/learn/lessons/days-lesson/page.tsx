"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle } from "lucide-react";
import { Link, useNavigate, createPageUrl } from "@/lib/router-compat";
import { motion } from "framer-motion";
import { base44 as base44Client } from "@/api/base44Client";
const base44: any = base44Client;
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import GameHeader from "@/components/dashboard/GameHeader";
import QuickAddWordWidget from "@/components/QuickAddWordWidget";

const days = [
  { hebrew: "יום ראשון", transliteration: "yom rishon", meaning: "Sunday", number: "1st" },
  { hebrew: "יום שני", transliteration: "yom sheni", meaning: "Monday", number: "2nd" },
  { hebrew: "יום שלישי", transliteration: "yom shlishi", meaning: "Tuesday", number: "3rd" },
  { hebrew: "יום רביעי", transliteration: "yom revi'i", meaning: "Wednesday", number: "4th" },
  { hebrew: "יום חמישי", transliteration: "yom chamishi", meaning: "Thursday", number: "5th" },
  { hebrew: "יום שישי", transliteration: "yom shishi", meaning: "Friday", number: "6th" },
  { hebrew: "שבת", transliteration: "Shabbat", meaning: "Saturday", number: "7th" },
];

export default function DaysLesson() {
  const [selectedDay, setSelectedDay] = useState<any>(null);
  const [dayRatings, setDayRatings] = useState<any>({});
  const [currentUser, setCurrentUser] = useState<any>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Get current user for owner-scoped reads/writes
  React.useEffect(() => {
    const fetchUser = async () => {
      try {
        const user = await base44.auth.me();
        setCurrentUser(user);
      } catch (e) {}
    };
    fetchUser();
  }, []);

  const { data: userProfile } = useQuery({
    queryKey: ['userProfile', currentUser?.email],
    queryFn: async () => {
      if (!currentUser?.email) return null;
      const profiles = await base44.entities.UserProfile.filter({ created_by: currentUser.email });
      return profiles[0] || null;
    },
    enabled: !!currentUser?.email,
  });

  const { data: userCoins } = useQuery({
    queryKey: ['userCoins', currentUser?.email],
    queryFn: async () => {
      if (!currentUser?.email) return { coins: 0 };
      const coins = await base44.entities.UserCoins.filter({ created_by: currentUser.email });
      return coins[0] || { coins: 0 };
    },
    enabled: !!currentUser?.email,
  });

  const createWordMutation = useMutation({
    mutationFn: (wordData: any) => base44.entities.Word.create(wordData),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['wordRatings'] }),
  });

  const completeLessonMutation = useMutation({
    mutationFn: async () => {
      const me = currentUser || await base44.auth.me();
      const existing = await base44.entities.LessonProgress.filter({ lesson_name: "DaysLesson", created_by: me.email });
      if (existing.length > 0) {
        return base44.entities.LessonProgress.update(existing[0].id, { completed: true });
      }
      return base44.entities.LessonProgress.create({ lesson_name: "DaysLesson", completed: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lessonProgress'] });
      toast.success("Days lesson completed! ✓");
    },
    onError: (e: any) => { console.error("DaysLesson completeLessonMutation", e); toast.error("Couldn't save lesson progress"); }
  });

  const handleRating = async (day: any, rating: number) => {
    setDayRatings((prev: any) => ({ ...prev, [day.meaning]: rating }));

    await createWordMutation.mutateAsync({
      word: day.hebrew,
      translation: day.meaning,
      phonetic: day.transliteration,
      category: "wordbank",
      times_practiced: rating,
      mastered: rating >= 5,
    });

    toast.success(`Saved "${day.meaning}" with rating ${rating}!`);

    const newRatings = { ...dayRatings, [day.meaning]: rating };
    if (Object.keys(newRatings).length === days.length) {
      completeLessonMutation.mutate();
    }
  };

  const ratedCount = Object.keys(dayRatings).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <GameHeader profile={userProfile} coins={userCoins?.coins} onBuyCoins={() => {}} />

      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center gap-4 mb-6">
          <Link to="/home" className="text-white/60 hover:text-white">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-white">📅 Days of the Week</h1>
            <p className="text-white/60">Tap a day to see Hebrew • Rate 1-5 to save</p>
          </div>
        </div>

        {/* Progress */}
        <div className="mb-6">
          <div className="flex justify-between text-white/60 text-sm mb-2">
            <span>{ratedCount} of {days.length} rated</span>
            {ratedCount === days.length && (
              <span className="text-green-400 flex items-center gap-1">
                <CheckCircle className="w-4 h-4" /> Complete!
              </span>
            )}
          </div>
          <div className="bg-white/10 rounded-full h-2 overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-cyan-500 to-purple-500"
              initial={{ width: 0 }}
              animate={{ width: `${(ratedCount / days.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Days Grid */}
        <div className="space-y-3">
          {days.map((day, idx) => {
            const isExpanded = selectedDay?.meaning === day.meaning;
            const isRated = dayRatings[day.meaning] !== undefined;
            const rating = dayRatings[day.meaning];
            const isShabbat = day.meaning === "Saturday";

            return (
              <motion.div
                key={day.meaning}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                onClick={() => setSelectedDay(isExpanded ? null : day)}
                className={`relative rounded-2xl p-4 border-2 cursor-pointer transition-all ${
                  isRated
                    ? "border-green-500/50 bg-green-500/10"
                    : isExpanded
                      ? "border-cyan-400 bg-white/10"
                      : "border-white/10 bg-white/5 hover:border-cyan-400/50"
                } ${isShabbat ? "bg-gradient-to-r from-yellow-500/10 to-amber-500/10" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                      isShabbat
                        ? "bg-gradient-to-br from-yellow-400 to-amber-500 text-black"
                        : "bg-gradient-to-br from-violet-500 to-purple-500 text-white"
                    }`}>
                      {day.number}
                    </div>
                    <div>
                      <p className="text-white font-bold text-lg">{day.meaning}</p>
                      {isExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                        >
                          <p className="text-cyan-400 text-xl font-bold mt-1" dir="rtl">{day.hebrew}</p>
                          <p className="text-white/60 text-sm">{day.transliteration}</p>
                        </motion.div>
                      )}
                    </div>
                  </div>

                  {isRated && !isExpanded && (
                    <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white font-bold">
                      {rating}
                    </div>
                  )}
                </div>

                {/* Rating buttons */}
                {isExpanded && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex gap-2 justify-center mt-4"
                  >
                    {[1, 2, 3, 4, 5].map((num) => (
                      <button
                        key={num}
                        onClick={(e) => { e.stopPropagation(); handleRating(day, num); }}
                        className={`w-10 h-10 rounded-xl text-sm font-bold transition-all ${
                          rating === num
                            ? num === 5 ? "bg-green-500 text-white" : "bg-cyan-500 text-white"
                            : "bg-white/20 text-white hover:bg-white/30"
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Tip */}
        <p className="text-center text-white/40 text-sm mt-6">
          💡 In Hebrew, days are numbered - "yom" means "day"
        </p>
      </div>

      <QuickAddWordWidget />
    </div>
  );
}
