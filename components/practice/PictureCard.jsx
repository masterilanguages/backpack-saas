"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import ClickableWord from "@/components/learning/ClickableWord";
import EditableWord from "@/components/learning/EditableWord";
import DeletablePictureBox from "@/components/learning/DeletablePictureBox";

export default function PictureCard({
  card,
  onNext,
  onPrev,
  currentIndex,
  total,
  onRate,
  currentRating,
  onDelete,
  onUpdateWord,
  canEdit = true
}) {
  const [showAnswer, setShowAnswer] = useState(true);

  const handleNext = () => {
    setShowAnswer(false);
    onNext();
  };

  const handlePrev = () => {
    setShowAnswer(false);
    onPrev();
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white/90 backdrop-blur-sm rounded-2xl border border-violet-100 shadow-xl overflow-hidden max-w-lg mx-auto"
    >
      <div className="relative">
        <img
          src={card.image}
          alt="Mnemonic illustration"
          className="w-full h-64 object-cover"
        />
        <div className="absolute top-3 right-3 bg-black/50 text-white px-3 py-1 rounded-full text-sm">
          {currentIndex + 1}
        </div>
        {canEdit && (
          <div className="absolute bottom-3 right-3 flex gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                // TODO: Trigger mnemonic image regeneration
              }}
              className="w-8 h-8 rounded-lg bg-black/40 hover:bg-black/60 flex items-center justify-center backdrop-blur-md transition-all"
            >
              <span className="text-lg">🎨</span>
            </button>
            {onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="w-8 h-8 rounded-lg bg-black/40 hover:bg-black/60 flex items-center justify-center backdrop-blur-md transition-all"
              >
                <span className="text-lg">🗑️</span>
              </button>
            )}
          </div>
        )}
        <div className="absolute bottom-3 left-3 flex gap-1">
          {[1, 2, 3, 4, 5].map((num) => (
            <button
              key={num}
              onClick={(e) => {
                e.stopPropagation();
                setShowAnswer(true);
                onRate(card.hebrewWord, num);
              }}
              className={`w-6 h-6 rounded text-xs font-bold transition-all ${
                currentRating === num
                  ? "bg-violet-500 text-white"
                  : "bg-black/30 text-white/80 hover:bg-black/50"
              }`}
            >
              {num}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        <div className="text-center mb-4">
          <p className="text-lg text-gray-700 mb-2">
            {card.hint.split(' ').map((w, i) => (
              <React.Fragment key={i}>
                <EditableWord
                  text={w}
                  editable={canEdit}
                  onSave={(newWord) => {
                    const words = card.hint.split(' ');
                    words[i] = newWord;
                    onUpdateWord?.({ ...card, hint: words.join(' ') });
                  }}
                  className="text-gray-700"
                />
                {i < card.hint.split(' ').length - 1 && ' '}
              </React.Fragment>
            ))}
          </p>
          <div className="flex items-center justify-center gap-3">
            {showAnswer && (
              <>
                <EditableWord
                  text={card.transliteration}
                  editable={canEdit}
                  onSave={(newWord) => onUpdateWord?.({ ...card, transliteration: newWord })}
                  className="text-3xl font-bold text-violet-600"
                />
                <span className="text-2xl text-gray-400">=</span>
              </>
            )}
            {showAnswer ? (
              <EditableWord
                text={card.meaning}
                editable={canEdit}
                onSave={(newMeaning) => onUpdateWord?.({ ...card, meaning: newMeaning })}
                className="text-2xl font-bold text-green-600"
              />
            ) : (
              <span className="text-2xl font-bold text-green-600">_____</span>
            )}
          </div>
        </div>



        {showAnswer && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-r from-violet-50 to-blue-50 rounded-xl p-4 text-center"
          >
            <p className="text-xl text-gray-600 mb-1">
              <EditableWord
                text={card.transliteration}
                editable={canEdit}
                onSave={(newWord) => onUpdateWord?.({ ...card, transliteration: newWord })}
                className="text-xl text-gray-600"
              />
            </p>
            <p className="text-sm text-gray-500 italic">
              🧠 {card.mnemonic.split(' ').map((w, i) => (
                <React.Fragment key={i}>
                  <EditableWord
                    text={w}
                    editable={canEdit}
                    onSave={(newWord) => {
                      const words = card.mnemonic.split(' ');
                      words[i] = newWord;
                      onUpdateWord?.({ ...card, mnemonic: words.join(' ') });
                    }}
                    className="text-gray-500"
                  />
                  {i < card.mnemonic.split(' ').length - 1 && ' '}
                </React.Fragment>
              ))}
            </p>
          </motion.div>
        )}

        <div className="flex gap-3 mt-4">
          <Button
            onClick={handlePrev}
            variant="outline"
            className="flex-1"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Previous
          </Button>
          <Button
            onClick={handleNext}
            className="flex-1 bg-gradient-to-r from-violet-500 to-blue-500 hover:from-violet-600 hover:to-blue-600"
          >
            Next
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
