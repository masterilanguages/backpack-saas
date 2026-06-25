"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle, Loader2 } from "lucide-react";
import { Link, useNavigate, createPageUrl } from "@/lib/router-compat";
import { motion, AnimatePresence } from "framer-motion";
import { base44 as base44Client } from "@/api/base44Client";
const base44: any = base44Client;
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import GameHeader from "@/components/dashboard/GameHeader";
import QuickAddWordWidget from "@/components/QuickAddWordWidget";
import TranslatorWidget from "@/components/TranslatorWidget";
import { Input } from "@/components/ui/input";

const colors = [
  { hebrew: "אָדוֹם", transliteration: "adom", meaning: "red", color: "#EF4444" },
  { hebrew: "כָּחוֹל", transliteration: "kachol", meaning: "blue", color: "#3B82F6" },
  { hebrew: "יָרוֹק", transliteration: "yarok", meaning: "green", color: "#22C55E" },
  { hebrew: "צָהוֹב", transliteration: "tsahov", meaning: "yellow", color: "#EAB308" },
  { hebrew: "כָּתוֹם", transliteration: "katom", meaning: "orange", color: "#F97316" },
  { hebrew: "סָגוֹל", transliteration: "sagol", meaning: "purple", color: "#A855F7" },
  { hebrew: "וָרוֹד", transliteration: "varod", meaning: "pink", color: "#EC4899" },
  { hebrew: "לָבָן", transliteration: "lavan", meaning: "white", color: "#F3F4F6" },
  { hebrew: "שָׁחוֹר", transliteration: "shachor", meaning: "black", color: "#1F2937" },
  { hebrew: "חוּם", transliteration: "chum", meaning: "brown", color: "#92400E" },
  { hebrew: "אָפוֹר", transliteration: "afor", meaning: "gray", color: "#6B7280" },
  { hebrew: "זָהָב", transliteration: "zahav", meaning: "gold", color: "#D97706" },
];

