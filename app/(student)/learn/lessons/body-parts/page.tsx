"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle } from "lucide-react";
import { Link, useNavigate, createPageUrl } from "@/lib/router-compat";
import { base44 as base44Client } from "@/api/base44Client";
const base44: any = base44Client;
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "sonner";
import GameHeader from "@/components/home/GameHeader";
import QuickAddWordWidget from "@/components/QuickAddWordWidget";

const bodyParts = [
  { id: "head", hebrew: "ראש", transliteration: "rosh", meaning: "head", top: "5%", left: "50%" },
  { id: "hair", hebrew: "שיער", transliteration: "se'ar", meaning: "hair", top: "2%", left: "50%" },
  { id: "eye", hebrew: "עין", transliteration: "ayin", meaning: "eye", top: "12%", left: "45%" },
  { id: "eyes", hebrew: "עיניים", transliteration: "einayim", meaning: "eyes", top: "12%", left: "55%" },
  { id: "ear", hebrew: "אוזן", transliteration: "ozen", meaning: "ear", top: "12%", left: "38%" },
  { id: "nose", hebrew: "אף", transliteration: "af", meaning: "nose", top: "16%", left: "50%" },
  { id: "mouth", hebrew: "פה", transliteration: "peh", meaning: "mouth", top: "20%", left: "50%" },
  { id: "neck", hebrew: "צוואר", transliteration: "tzavar", meaning: "neck", top: "26%", left: "50%" },
  { id: "shoulder", hebrew: "כתף", transliteration: "katef", meaning: "shoulder", top: "30%", left: "35%" },
  { id: "arm", hebrew: "יד", transliteration: "yad", meaning: "arm", top: "42%", left: "25%" },
  { id: "hand", hebrew: "כף יד", transliteration: "kaf yad", meaning: "hand", top: "55%", left: "20%" },
  { id: "finger", hebrew: "אצבע", transliteration: "etzba", meaning: "finger", top: "60%", left: "18%" },
  { id: "chest", hebrew: "חזה", transliteration: "chazeh", meaning: "chest", top: "35%", left: "50%" },
  { id: "heart", hebrew: "לב", transliteration: "lev", meaning: "heart", top: "38%", left: "45%" },
  { id: "stomach", hebrew: "בטן", transliteration: "beten", meaning: "stomach", top: "48%", left: "50%" },
  { id: "back", hebrew: "גב", transliteration: "gav", meaning: "back", top: "40%", left: "58%" },
  { id: "leg", hebrew: "רגל", transliteration: "regel", meaning: "leg", top: "70%", left: "45%" },
  { id: "knee", hebrew: "ברך", transliteration: "berech", meaning: "knee", top: "75%", left: "45%" },
  { id: "foot", hebrew: "כף רגל", transliteration: "kaf regel", meaning: "foot", top: "92%", left: "45%" },
];

