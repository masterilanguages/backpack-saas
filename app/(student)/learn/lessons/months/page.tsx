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
import GameHeader from "@/components/home/GameHeader";
import QuickAddWordWidget from "@/components/QuickAddWordWidget";

const months = [
  { hebrew: "ינואר", transliteration: "yanuar", meaning: "January", emoji: "❄️" },
  { hebrew: "פברואר", transliteration: "februar", meaning: "February", emoji: "💕" },
  { hebrew: "מרץ", transliteration: "merts", meaning: "March", emoji: "🌱" },
  { hebrew: "אפריל", transliteration: "april", meaning: "April", emoji: "🌸" },
  { hebrew: "מאי", transliteration: "mai", meaning: "May", emoji: "🌺" },
  { hebrew: "יוני", transliteration: "yuni", meaning: "June", emoji: "☀️" },
  { hebrew: "יולי", transliteration: "yuli", meaning: "July", emoji: "🏖️" },
  { hebrew: "אוגוסט", transliteration: "ogust", meaning: "August", emoji: "🌻" },
  { hebrew: "ספטמבר", transliteration: "september", meaning: "September", emoji: "🍂" },
  { hebrew: "אוקטובר", transliteration: "oktober", meaning: "October", emoji: "🎃" },
  { hebrew: "נובמבר", transliteration: "november", meaning: "November", emoji: "🍁" },
  { hebrew: "דצמבר", transliteration: "detsember", meaning: "December", emoji: "🎄" },
];

export default function MonthsLesson() {
  const [selectedMonth, setSelectedMonth] = useState<any>(null);
  const [monthRatings, setMonthRatings] = useState<any>({});
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
      const existing = await base44.entities.LessonProgress.filter({ lesson_name: "MonthsLesson", created_by: me.email });
      if (existing.length > 0) {
        return base44.entities.LessonProgress.update(existing[0].id, { completed: true });
      }
      return base44.entities.LessonProgress.create({ lesson_name: "MonthsLesson", completed: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lessonProgress'] });
      toast.success("Months lesson completed! ✓");
    },
    onError: (e: any) => { console.error("MonthsLesson completeLessonMutation", e); toast.error("Couldn't save lesson progress"); }
  });

  const handleRating = async (month: any, rating: number) => {
    setMonthRatings((prev: any) => ({ ...prev, [month.meaning]: rating }));

    await createWordMutation.mutateAsync({
      word: month.hebrew,
      translation: month.meaning,
      phonetic: month.transliteration,
      category: "wordbank",
      times_practiced: rating,
      mastered: rating >= 5,
    });

    toast.success(`Saved "${month.meaning}" with rating ${rating}!`);

    const newRatings = { ...monthRatings, [month.meaning]: rating };
    if (Object.keys(newRatings).length === months.length) {
      completeLessonMutation.mutate();
    }
  };

  const ratedCount = Object.keys(monthRatings).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <GameHeader profile={userProfile} coins={userCoins?.coins} onBuyCoins={() => {}} />

      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center gap-4 mb-6">
          <Link to="/home" className="text-white/60 hover:text-white">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-white">🗓️ Months of the Year</h1>
            <p className="text-white/60">Tap a month to see Hebrew • Rate 1-5 to save</p>
          </div>
        </div>

        {/* Progress */}
        <div className="mb-6">
          <div className="flex justify-between text-white/60 text-sm mb-2">
            <span>{ratedCount} of {months.length} rated</span>
            {ratedCount === months.length && (
              <span className="text-green-400 flex items-center gap-1">
                <CheckCircle className="w-4 h-4" /> Complete!
              </span>
            )}
          </div>
          <div className="bg-white/10 rounded-full h-2 overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-cyan-500 to-purple-500"
              initial={{ width: 0 }}
              animate={{ width: `${(ratedCount / months.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Months Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {months.map((month, idx) => {
            const isExpanded = selectedMonth?.meaning === month.meaning;
            const isRated = monthRatings[month.meaning] !== undefined;
            const rating = monthRatings[month.meaning];

            return (
              <motion.div
                key={month.meaning}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.03 }}
                onClick={() => setSelectedMonth(isExpanded ? null : month)}
                className={`relative rounded-2xl p-4 border-2 cursor-pointer transition-all min-h-[120px] flex flex-col ${
                  isRated
                    ? "border-green-500/50 bg-green-500/10"
                    : isExpanded
                      ? "border-cyan-400 bg-white/10"
                      : "border-white/10 bg-white/5 hover:border-cyan-400/50"
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">{month.emoji}</span>
                  <p className="text-white font-bold">{month.meaning}</p>
                </div>

                {isExpanded ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex-1 flex flex-col"
                  >
                    <p className="text-cyan-400 text-xl font-bold" dir="rtl">{month.hebrew}</p>
                    <p className="text-white/60 text-sm mb-2">{month.transliteration}</p>

                    {/* Rating buttons */}
                    <div className="flex gap-1 justify-center mt-auto">
                      {[1, 2, 3, 4, 5].map((num) => (
                        <button
                          key={num}
                          onClick={(e) => { e.stopPropagation(); handleRating(month, num); }}
                          className={`w-7 h-7 rounded text-xs font-bold transition-all ${
                            rating === num
                              ? num === 5 ? "bg-green-500 text-white" : "bg-cyan-500 text-white"
                              : "bg-white/20 text-white hover:bg-white/30"
                          }`}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                ) : (
                  <div className="flex-1" />
                )}

                {isRated && !isExpanded && (
                  <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center text-white text-xs font-bold">
                    {rating}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Tip */}
        <p className="text-center text-white/40 text-sm mt-6">
          💡 Hebrew months are similar to English - they're borrowed from the Gregorian calendar
        </p>
      </div>

      <QuickAddWordWidget />
    </div>
  );
}