export default function ColorsLesson() {
  const [selectedColor, setSelectedColor] = useState<any>(null);
  const [colorRatings, setColorRatings] = useState<any>({});
  const [gameMode, setGameMode] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [gameQuestions, setGameQuestions] = useState<any[]>([]);
  const [colorScores, setColorScores] = useState<any>({}); // tracks correct answers per color
  const [showResult, setShowResult] = useState<any>(null);
  const [gameComplete, setGameComplete] = useState(false);
  const [mnemonicOpen, setMnemonicOpen] = useState<any>(null); // which color has mnemonic input open
  const [mnemonicText, setMnemonicText] = useState("");
  const [mnemonicImages, setMnemonicImages] = useState<any>({}); // store generated images per color
  const [generatingImage, setGeneratingImage] = useState(false);
  const [gameCompleted, setGameCompleted] = useState(false); // track if game was completed
  const [sentences, setSentences] = useState<any>(null);
  const [loadingSentences, setLoadingSentences] = useState(false);
  const [videoWatched, setVideoWatched] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Get current user for master check
  React.useEffect(() => {
    const fetchUser = async () => {
      try {
        const user = await base44.auth.me();
        setCurrentUser(user);
      } catch (e) {}
    };
    fetchUser();
  }, []);

  const isMasterUser = currentUser?.role === 'admin';

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

  const { data: progress } = useQuery({
    queryKey: ['lessonProgress', 'ColorsLesson', currentUser?.email],
    queryFn: async () => {
      if (!currentUser?.email) return [];
      return base44.entities.LessonProgress.filter({ lesson_name: 'ColorsLesson', created_by: currentUser.email });
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
      const rows = await base44.entities.LessonProgress.filter({ lesson_name: 'ColorsLesson', created_by: me.email });
      const existing = rows?.[0];
      if (existing) {
        return base44.entities.LessonProgress.update(existing.id, { completed: true });
      }
      return base44.entities.LessonProgress.create({ lesson_name: 'ColorsLesson', completed: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lessonProgress'] });
      toast.success("Colors lesson completed! ✓");
    },
    onError: (e: any) => { console.error("ColorsLesson completeLessonMutation", e); toast.error("Couldn't save lesson progress"); },
  });

  const handleRating = async (color: any, rating: number) => {
    setColorRatings((prev: any) => ({ ...prev, [color.meaning]: rating }));

    // Save to backpack
    await createWordMutation.mutateAsync({
      word: color.hebrew,
      translation: color.meaning,
      phonetic: color.transliteration,
      category: "wordbank",
      times_practiced: rating,
      mastered: rating >= 5,
    });

    toast.success(`Saved "${color.meaning}" with rating ${rating}!`);

    // Check if all colors rated
    const newRatings = { ...colorRatings, [color.meaning]: rating };
    if (Object.keys(newRatings).length === colors.length) {
      completeLessonMutation.mutate();
    }
  };

  const ratedCount = Object.keys(colorRatings).length;
  const allRated = ratedCount === colors.length;
  const canWatchVideo = isMasterUser || allRated;
  const canPlayGame = isMasterUser || (allRated && videoWatched);
  const canSeeSentences = isMasterUser || gameCompleted;

  const generateMnemonic = async (color: any) => {
    if (!mnemonicText.trim()) return;
    setGeneratingImage(true);
    try {
      const result = await base44.integrations.Core.GenerateImage({
        prompt: `A colorful, memorable mnemonic illustration: ${mnemonicText}.
        For learning the Hebrew word for "${color.meaning}" (${color.transliteration}).
        Cartoon style, vibrant colors, fun and memorable.
        IMPORTANT: Do NOT include any text, words, letters, or writing in the image. Pure illustration only.`
      });
      setMnemonicImages((prev: any) => ({ ...prev, [color.meaning]: result.url }));
      toast.success("Mnemonic image created!");
      setMnemonicOpen(null);
      setMnemonicText("");
    } catch (e) {
      toast.error("Failed to generate image");
    }
    setGeneratingImage(false);
  };

  const generateSentences = async () => {
    setLoadingSentences(true);
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Create 5 very simple Hebrew sentences using color words. Use these colors: red (adom), blue (kachol), green (yarok), yellow (tsahov), white (lavan), black (shachor).
        Each sentence should be very basic like "The apple is red" or "The sky is blue".
        Provide Hebrew with vowels, transliteration, and English translation.`,
        response_json_schema: {
          type: "object",
          properties: {
            sentences: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  hebrew: { type: "string" },
                  transliteration: { type: "string" },
                  english: { type: "string" }
                }
              }
            }
          }
        }
      });
      setSentences(result.sentences);
    } catch (e) {
      toast.error("Failed to generate sentences");
    }
    setLoadingSentences(false);
  };

  // Generate 5 questions per color (60 total), shuffled
  const startGame = () => {
    const questions: any[] = [];
    colors.forEach(color => {
      for (let i = 0; i < 5; i++) {
        // Mix question types
        const type = i % 3; // 0: hebrew->english, 1: english->hebrew, 2: color swatch->hebrew
        const wrongAnswers = colors.filter(c => c.meaning !== color.meaning);
        const shuffledWrong = wrongAnswers.sort(() => Math.random() - 0.5).slice(0, 3);

        if (type === 0) {
          // Show Hebrew, pick English
          questions.push({
            type: 'hebrew_to_english',
            colorKey: color.meaning,
            question: color.hebrew,
            questionSub: color.transliteration,
            options: [color, ...shuffledWrong].sort(() => Math.random() - 0.5),
            correctAnswer: color.meaning,
            answerField: 'meaning'
          });
        } else if (type === 1) {
          // Show English, pick Hebrew
          questions.push({
            type: 'english_to_hebrew',
            colorKey: color.meaning,
            question: color.meaning,
            questionColor: color.color,
            options: [color, ...shuffledWrong].sort(() => Math.random() - 0.5),
            correctAnswer: color.hebrew,
            answerField: 'hebrew'
          });
        } else {
          // Show color swatch, pick Hebrew
          questions.push({
            type: 'swatch_to_hebrew',
            colorKey: color.meaning,
            questionColor: color.color,
            options: [color, ...shuffledWrong].sort(() => Math.random() - 0.5),
            correctAnswer: color.hebrew,
            answerField: 'hebrew'
          });
        }
      }
    });

    // Shuffle all questions
    const shuffled = questions.sort(() => Math.random() - 0.5);
    setGameQuestions(shuffled);
    setColorScores({});
    setCurrentQuestion(0);
    setGameMode(true);
    setGameComplete(false);
  };

  const handleAnswer = async (answer: any) => {
    const q = gameQuestions[currentQuestion];
    const isCorrect = answer === q.correctAnswer;

    // Update score for this color
    setColorScores((prev: any) => ({
      ...prev,
      [q.colorKey]: (prev[q.colorKey] || 0) + (isCorrect ? 1 : 0)
    }));

    setShowResult(isCorrect ? 'correct' : 'wrong');

    setTimeout(async () => {
      setShowResult(null);

      if (currentQuestion + 1 >= gameQuestions.length) {
        // Game complete - save all scores to backpack
        setGameComplete(true);

        const finalScores = { ...colorScores, [q.colorKey]: (colorScores[q.colorKey] || 0) + (isCorrect ? 1 : 0) };

        // Save each color rating based on score (out of 5)
        for (const color of colors) {
          const score = finalScores[color.meaning] || 0;
          await createWordMutation.mutateAsync({
            word: color.hebrew,
            translation: color.meaning,
            phonetic: color.transliteration,
            category: "wordbank",
            times_practiced: score,
            mastered: score >= 5,
          });
        }

        setColorRatings(finalScores);
        setGameCompleted(true);
        completeLessonMutation.mutate();
        toast.success("Game complete! Scores saved to backpack!");
      } else {
        setCurrentQuestion(prev => prev + 1);
      }
    }, 800);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <GameHeader profile={userProfile} coins={userCoins?.coins} onBuyCoins={() => {}} />

      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center gap-4 mb-6">
          <Link to="/home" className="text-white/60 hover:text-white">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-white">🎨 Learn Colors</h1>
            <p className="text-white/60">{gameMode ? "Answer questions to rate your knowledge" : "Tap a color to see Hebrew"}</p>
          </div>
          {!gameMode && (
            <Button
              onClick={startGame}
              className="bg-gradient-to-r from-cyan-500 to-purple-500"
            >
              🎮 Start Game
            </Button>
          )}
        </div>

        {/* Game Complete Results */}
        {gameComplete ? (
          /* Results Screen */
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20"
          >
            <div className="text-center mb-6">
              <div className="text-6xl mb-4">🎉</div>
              <h2 className="text-2xl font-bold text-white">Game Complete!</h2>
              <p className="text-white/60">Your scores have been saved to your backpack</p>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-6">
              {colors.map(color => {
                const score = colorScores[color.meaning] || 0;
                return (
                  <div
                    key={color.meaning}
                    className="rounded-xl p-2 text-center"
                    style={{ backgroundColor: color.color }}
                  >
                    <p className={`text-sm font-bold capitalize ${!['white', 'yellow', 'gold'].includes(color.meaning) ? 'text-white' : 'text-gray-800'}`}>
                      {color.meaning}
                    </p>
                    <p className={`text-lg font-bold ${score >= 4 ? 'text-green-300' : score >= 2 ? 'text-yellow-300' : 'text-red-300'}`}>
                      {score}/5
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Color Sentences Game - Unlocked after game complete */}
            <Button
              onClick={generateSentences}
              disabled={loadingSentences}
              className="w-full py-4 mb-3 bg-gradient-to-r from-purple-500 to-pink-500"
            >
              {loadingSentences ? (
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
              ) : (
                <>📝 Color Sentences Game</>
              )}
            </Button>

            {/* Sentences Display */}
            {sentences && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 space-y-2 max-h-60 overflow-y-auto"
              >
                {sentences.map((s: any, idx: number) => (
                  <div key={idx} className="bg-white/5 border border-white/10 rounded-xl p-3">
                    <p className="text-cyan-400 text-lg font-bold" dir="rtl">{s.hebrew}</p>
                    <p className="text-white/70 text-sm">{s.transliteration}</p>
                    <p className="text-white/50 text-xs">{s.english}</p>
                  </div>
                ))}
              </motion.div>
            )}

            <div className="flex gap-3">
              <Button
                onClick={startGame}
                className="flex-1 bg-gradient-to-r from-cyan-500 to-purple-500"
              >
                🔄 Play Again
              </Button>
              <Button
                onClick={() => { setGameMode(false); setGameComplete(false); }}
                variant="outline"
                className="flex-1 border-white/20 text-white"
              >
                Back to Colors
              </Button>
            </div>

            {/* Next Lesson Button */}
            <Link to="/learn/lessons/body-parts" className="block mt-4">
              <Button className="w-full py-6 text-lg bg-gradient-to-r from-green-500 to-emerald-500">
                ✓ Next: Body Parts Lesson →
              </Button>
            </Link>
          </motion.div>
        ) : (
          <div>
            {/* Instructions */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-6">
              <p className="text-white/80 text-sm">
                <span className="text-cyan-400 font-bold">1.</span> Tap each color to see Hebrew and rate how well you know it (1-5)<br/>
                <span className="text-cyan-400 font-bold">2.</span> Tap the 🖼️ button to describe a picture that helps you remember<br/>
                <span className="text-cyan-400 font-bold">3.</span> After rating all colors, play the game to test yourself
              </p>
            </div>

            {/* Progress */}
            <div className="mb-6">
              <div className="flex justify-between text-white/60 text-sm mb-2">
                <span>{ratedCount} of {colors.length} rated</span>
                {allRated && (
                  <span className="text-green-400 flex items-center gap-1">
                    <CheckCircle className="w-4 h-4" /> Complete!
                  </span>
                )}
              </div>
              <div className="bg-white/10 rounded-full h-2 overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-cyan-500 to-purple-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${(ratedCount / colors.length) * 100}%` }}
                />
              </div>
            </div>

            {/* Color Grid */}
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {colors.map((color) => {
                const isExpanded = selectedColor?.meaning === color.meaning;
                const isRated = colorRatings[color.meaning] !== undefined;
                const rating = colorRatings[color.meaning];
                const isDark = !['white', 'yellow', 'gold'].includes(color.meaning);
                const hasMnemonic = mnemonicImages[color.meaning];
                const isMnemonicOpen = mnemonicOpen === color.meaning;

                return (
                  <div
                    key={color.meaning}
                    onClick={() => { if (!isMnemonicOpen) setSelectedColor(isExpanded ? null : color); }}
                    className={`relative rounded-2xl p-3 border-2 cursor-pointer min-h-[140px] flex flex-col justify-between ${
                      isRated
                        ? "border-green-500/50"
                        : isExpanded
                          ? "border-cyan-400"
                          : "border-white/10 hover:border-cyan-400/50"
                    }`}
                    style={{ backgroundColor: color.color }}
                  >
                    {/* Mnemonic button - top right */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMnemonicOpen(isMnemonicOpen ? null : color.meaning);
                        setMnemonicText("");
                      }}
                      className={`absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-sm transition-all ${
                        hasMnemonic
                          ? "bg-purple-500 shadow-lg"
                          : isDark
                            ? "bg-white/20 hover:bg-white/30"
                            : "bg-black/20 hover:bg-black/30"
                      }`}
                      title="Add mnemonic"
                    >
                      🖼️
                    </button>

                    <p className={`text-center font-bold capitalize text-lg ${isDark ? 'text-white' : 'text-gray-800'}`}>
                      {color.meaning}
                    </p>

                    {/* Mnemonic input */}
                    {isMnemonicOpen && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute inset-0 bg-slate-900/95 rounded-2xl p-3 flex flex-col z-10"
                      >
                        <p className="text-white text-xs mb-2">Describe your mnemonic:</p>
                        <Input
                          value={mnemonicText}
                          onChange={(e) => setMnemonicText(e.target.value)}
                          placeholder="e.g. A red apple..."
                          className="bg-white/10 border-white/20 text-white text-xs h-8 mb-2"
                          autoFocus
                        />
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            onClick={() => generateMnemonic(color)}
                            disabled={!mnemonicText.trim() || generatingImage}
                            className="flex-1 bg-purple-500 hover:bg-purple-600 h-7 text-xs"
                          >
                            {generatingImage ? <Loader2 className="w-3 h-3 animate-spin" /> : "Generate"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setMnemonicOpen(null)}
                            className="border-white/20 text-white h-7 text-xs"
                          >
                            ✕
                          </Button>
                        </div>
                      </motion.div>
                    )}

                    {/* Show mnemonic image if exists */}
                    {hasMnemonic && !isMnemonicOpen && (
                      <div className="absolute top-8 right-1 w-10 h-10 rounded-lg overflow-hidden border border-white/30 shadow-lg">
                        <img src={hasMnemonic} alt="mnemonic" className="w-full h-full object-cover" />
                      </div>
                    )}

                    {/* Always reserve space, show content when expanded */}
                    <div className="flex-1 flex flex-col justify-center">
                      {isExpanded ? (
                        <div>
                          <p className={`text-xl font-bold text-center ${isDark ? 'text-cyan-300' : 'text-purple-700'}`} dir="rtl">
                            {color.hebrew}
                          </p>
                          <p className={`text-xs text-center ${isDark ? 'text-white/80' : 'text-gray-600'}`}>
                            {color.transliteration}
                          </p>

                          {/* Rating buttons */}
                          <div className="flex gap-1 justify-center mt-2">
                            {[1, 2, 3, 4, 5].map((num) => (
                              <button
                                key={num}
                                onClick={(e) => { e.stopPropagation(); handleRating(color, num); }}
                                className={`w-6 h-6 rounded text-xs font-bold transition-all ${
                                  rating === num
                                    ? num === 5
                                      ? "bg-green-500 text-white"
                                      : "bg-cyan-500 text-white"
                                    : isDark
                                      ? "bg-white/20 text-white hover:bg-white/30"
                                      : "bg-black/20 text-gray-800 hover:bg-black/30"
                                }`}
                              >
                                {num}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="h-12" />
                      )}
                    </div>

                    {isRated && (
                      <div className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center text-white text-xs font-bold">
                        {rating}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Video + Games Container */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 bg-white/5 border border-white/10 rounded-xl p-4 space-y-3"
            >
              {/* Watch Video Button */}
              <Button
                onClick={() => {
                  if (!canWatchVideo) {
                    toast.error("Rate all colors above first to unlock the video!");
                  } else {
                    setShowVideo(true);
                  }
                }}
                className={`w-full py-6 text-lg ${
                  canWatchVideo
                    ? videoWatched
                      ? "bg-green-600"
                      : "bg-gradient-to-r from-red-500 to-pink-500"
                    : "bg-white/10 text-white/40"
                }`}
              >
                {videoWatched ? "✓ Video Watched" : <>📺 Watch Colors Video {!canWatchVideo && "🔒"}</>}
              </Button>

              {/* Video Player */}
              {showVideo && (
                <div className="relative">
                  <div className="aspect-video rounded-xl overflow-hidden">
                    <iframe
                      width="100%"
                      height="100%"
                      src="https://www.youtube.com/embed/ZjtnyqA2kc4?autoplay=1"
                      title="Colors Video"
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                  <Button
                    onClick={() => { setVideoWatched(true); setShowVideo(false); }}
                    className="w-full mt-2 bg-gradient-to-r from-green-500 to-emerald-500"
                  >
                    ✓ I watched the video - Continue
                  </Button>
                </div>
              )}

              {/* Color Game Button */}
              <Button
                onClick={() => {
                  if (!canWatchVideo) {
                    toast.error("Rate all colors above first!");
                  } else if (!videoWatched) {
                    toast.error("Watch the video above first to unlock the Color Game!");
                  } else {
                    startGame();
                  }
                }}
                className={`w-full py-6 text-lg ${
                  canPlayGame
                    ? "bg-gradient-to-r from-green-500 to-emerald-500"
                    : "bg-white/10 text-white/40"
                }`}
              >
                🎮 Color Game {!canPlayGame && "🔒"}
              </Button>

              {/* Game Mode - Inline */}
              {gameMode && !gameComplete && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4 pt-4 border-t border-white/10"
                >
                  {/* Progress */}
                  <div>
                    <div className="flex justify-between text-white/60 text-sm mb-2">
                      <span>Question {currentQuestion + 1} of {gameQuestions.length}</span>
                      <span>{Math.round(((currentQuestion) / gameQuestions.length) * 100)}%</span>
                    </div>
                    <div className="bg-white/10 rounded-full h-2 overflow-hidden">
                      <motion.div
                        className="h-full bg-gradient-to-r from-cyan-500 to-purple-500"
                        animate={{ width: `${((currentQuestion) / gameQuestions.length) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Question Card */}
                  {gameQuestions[currentQuestion] && (
                    <motion.div
                      key={currentQuestion}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={`bg-white/10 backdrop-blur-sm rounded-2xl p-6 border-2 ${
                        showResult === 'correct' ? 'border-green-500 bg-green-500/20' :
                        showResult === 'wrong' ? 'border-red-500 bg-red-500/20' :
                        'border-white/20'
                      }`}
                    >
                      {/* Question */}
                      <div className="text-center mb-6">
                        {gameQuestions[currentQuestion].type === 'swatch_to_hebrew' ? (
                          <div
                            className="w-24 h-24 rounded-2xl mx-auto mb-4 shadow-lg"
                            style={{ backgroundColor: gameQuestions[currentQuestion].questionColor }}
                          />
                        ) : gameQuestions[currentQuestion].type === 'english_to_hebrew' ? (
                          <>
                            <div
                              className="w-16 h-16 rounded-xl mx-auto mb-3 shadow-lg"
                              style={{ backgroundColor: gameQuestions[currentQuestion].questionColor }}
                            />
                            <p className="text-3xl font-bold text-white capitalize">
                              {gameQuestions[currentQuestion].question}
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-4xl font-bold text-cyan-400 mb-2" dir="rtl">
                              {gameQuestions[currentQuestion].question}
                            </p>
                            <p className="text-white/60">{gameQuestions[currentQuestion].questionSub}</p>
                          </>
                        )}

                        <p className="text-white/60 mt-4 text-sm">
                          {gameQuestions[currentQuestion].type === 'hebrew_to_english'
                            ? "What color is this?"
                            : "What is this in Hebrew?"}
                        </p>
                      </div>

                      {/* Options */}
                      <div className="grid grid-cols-2 gap-3">
                        {gameQuestions[currentQuestion].options.map((opt: any, idx: number) => (
                          <button
                            key={idx}
                            onClick={() => !showResult && handleAnswer(opt[gameQuestions[currentQuestion].answerField])}
                            disabled={!!showResult}
                            className={`p-4 rounded-xl border-2 transition-all ${
                              showResult && opt[gameQuestions[currentQuestion].answerField] === gameQuestions[currentQuestion].correctAnswer
                                ? 'border-green-500 bg-green-500/20'
                                : 'border-white/20 hover:border-cyan-400 bg-white/5 hover:bg-white/10'
                            }`}
                          >
                            {gameQuestions[currentQuestion].answerField === 'meaning' ? (
                              <span className="text-white font-medium capitalize">{opt.meaning}</span>
                            ) : (
                              <>
                                <span className="text-cyan-400 font-bold text-lg" dir="rtl">{opt.hebrew}</span>
                                <span className="text-white/60 text-sm block">{opt.transliteration}</span>
                              </>
                            )}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  <Button
                    onClick={() => { setGameMode(false); setGameComplete(false); }}
                    variant="outline"
                    className="w-full border-white/20 text-white"
                  >
                    Exit Game
                  </Button>
                </motion.div>
              )}

              {/* Color Sentences Game */}
              <Button
                onClick={() => {
                  if (!canPlayGame) {
                    toast.error("Complete the Color Game first to unlock this!");
                  } else if (!canSeeSentences) {
                    toast.error("Complete the Color Game first to unlock this!");
                  } else {
                    generateSentences();
                  }
                }}
                disabled={loadingSentences}
                className={`w-full py-4 text-md ${
                  canSeeSentences
                    ? "bg-gradient-to-r from-purple-500 to-pink-500"
                    : "bg-white/10 text-white/40"
                }`}
              >
                {loadingSentences ? (
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                ) : (
                  <>📝 Color Sentences Game {!canSeeSentences && "🔒"}</>
                )}
              </Button>
            </motion.div>

            {/* Sentences Display */}
            {sentences && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 space-y-3"
              >
                <h3 className="text-white font-bold text-lg">📝 Practice Sentences:</h3>
                {sentences.map((s: any, idx: number) => (
                  <div key={idx} className="bg-white/5 border border-white/10 rounded-xl p-4">
                    <p className="text-cyan-400 text-xl font-bold mb-1" dir="rtl">{s.hebrew}</p>
                    <p className="text-white/70">{s.transliteration}</p>
                    <p className="text-white/50 text-sm">{s.english}</p>
                  </div>
                ))}
              </motion.div>
            )}
          </div>
        )}
      </div>

      <QuickAddWordWidget />
      <TranslatorWidget />
    </div>
  );
}
