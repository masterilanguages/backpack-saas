"use client";

import React, { useState, useEffect } from "react";
import { base44 as base44Client } from "@/api/base44Client";
const base44: any = base44Client;
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Volume2, Play, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { Link, createPageUrl } from "@/lib/router-compat";
import SoundWave from "@/components/practice/SoundWave";
import GameHeader from "@/components/dashboard/GameHeader";
import ClickableWord from "@/components/learning/ClickableWord";

export default function Sentences() {
  const [mode, setMode] = useState("list");
  const [currentIndex, setCurrentIndex] = useState(0);
  const queryClient = useQueryClient();
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
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

  const { data: sentences = [], isLoading } = useQuery({
    queryKey: ['sentences'],
    queryFn: () => base44.entities.Word.filter({ category: "sentences" }, "-created_date"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: any) => base44.entities.Word.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sentences'] });
    },
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, approved }: any) => base44.entities.Word.update(id, {
      approved,
      approved_by: approved ? currentUser?.email : null,
      approved_at: approved ? new Date().toISOString() : null,
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sentences'] }),
  });

  const isAdmin = currentUser?.role === 'admin';

  const handleRate = async (id: any, rating: number) => {
    await updateMutation.mutateAsync({
      id,
      data: { times_practiced: rating, mastered: rating >= 5 },
    });
  };

  const playAudio = (sentence: any) => {
    if (sentence.audio_url) {
      const audio = new Audio(sentence.audio_url);
      audio.play();
    }
  };

  const startFlashcards = () => {
    setCurrentIndex(0);
    setMode("flashcards");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <SoundWave isPlaying={true} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <GameHeader profile={userProfile} coins={userCoins?.coins} onBuyCoins={() => {}} />

      <div className="max-w-4xl mx-auto px-4 py-6">
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="mb-8"
        >
          <div className="flex items-center gap-4 mb-6">
            <Link to="/home" className="text-white/60 hover:text-white">
              <ArrowLeft className="w-6 h-6" />
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-white">Sentences</h1>
              <p className="text-white/60">Practice full sentences and phrases</p>
            </div>
          </div>
        </motion.div>

        {sentences.length === 0 ? (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-center py-20"
          >
            <p className="text-white/60">No sentences yet! Add some from Practice page.</p>
          </motion.div>
        ) : mode === "list" ? (
          <div>
            <div className="bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border border-white/10 rounded-2xl p-6 mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white mb-1">Ready to practice?</h2>
                  <p className="text-white/60">Test yourself with sentence flashcards</p>
                </div>
                <Button
                  onClick={startFlashcards}
                  className="bg-gradient-to-r from-cyan-500 to-purple-500 rounded-xl px-6"
                >
                  <Play className="w-4 h-4 mr-2" />
                  Start Flashcards
                </Button>
              </div>
            </div>

            <div className="space-y-6">
              {[5, 4, 3, 2, 1, 0].map(level => {
                const levelSentences = sentences.filter((s: any) => (s.times_practiced || 0) === level);
                if (levelSentences.length === 0) return null;
                const levelLabels: any = {
                  5: { label: "⭐ Mastered", bg: "bg-green-500/10", border: "border-green-500/30" },
                  4: { label: "🔥 Almost There", bg: "bg-emerald-500/10", border: "border-emerald-500/30" },
                  3: { label: "💪 Getting Better", bg: "bg-blue-500/10", border: "border-blue-500/30" },
                  2: { label: "📚 Learning", bg: "bg-violet-500/10", border: "border-violet-500/30" },
                  1: { label: "🌱 Just Started", bg: "bg-purple-500/10", border: "border-purple-500/30" },
                  0: { label: "✨ New", bg: "bg-white/5", border: "border-white/10" },
                };
                return (
                  <div key={level}>
                    <h3 className="text-sm font-semibold text-white/60 mb-3">{levelLabels[level].label} ({levelSentences.length})</h3>
                    <div className="space-y-2">
                      {levelSentences.map((sentence: any) => (
                        <motion.div
                          key={sentence.id}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className={`${levelLabels[level].bg} ${levelLabels[level].border} border rounded-2xl px-4 py-3 flex flex-col gap-1`}
                        >
                          {sentence.approved && (
                            <span className="text-[10px] text-green-400 font-semibold">✅ Approved</span>
                          )}
                          <div className="flex items-center justify-between">
                          <div className="flex-1 text-left flex items-center gap-3">
                            <ClickableWord
                              word={sentence.word}
                              transliteration={sentence.phonetic}
                              translation={sentence.translation}
                              variant="transliteration"
                              className="font-medium text-white/80"
                            />
                            <ClickableWord
                              word={sentence.word}
                              transliteration={sentence.phonetic}
                              translation={sentence.translation}
                              variant="hebrew"
                              className="text-lg font-bold text-cyan-400"
                            />
                            <span className="text-white/50 text-sm">({sentence.translation})</span>
                            {sentence.audio_url && (
                              <button onClick={() => playAudio(sentence)}>
                                <Volume2 className="w-3 h-3 text-white/40 hover:text-white" />
                              </button>
                            )}
                          </div>
                          <div className="flex gap-1 ml-2 border-l border-white/10 pl-2 items-center">
                             {[1, 2, 3, 4, 5].map(num => (
                               <button
                                 key={num}
                                 onClick={() => handleRate(sentence.id, num)}
                                 className={`w-6 h-6 rounded-full text-xs font-bold transition-all hover:scale-110 ${
                                   (sentence.times_practiced || 0) >= num
                                     ? "bg-cyan-500 text-white"
                                     : "bg-white/10 text-white/50 hover:bg-white/20"
                                 }`}
                               >
                                 {num}
                               </button>
                             ))}
                             {isAdmin && (
                               <button
                                 onClick={() => approveMutation.mutate({ id: sentence.id, approved: !sentence.approved })}
                                 disabled={approveMutation.isPending}
                                 className={`w-6 h-6 rounded-full text-xs font-bold transition-all ml-1 ${
                                   sentence.approved
                                     ? 'bg-green-500/30 hover:bg-red-500/20 text-green-400'
                                     : 'bg-white/10 hover:bg-green-500/20 text-white/40'
                                 }`}
                                 title={sentence.approved ? 'Unapprove' : 'Approve for all users'}
                               >
                                 ✅
                               </button>
                             )}
                           </div>
                          </div>
                          </motion.div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div>
            <Button
              onClick={() => setMode("list")}
              variant="outline"
              className="mb-4 border-white/20 text-white hover:bg-white/10 rounded-xl"
            >
              ← Back to Sentence List
            </Button>
            <div className="text-center text-white/60 mb-4">
              {currentIndex + 1} / {sentences.length}
            </div>
            <AnimatePresence mode="wait">
              {sentences[currentIndex] && (
                <motion.div
                  key={sentences[currentIndex].id}
                  initial={{ opacity: 0, x: 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -50 }}
                  className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 p-8 text-center"
                >
                  <div className="mb-4">
                    <ClickableWord
                      word={sentences[currentIndex].word}
                      transliteration={sentences[currentIndex].phonetic}
                      translation={sentences[currentIndex].translation}
                      variant="hebrew"
                      className="text-2xl font-bold text-cyan-400"
                    />
                  </div>
                  <p className="text-lg text-white/80 mb-2">{sentences[currentIndex].phonetic}</p>
                  <p className="text-white/60 mb-6">{sentences[currentIndex].translation}</p>
                  {sentences[currentIndex].audio_url && (
                    <Button onClick={() => playAudio(sentences[currentIndex])} variant="outline" className="mb-6 border-white/20 text-white">
                      <Volume2 className="w-4 h-4 mr-2" /> Play Audio
                    </Button>
                  )}
                  <div className="flex justify-center gap-2">
                    {[1, 2, 3, 4, 5].map(num => (
                      <button
                        key={num}
                        onClick={() => {
                          handleRate(sentences[currentIndex].id, num);
                          setCurrentIndex(prev => (prev + 1) % sentences.length);
                        }}
                        className={`w-10 h-10 rounded-full text-sm font-bold transition-all hover:scale-110 ${
                          (sentences[currentIndex].times_practiced || 0) >= num
                            ? "bg-cyan-500 text-white"
                            : "bg-white/10 text-white/50 hover:bg-white/20"
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
