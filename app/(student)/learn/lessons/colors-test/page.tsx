"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, CheckCircle, XCircle, Trophy } from "lucide-react";
import { Link, useNavigate, createPageUrl } from "@/lib/router-compat";
import { motion, AnimatePresence } from "framer-motion";
import { base44 as base44Client } from "@/api/base44Client";
const base44: any = base44Client;
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import AnimatedParrot from "@/components/mascot/AnimatedParrot";

const colors = [
  { hebrew: "אדום", transliteration: "adom", meaning: "red", color: "#EF4444" },
  { hebrew: "כחול", transliteration: "kachol", meaning: "blue", color: "#3B82F6" },
  { hebrew: "ירוק", transliteration: "yarok", meaning: "green", color: "#22C55E" },
  { hebrew: "צהוב", transliteration: "tsahov", meaning: "yellow", color: "#EAB308" },
  { hebrew: "כתום", transliteration: "katom", meaning: "orange", color: "#F97316" },
  { hebrew: "סגול", transliteration: "sagol", meaning: "purple", color: "#A855F7" },
  { hebrew: "ורוד", transliteration: "varod", meaning: "pink", color: "#EC4899" },
  { hebrew: "לבן", transliteration: "lavan", meaning: "white", color: "#F3F4F6" },
  { hebrew: "שחור", transliteration: "shachor", meaning: "black", color: "#1F2937" },
  { hebrew: "חום", transliteration: "chum", meaning: "brown", color: "#92400E" },
  { hebrew: "אפור", transliteration: "afor", meaning: "gray", color: "#6B7280" },
  { hebrew: "זהב", transliteration: "zahav", meaning: "gold", color: "#D97706" },
];

function shuffleArray(array: any[]) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function generateQuestion(correctColor: any, allColors: any[]) {
  const otherColors = allColors.filter(c => c.hebrew !== correctColor.hebrew);
  const shuffledOthers = shuffleArray(otherColors).slice(0, 3);
  const options = shuffleArray([correctColor, ...shuffledOthers]);

  return {
    question: correctColor,
    options,
    correctAnswer: correctColor.hebrew,
  };
}