export default function BodyPartsLesson() {
  const [clickedParts, setClickedParts] = useState<any>({});
  const [partRatings, setPartRatings] = useState<any>({});
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
      const existing = await base44.entities.LessonProgress.filter({ lesson_name: "BodyPartsLesson", created_by: me.email });
      if (existing.length > 0) {
        return base44.entities.LessonProgress.update(existing[0].id, { completed: true });
      }
      return base44.entities.LessonProgress.create({ lesson_name: "BodyPartsLesson", completed: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lessonProgress'] });
      toast.success("Body parts lesson completed! ✓");
    },
    onError: (e: any) => { console.error("BodyPartsLesson completeLessonMutation", e); toast.error("Couldn't save lesson progress"); }
  });

  const handlePartClick = (part: any) => {
    setClickedParts((prev: any) => ({
      ...prev,
      [part.id]: !prev[part.id]
    }));
  };

  const handleRating = async (part: any, rating: number) => {
    setPartRatings((prev: any) => ({ ...prev, [part.id]: rating }));

    await createWordMutation.mutateAsync({
      word: part.hebrew,
      translation: part.meaning,
      phonetic: part.transliteration,
      category: "wordbank",
      times_practiced: rating,
      mastered: rating >= 5,
    });

    toast.success(`Saved "${part.meaning}" with rating ${rating}!`);

    const newRatings = { ...partRatings, [part.id]: rating };
    if (Object.keys(newRatings).length === bodyParts.length) {
      completeLessonMutation.mutate();
    }
  };

  const ratedCount = Object.keys(partRatings).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <GameHeader profile={userProfile} coins={userCoins?.coins} onBuyCoins={() => {}} />

      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center gap-4 mb-6">
          <Link to="/home" className="text-white/60 hover:text-white">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-white">🦵 Body Parts</h1>
            <p className="text-white/60">Click body parts to see Hebrew • Rate 1-5 to save</p>
          </div>
        </div>

        {/* Progress */}
        <div className="mb-6">
          <div className="flex justify-between text-white/60 text-sm mb-2">
            <span>{ratedCount} of {bodyParts.length} rated</span>
            {ratedCount === bodyParts.length && (
              <span className="text-green-400 flex items-center gap-1">
                <CheckCircle className="w-4 h-4" /> Complete!
              </span>
            )}
          </div>
          <div className="bg-white/10 rounded-full h-2 overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-cyan-500 to-purple-500"
              initial={{ width: 0 }}
              animate={{ width: `${(ratedCount / bodyParts.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Body Diagram */}
        <div className="relative w-full max-w-md mx-auto aspect-[1/2] bg-white/5 rounded-3xl border border-white/10 overflow-hidden">
          {/* Body silhouette */}
          <div className="absolute inset-0 flex items-center justify-center opacity-20">
            <svg viewBox="0 0 100 200" className="h-full w-auto fill-white">
              {/* Head */}
              <circle cx="50" cy="20" r="15" />
              {/* Neck */}
              <rect x="45" y="35" width="10" height="10" />
              {/* Torso */}
              <ellipse cx="50" cy="70" rx="20" ry="30" />
              {/* Arms */}
              <rect x="15" y="45" width="10" height="40" rx="5" />
              <rect x="75" y="45" width="10" height="40" rx="5" />
              {/* Hands */}
              <circle cx="20" cy="90" r="6" />
              <circle cx="80" cy="90" r="6" />
              {/* Legs */}
              <rect x="35" y="100" width="12" height="50" rx="5" />
              <rect x="53" y="100" width="12" height="50" rx="5" />
              {/* Feet */}
              <ellipse cx="41" cy="155" rx="8" ry="5" />
              <ellipse cx="59" cy="155" rx="8" ry="5" />
            </svg>
          </div>

          {/* Clickable body parts */}
          {bodyParts.map((part) => {
            const isClicked = clickedParts[part.id];
            const isRated = partRatings[part.id] !== undefined;
            const rating = partRatings[part.id];

            return (
              <div
                key={part.id}
                className="absolute transform -translate-x-1/2 -translate-y-1/2 z-10"
                style={{ top: part.top, left: part.left }}
              >
                <motion.button
                  onClick={() => handlePartClick(part)}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  className={`relative px-2 py-1 rounded-lg text-xs font-bold transition-all ${
                    isClicked
                      ? "bg-cyan-500 text-white shadow-lg shadow-cyan-500/50"
                      : isRated
                        ? "bg-green-500/80 text-white"
                        : "bg-white/20 text-white hover:bg-white/30"
                  }`}
                >
                  {isClicked ? (
                    <span dir="rtl">{part.hebrew}</span>
                  ) : (
                    <span className="capitalize">{part.meaning}</span>
                  )}
                  {isRated && !isClicked && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-green-500 text-[10px] flex items-center justify-center">
                      {rating}
                    </span>
                  )}
                </motion.button>

                {/* Rating popup */}
                {isClicked && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-slate-800 rounded-xl p-2 shadow-xl border border-white/20 z-20 whitespace-nowrap"
                  >
                    <p className="text-white/60 text-[10px] mb-1 text-center">{part.transliteration}</p>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((num) => (
                        <button
                          key={num}
                          onClick={(e) => { e.stopPropagation(); handleRating(part, num); }}
                          className={`w-6 h-6 rounded text-xs font-bold transition-all ${
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
                )}
              </div>
            );
          })}
        </div>

        {/* Instructions */}
        <p className="text-center text-white/40 text-sm mt-4">
          Tap English words to reveal Hebrew • Rate to save to backpack
        </p>
      </div>

      <QuickAddWordWidget />
    </div>
  );
}