export default function ColorsTest() {
  const [questions] = useState(() => {
    const shuffled = shuffleArray(colors);
    return shuffled.map(color => generateQuestion(color, colors));
  });
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<any>(null);
  const [isCorrect, setIsCorrect] = useState<any>(null);
  const [score, setScore] = useState(0);
  const [testComplete, setTestComplete] = useState(false);
  const [trigger, setTrigger] = useState(0);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Get current user for owner-scoped progress reads/writes
  React.useEffect(() => {
    const fetchUser = async () => {
      try {
        const user = await base44.auth.me();
        setCurrentUser(user);
      } catch (e) {}
    };
    fetchUser();
  }, []);

  const { data: progress } = useQuery({
    queryKey: ['lessonProgress', 'ColorsLesson', currentUser?.email],
    queryFn: async () => {
      if (!currentUser?.email) return [];
      return base44.entities.LessonProgress.filter({ lesson_name: 'ColorsLesson', created_by: currentUser.email });
    },
    enabled: !!currentUser?.email,
  });

  const saveScoreMutation = useMutation({
    mutationFn: async (finalScore: number) => {
      const me = currentUser || await base44.auth.me();
      const rows = await base44.entities.LessonProgress.filter({ lesson_name: 'ColorsLesson', created_by: me.email });
      const existing = rows?.[0];
      if (existing) {
        return base44.entities.LessonProgress.update(existing.id, {
          test_completed: true,
          test_score: finalScore
        });
      }
      return base44.entities.LessonProgress.create({
        lesson_name: 'ColorsLesson',
        completed: true,
        test_completed: true,
        test_score: finalScore
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lessonProgress'] });
    },
    onError: (e: any) => { console.error("ColorsTest saveScoreMutation", e); toast.error("Couldn't save test score"); },
  });

  const current = questions[currentQuestion];

  const handleAnswer = (option: any) => {
    if (selectedAnswer) return;

    setSelectedAnswer(option.hebrew);
    const correct = option.hebrew === current.correctAnswer;
    setIsCorrect(correct);

    if (correct) {
      setScore(s => s + 1);
      setTrigger(t => t + 1);
    }

    setTimeout(() => {
      if (currentQuestion < questions.length - 1) {
        setCurrentQuestion(q => q + 1);
        setSelectedAnswer(null);
        setIsCorrect(null);
      } else {
        const finalScore = Math.round(((score + (correct ? 1 : 0)) / questions.length) * 100);
        setTestComplete(true);
        saveScoreMutation.mutate(finalScore);
      }
    }, 1500);
  };

  if (testComplete) {
    const finalScore = Math.round((score / questions.length) * 100);
    const passed = finalScore >= 70;

    return (
      <div className="min-h-screen p-4 md:p-8">
        <div className="max-w-2xl mx-auto">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl shadow-xl p-8 text-center"
          >
            <AnimatedParrot trigger={Date.now()} size="lg" showMessage={true} />

            <div className="mt-6">
              {passed ? (
                <>
                  <Trophy className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
                  <h1 className="text-3xl font-bold text-green-600 mb-2">Congratulations!</h1>
                  <p className="text-gray-600 mb-4">You passed the Colors test!</p>
                </>
              ) : (
                <>
                  <h1 className="text-3xl font-bold text-orange-600 mb-2">Keep Practicing!</h1>
                  <p className="text-gray-600 mb-4">Review the colors and try again.</p>
                </>
              )}

              <div className="text-5xl font-bold bg-gradient-to-r from-pink-500 to-rose-500 bg-clip-text text-transparent mb-6">
                {finalScore}%
              </div>

              <p className="text-gray-500 mb-6">{score} out of {questions.length} correct</p>

              <div className="flex gap-4 justify-center">
                <Button
                  onClick={() => navigate("/learn/lessons/colors")}
                  variant="outline"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" /> Back to Lesson
                </Button>
                <Button
                  onClick={() => navigate("/progress")}
                  className="bg-gradient-to-r from-pink-500 to-rose-500"
                >
                  Back to Schedule
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <Link to="/learn/lessons/colors" className="text-violet-600 hover:text-violet-700 mb-4 inline-flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Back to Lesson
        </Link>

        <div className="flex items-center gap-4 mb-8">
          <AnimatedParrot trigger={trigger} size="sm" />
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-pink-500 to-rose-500 bg-clip-text text-transparent">Colors Test</h1>
            <p className="text-gray-500">Question {currentQuestion + 1} of {questions.length}</p>
          </div>
          <div className="ml-auto bg-white rounded-xl px-4 py-2 border border-pink-200">
            <p className="text-sm text-gray-500">Score</p>
            <p className="text-xl font-bold text-pink-600">{score}/{questions.length}</p>
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={currentQuestion}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="bg-white rounded-2xl shadow-xl p-8 border-2 border-pink-100"
          >
            <div className="text-center mb-8">
              <p className="text-gray-500 mb-2">What color is this?</p>
              <div
                className="w-32 h-32 rounded-2xl mx-auto shadow-lg"
                style={{ backgroundColor: current.question.color }}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {current.options.map((option: any, idx: number) => {
                let buttonStyle = "bg-gray-50 border-2 border-gray-200 hover:border-pink-300 hover:bg-pink-50";

                if (selectedAnswer) {
                  if (option.hebrew === current.correctAnswer) {
                    buttonStyle = "bg-green-100 border-2 border-green-500";
                  } else if (option.hebrew === selectedAnswer) {
                    buttonStyle = "bg-red-100 border-2 border-red-500";
                  }
                }

                return (
                  <motion.button
                    key={idx}
                    onClick={() => handleAnswer(option)}
                    disabled={!!selectedAnswer}
                    className={`p-4 rounded-xl transition-all ${buttonStyle}`}
                    whileHover={!selectedAnswer ? { scale: 1.02 } : {}}
                    whileTap={!selectedAnswer ? { scale: 0.98 } : {}}
                  >
                    <p className="text-xl font-bold text-gray-800" dir="rtl">{option.hebrew}</p>
                    <p className="text-sm text-gray-500">{option.transliteration}</p>

                    {selectedAnswer && option.hebrew === current.correctAnswer && (
                      <CheckCircle className="w-5 h-5 text-green-600 mx-auto mt-2" />
                    )}
                    {selectedAnswer && option.hebrew === selectedAnswer && option.hebrew !== current.correctAnswer && (
                      <XCircle className="w-5 h-5 text-red-600 mx-auto mt-2" />
                    )}
                  </motion.button>
                );
              })}
            </div>

            {isCorrect !== null && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`mt-6 p-4 rounded-xl text-center ${
                  isCorrect ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                }`}
              >
                {isCorrect ? "Correct! 🎉" : `The answer was: ${current.question.transliteration} (${current.question.meaning})`}
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
