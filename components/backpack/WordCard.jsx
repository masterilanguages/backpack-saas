"use client";

import React, { useState, useRef } from "react";
import { motion } from "framer-motion";
import { Loader2, RefreshCw, Plus, Check, X, Pencil } from "lucide-react";
import EditableWord from "@/components/learning/EditableWord";
import { toast } from "sonner";
import { isRTLLanguage, isRTLText, languageLabel, needsTransliteration } from "@/lib/language";
import { mnemonicImagePrompt } from "@/lib/imageStyle";
import { generateLessonAudio } from "@/lib/audio/lessonAudio";

function SentenceWords({ words, onAddToBackpack, showHebrew = true, showTransliteration = true, lang = 'hebrew' }) {
  // Native-script line direction follows the actual generated text (RTL for Hebrew/Arabic, LTR for Latin).
  const nativeIsRTL = isRTLText((words || []).map(w => w.hebrew || '').join(' '));
  const [activeIndex, setActiveIndex] = useState(null);
  const [editingWord, setEditingWord] = useState('');
  const [editingMeaning, setEditingMeaning] = useState('');

  if (!words?.length) return null;

  const handleWordClick = (e, i) => {
    e.stopPropagation();
    if (activeIndex === i) { setActiveIndex(null); return; }
    setActiveIndex(i);
    setEditingWord(words[i].word || '');
    setEditingMeaning(words[i].meaning || '');
  };

  return (
    <div className="space-y-0.5 w-full">
      {/* Native-script line — RTL for Hebrew/Arabic, LTR for Latin scripts, centered */}
      {showHebrew && (
        <p className="text-[11px] text-teal-400 font-semibold text-center leading-snug" dir={nativeIsRTL ? "rtl" : "ltr"}>
          {words.map((w, i) => (
            <span
              key={i}
              onClick={(e) => handleWordClick(e, i)}
              className={`cursor-pointer rounded px-0.5 transition-all ${activeIndex === i ? 'bg-teal-500/25' : 'hover:bg-teal-500/10'}`}
            >
              {w.hebrew || ''}
              {i < words.length - 1 ? ' ' : ''}
            </span>
          ))}
        </p>
      )}

      {/* Transliteration line — only for languages that need it (Hebrew/Arabic); Latin words are already their own transliteration */}
      {showTransliteration && needsTransliteration(lang) && (
        <p className="text-[10px] text-slate-400 text-center leading-snug flex flex-nowrap justify-center gap-x-0.5 overflow-hidden">
          {words.map((w, i) => (
            <span
              key={i}
              onClick={(e) => handleWordClick(e, i)}
              className={`cursor-pointer rounded px-0.5 transition-all whitespace-nowrap ${activeIndex === i ? 'bg-teal-500/25 text-teal-300' : 'hover:bg-slate-800'}`}
            >
              {w.word || ''}
            </span>
          ))}
        </p>
      )}

      {/* Active word action popup — one tap to add */}
      {activeIndex !== null && (
        <div className="flex items-center justify-center gap-1 py-1">
          <span className="flex items-center gap-2 bg-teal-500/15 border border-teal-500/30 rounded-lg px-2 py-1">
            <span className="text-[11px] font-semibold text-teal-300">{words[activeIndex].word}</span>
            {words[activeIndex].meaning && <span className="text-[10px] text-slate-400">= {words[activeIndex].meaning}</span>}
            <button
              onClick={() => { onAddToBackpack(words[activeIndex].word, words[activeIndex].meaning, words[activeIndex].hebrew); setActiveIndex(null); }}
              className="flex items-center gap-0.5 bg-teal-500 text-white rounded px-1.5 py-0.5 text-[10px] font-bold hover:bg-teal-400"
            ><Plus className="w-3 h-3" /> Add</button>
            <button onClick={() => setActiveIndex(null)} className="text-slate-500 hover:text-slate-300"><X className="w-3 h-3" /></button>
          </span>
        </div>
      )}
    </div>
  );
}

// Review state is shown as a tinted card outline + a status chip on the image.
const REVIEW_STYLE = {
  approved: { color: '#4ade80', ring: 'rgba(74,222,128,0.55)', label: 'Approved', Icon: Check },
  rejected: { color: '#f87171', ring: 'rgba(248,113,113,0.55)', label: 'Needs review', Icon: X },
};

export default function WordCard({
  word,
  language,
  showAllEnglish,
  showHebrew: showHebrewProp = true,
  showTransliteration: showTransliterationProp = true,
  onScriptToggle,
  onEnglishToggle,
  onHebrewToggle,
  onTranslitToggle,
  isContentEditable,
  mnemonicExplanations,
  setMnemonicExplanations,
  cardSentences,
  generatingSentence,
  fetchingTranslation,
  suggestingMnemonic,
  mnemonicQueue = new Set(),
  isAdmin,
  updateWordMutation,
  handleRateWord,
  suggestMnemonicForWord,
  approveWordMutation,
  handleDismissWord,
  deleteWordMutation,
  handleAddWordFromSentence,
  generateCardSentence,
  sessionTitleMap = {},
  // Single-card view (Backpack tab): fill the available width/height and scale
  // text + controls up. Default stays the compact w-48 grid tile.
  large = false,
}) {
  const [revealed, setRevealed] = useState(false);
  const [regeneratingImage, setRegeneratingImage] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const [showCustomMnemonic, setShowCustomMnemonic] = useState(false);
  const [customDesc, setCustomDesc] = useState("");
  const inputRef = useRef(null);

  const isGeneratingImage = suggestingMnemonic === word.id || mnemonicQueue.has(word.id);

  const showHebrew = showHebrewProp ?? true;
  const showTransliteration = showTransliterationProp ?? true;

  // Target language for this card (drives native-script direction + transliteration/script toggles).
  // Prefer an explicit language prop (e.g. passed from a session view), then the word's own language, then Hebrew.
  const lang = language || word.language || 'hebrew';
  // Render the native word RTL only for RTL languages / actual RTL text — Latin renders LTR.
  const nativeWordRTL = isRTLLanguage(lang) || isRTLText(word.word);

  // Synthetic/session cards (e.g. id "session_0") are not persisted rows — guard
  // against attempting a real delete on them.
  const isRealWordId = word.id != null && !String(word.id).startsWith('session_');

  // Student review (per card, never shared): null → "approved" → "rejected" → null.
  // An approved card is locked for the student; only an admin can still edit it.
  // Rejected cards stay editable and show up for the admin under Vocabulary.
  const reviewStatus = word.review_status || null;
  const reviewLocked = reviewStatus === 'approved' && !isAdmin;
  const canEdit = isContentEditable(word) && !reviewLocked;
  const canReview = !isAdmin && isRealWordId && !word._shared && !word.approved;
  const review = reviewStatus ? REVIEW_STYLE[reviewStatus] : null;
  const cycleReview = (e) => {
    e.stopPropagation();
    const next = reviewStatus === null ? 'approved' : reviewStatus === 'approved' ? 'rejected' : null;
    updateWordMutation.mutate(
      { id: word.id, data: { review_status: next } },
      { onSuccess: () => toast.success(next === 'approved' ? "Card approved ✅" : next === 'rejected' ? "Card flagged for review" : "Review cleared") }
    );
  };

  const regenerateImageFromDescription = async (description) => {
    setRegeneratingImage(true);
    try {
      const { base44 } = await import("@/api/base44Client");
      const result = await base44.integrations.Core.GenerateImage({
        prompt: mnemonicImagePrompt(description)
      });
      updateWordMutation.mutate({ id: word.id, data: { image_url: result.url } });
    } catch (e) {
      console.error("Failed to regenerate image", e);
    }
    setRegeneratingImage(false);
  };

  const generateCustomMnemonic = async () => {
    const description = customDesc.trim();
    if (!description) return;
    setRegeneratingImage(true);
    setShowCustomMnemonic(false);
    try {
      const { base44 } = await import("@/api/base44Client");
      const result = await base44.integrations.Core.GenerateImage({
        prompt: mnemonicImagePrompt(description)
      });
      // For approved or shared cards, create a personal copy instead of editing the
      // original (a non-owner edit would otherwise silently no-op).
      if (word.approved || word._shared) {
        await base44.entities.Word.create({
          word: word.word,
          translation: word.translation,
          phonetic: word.phonetic,
          category: 'wordbank',
          language: word.language || lang,
          times_practiced: word.times_practiced || 0,
          mastered: word.mastered || false,
          image_url: result.url,
          mnemonic_explanation: description,
        });
        toast.success("Saved to your personal cards");
      } else {
        await updateWordMutation.mutateAsync({ id: word.id, data: { image_url: result.url, mnemonic_explanation: description } });
        toast.success("Mnemonic saved!");
      }
      // Refresh the caption immediately so it doesn't stay stale.
      if (setMnemonicExplanations) {
        setMnemonicExplanations(prev => ({ ...prev, [word.id]: description }));
      }
      setCustomDesc("");
      setImgFailed(false);
    } catch (e) {
      console.error("Failed to generate custom mnemonic", e);
      toast.error("Failed to generate mnemonic");
    }
    setRegeneratingImage(false);
  };

  // click on card toggles English reveal
  const showingEnglish = showAllEnglish || revealed;

  return (
    <motion.div
      key={word.id}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      // Tailwind's content globs only scan .ts/.tsx, so classes that appear
      // only in this .jsx file are never generated — sizing that must work
      // goes in inline styles.
      className={`bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col ${large ? "w-full shrink-0" : "w-48"}`}
      style={{
        ...(large ? { flex: '1 0 auto' } : {}),
        ...(review ? { borderColor: review.ring, boxShadow: `0 0 0 1px ${review.ring}` } : {}),
      }}
    >
      {/* Source content label — top of card */}
      {word.example_sentence && (
        <div className="px-2 py-1 flex items-center justify-center border-b border-slate-800 bg-slate-800">
          <span className="text-[10px] text-slate-400 italic truncate">
            📺 {sessionTitleMap[word.example_sentence] || word.example_sentence}
          </span>
        </div>
      )}

      {word.approved && (
        <div className="flex items-center gap-1 px-2 py-0.5 bg-green-500/15 border-b border-green-500/30">
          <span className="text-green-400 text-[10px] font-semibold">✅ Approved card</span>
        </div>
      )}
      {word._shared && (
        <div className="flex items-center gap-1 px-2 py-0.5 bg-teal-500/15 border-b border-teal-500/30">
          <span className="text-teal-300 text-[10px] font-semibold">⭐ New — tap to rank</span>
        </div>
      )}

      {/* Large mnemonic image — always visible */}
      <div
        className="relative cursor-pointer select-none bg-slate-800 overflow-hidden"
        style={large ? { flex: '1 1 0%', minHeight: '220px' } : { height: '160px', minHeight: '160px' }}
        onClick={() => setRevealed(r => !r)}
      >
        {review && (
          <div
            className="absolute top-1.5 left-1.5 z-10 flex items-center gap-1 rounded-full"
            style={{
              padding: large ? '4px 10px 4px 8px' : '2px 7px 2px 5px',
              background: 'rgba(15,23,42,0.8)',
              backdropFilter: 'blur(6px)',
              border: `1px solid ${review.ring}`,
              color: review.color,
              fontSize: large ? 12 : 10,
              fontWeight: 600,
              lineHeight: 1.2,
            }}
          >
            <review.Icon style={{ width: large ? 14 : 11, height: large ? 14 : 11 }} strokeWidth={3} />
            {review.label}
          </div>
        )}
        {/* Top-right controls: EN, Translit, Hebrew toggles */}
        <div className="absolute top-1.5 right-1.5 z-10 flex gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); if (onEnglishToggle) onEnglishToggle(); }}
            className={`${large ? 'px-2.5 py-1 text-xs' : 'px-1.5 py-0.5 text-[9px]'} rounded font-bold transition-all leading-none border ${
              showAllEnglish ? 'bg-teal-500 text-white border-teal-400' : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-white'
            }`}
            title="Toggle English"
          >
            EN
          </button>
          {/* Native-script toggle — only for languages with a distinct native script (Hebrew/Arabic).
              Latin-script languages have no separate native script, so the toggle is hidden. */}
          {needsTransliteration(lang) && (
            <button
              onClick={(e) => { e.stopPropagation(); if (onHebrewToggle) onHebrewToggle(); }}
              className={`${large ? 'px-2.5 py-1 text-xs' : 'px-1.5 py-0.5 text-[9px]'} rounded font-bold transition-all leading-none border ${
                showHebrew ? 'bg-teal-500 text-white border-teal-400' : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:bg-slate-700 hover:text-white'
              }`}
              title={`Toggle ${languageLabel(lang)}`}
            >
              {String(lang).toLowerCase() === 'arabic' ? 'ع' : 'א'}
            </button>
          )}
        </div>
        {word.image_url && !imgFailed ? (
          <>
            <img
              src={word.image_url}
              alt={word.phonetic}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', position: 'absolute', top: 0, left: 0 }}
              onError={() => setImgFailed(true)}
            />
            {/* Regenerate the image: with typed specs in the designer input it
                recreates from those specs, otherwise a fresh auto mnemonic. */}
            {!reviewLocked && <button
              onClick={(e) => {
                e.stopPropagation();
                if (isGeneratingImage || regeneratingImage) return;
                if (customDesc.trim()) generateCustomMnemonic();
                else suggestMnemonicForWord(word);
              }}
              title={customDesc.trim() ? "Regenerate from your description" : "Regenerate image"}
              className={`absolute bottom-1.5 left-1.5 z-10 flex ${large ? 'h-10 w-10 text-base' : 'h-7 w-7 text-sm'} items-center justify-center rounded-full bg-slate-900/70 backdrop-blur-sm transition hover:bg-slate-900/90`}
            >
              {(isGeneratingImage || regeneratingImage) ? <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-400" /> : '🔄'}
            </button>}
          </>
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-teal-500/15 via-teal-400/5 to-slate-800 flex flex-col items-center justify-center text-center px-4 gap-2">
            {(isGeneratingImage || regeneratingImage) ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
                <span className="text-[10px] text-slate-400">Generating image...</span>
              </>
            ) : (
              <>
                <p className="text-teal-300 font-bold text-xl" dir={nativeWordRTL ? "rtl" : "ltr"}>{word.word}</p>
                <p className="text-slate-400 text-sm">{word.phonetic}</p>
                <button
                  onClick={(e) => { e.stopPropagation(); setImgFailed(false); suggestMnemonicForWord(word); }}
                  className="text-[9px] text-teal-400 underline mt-1"
                >
                  🎨 Regenerate
                </button>
              </>
            )}
          </div>
        )}

      </div>

      {/* Word info — click to toggle English reveal */}
      <div className={`p-3 flex flex-col gap-0.5 cursor-pointer select-none ${large ? "py-4" : "flex-1"}`} onClick={() => setRevealed(r => !r)}>
        {showHebrew && (
          <p className={`text-teal-300 font-bold text-center ${large ? "text-3xl" : "text-base"}`} dir={nativeWordRTL ? "rtl" : "ltr"}>
            <EditableWord
              text={word.word}
              language={nativeWordRTL ? "he" : "en"}
              editable={canEdit}
              onSave={(v) => updateWordMutation.mutate({ id: word.id, data: { word: v } })}
              className={`text-teal-300 font-bold ${large ? "text-3xl" : "text-base"}`}
              onClick={(e) => e.stopPropagation()}
            />
          </p>
        )}

        {showTransliteration && (
          <p className={`text-slate-400 text-center ${large ? "text-lg" : "text-sm"}`}>
            <EditableWord
              text={word.phonetic || word.word}
              editable={canEdit}
              onSave={(v) => updateWordMutation.mutate({ id: word.id, data: { phonetic: v } })}
              className={`text-slate-400 ${large ? "text-lg" : "text-sm"}`}
              onClick={(e) => e.stopPropagation()}
            />
          </p>
        )}

        {showingEnglish && (
          <p className={`text-white font-semibold text-center ${large ? "text-xl" : "text-base"}`}>
            <EditableWord
              text={word.translation || "(no translation)"}
              editable={canEdit}
              onSave={(v) => updateWordMutation.mutate({ id: word.id, data: { translation: v } })}
              className={`text-white font-semibold ${large ? "text-xl" : "text-base"}`}
              onClick={(e) => e.stopPropagation()}
            />
          </p>
        )}
      </div>

      {/* Mnemonic explanation below image */}
      {(mnemonicExplanations[word.id] || word.mnemonic_explanation) && (
        <div className="px-3 py-1.5 bg-teal-500/10 border-t border-teal-500/20">
          <p
            className={`${large ? "text-sm" : "text-[10px]"} text-teal-300 italic text-center leading-snug`}
            style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
            title={mnemonicExplanations[word.id] || word.mnemonic_explanation}
          >
            💡 {mnemonicExplanations[word.id] || word.mnemonic_explanation}
          </p>
        </div>
      )}

      {/* Custom mnemonic designer */}
      {showCustomMnemonic ? (
        <div className="px-2 pb-1 flex gap-1 items-center" onClick={e => e.stopPropagation()}>
          <input
            ref={inputRef}
            autoFocus
            value={customDesc}
            onChange={e => setCustomDesc(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') generateCustomMnemonic(); if (e.key === 'Escape') setShowCustomMnemonic(false); }}
            placeholder="Describe a scene..."
            className="flex-1 text-[10px] px-2 py-1 rounded border border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 outline-none focus:border-teal-500 min-w-0"
          />
          <button
            onClick={generateCustomMnemonic}
            disabled={!customDesc.trim() || regeneratingImage}
            title="Create the image from your description"
            className="px-1.5 py-1 bg-teal-500 text-white rounded text-[10px] font-bold hover:bg-teal-400 disabled:opacity-40 flex-shrink-0"
          >{regeneratingImage ? <Loader2 className="w-3 h-3 animate-spin" /> : '🔄'}</button>
          <button onClick={() => setShowCustomMnemonic(false)} className="text-slate-500 hover:text-slate-300 flex-shrink-0"><X className="w-3 h-3" /></button>
        </div>
      ) : null}



      {/* Verb infinitive badge */}
      {(word.is_verb || /^l/i.test(word.phonetic || '')) && (
        <div className="px-3 py-1 bg-teal-500/10 border-b border-teal-500/20 flex items-center gap-1">
          <span className="text-[10px] text-teal-300 font-semibold">verb</span>
          <span className="text-[10px] text-slate-500 mx-1">·</span>
          <span className="text-[10px] text-teal-300 font-medium">∞ {word.word || word.phonetic}</span>
        </div>
      )}



      {/* Example sentence */}
      <div className="px-2 pb-2" onClick={e => e.stopPropagation()}>
        {/* Sentence the word was captured from (e.g. a video transcript line) —
            saved on the card with a listen button. Session labels ("Session 3")
            stored in the same column are not sentences and are skipped. */}
        {word.example_sentence && word.example_sentence.includes(' ') && !/^Session \d+$/i.test(word.example_sentence) && (
          <div className="mb-1.5 flex items-start gap-1.5 rounded-lg border border-slate-700 bg-slate-800 p-2">
            <button
              onClick={() => generateLessonAudio({ text: word.example_sentence, language: lang }).play()}
              title="Listen to sentence"
              className="flex-shrink-0 rounded p-0.5 text-sm hover:bg-slate-700 transition-all"
            >
              🔊
            </button>
            <p
              dir={isRTLText(word.example_sentence) ? 'rtl' : 'ltr'}
              className={`flex-1 ${large ? 'text-sm' : 'text-[11px]'} leading-relaxed text-slate-300 ${isRTLText(word.example_sentence) ? 'text-right' : ''}`}
            >
              {word.example_sentence}
            </p>
          </div>
        )}
        <div className="bg-slate-800 rounded-lg p-2 border border-slate-700 min-h-[52px] flex flex-col justify-center gap-0.5">
          {generatingSentence[word.id] ? (
            <div className="flex items-center justify-center gap-1 py-1">
              <Loader2 className="w-3 h-3 animate-spin text-slate-500" />
              <span className="text-[10px] text-slate-500">generating...</span>
            </div>
          ) : cardSentences[word.id] ? (
            <>
              {/* Clickable words — shows Hebrew + transliteration */}
              <SentenceWords
                words={cardSentences[word.id].words}
                onAddToBackpack={(w, meaning, hebrew) => handleAddWordFromSentence(w, meaning, hebrew)}
                showHebrew={showHebrew}
                showTransliteration={showTransliteration}
                lang={lang}
              />
              {/* English + refresh */}
              <div className="flex items-center justify-between gap-1 mt-0.5">
                <p className={`${large ? "text-xs" : "text-[10px]"} text-slate-400 italic flex-1 text-center`}>{cardSentences[word.id].english}</p>
                <button
                  onClick={() => generateCardSentence(word)}
                  className="text-slate-500 hover:text-slate-300 flex-shrink-0 p-0.5 rounded hover:bg-slate-700 transition-all"
                  title="Regenerate sentence"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* Bottom row: ratings + buttons */}
      <div className={`px-2 pb-2 flex items-center ${large ? "gap-2 px-3 pb-3" : "gap-1"}`}>
        <div className={`flex flex-1 ${large ? "gap-1.5" : "gap-0.5"}`}>
          {/* Five-state scale: New (gray) → 1 Recognized (red) → 2 Familiar
              (yellow) → 3 Can Use (light green) → ✓ Mastered (dark green).
              The active level fills with its color. */}
          {[
            { value: 0, label: "New", name: "New", color: "#999999", text: "#ffffff" },
            { value: 1, label: "1", name: "Recognized", color: "#dc2626", text: "#ffffff" },
            { value: 2, label: "2", name: "Familiar", color: "#eab308", text: "#1f2937" },
            { value: 3, label: "3", name: "Can Use", color: "#86efac", text: "#14532d" },
            { value: 5, label: "✓", name: "Mastered", color: "#16a34a", text: "#ffffff" },
          ].map(({ value, label, name, color, text }) => {
            const active =
              (word.times_practiced || 0) === value ||
              // Legacy level-4 words light up (and keep) the "3" bucket.
              (value === 3 && word.times_practiced === 4);
            return (
              <button
                key={value}
                title={name}
                onClick={(e) => handleRateWord(
                  word.id,
                  (value === 3 && word.times_practiced === 4) ? 4 : value,
                  e
                )}
                className={`flex-1 ${large ? "h-10 rounded-lg text-sm" : "h-6 rounded text-xs"} font-bold transition-all`}
                style={active
                  ? { background: color, color: text }
                  : { background: "#1e293b", color, opacity: 0.75 }}
              >
                {label}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => suggestMnemonicForWord(word)}
          disabled={suggestingMnemonic === word.id || reviewLocked}
          className={`${large ? "w-10 h-10 text-lg" : "w-6 h-6"} rounded flex items-center justify-center text-sm transition-all ${reviewLocked ? 'cursor-not-allowed' : 'hover:bg-teal-500/20'}`}
          style={reviewLocked ? { opacity: 0.4 } : undefined}
          title={reviewLocked ? "Approved cards can't be changed" : "Generate mnemonic image"}
        >
          {suggestingMnemonic === word.id ? <Loader2 className="w-3 h-3 animate-spin text-teal-400" /> : '🎨'}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setShowCustomMnemonic(v => !v); setCustomDesc(""); }}
          disabled={reviewLocked}
          className={`${large ? "w-10 h-10 text-lg" : "w-6 h-6"} rounded flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed ${showCustomMnemonic ? 'bg-teal-500/20 text-teal-300' : 'hover:bg-teal-500/20 text-slate-400'}`}
          title={reviewLocked ? "Approved cards can't be changed" : "Design your own mnemonic"}
        >
          <Pencil className={large ? "w-4 h-4" : "w-3 h-3"} />
        </button>
        {canReview && (
          <button
            onClick={cycleReview}
            disabled={updateWordMutation.isPending}
            className={`${large ? "w-10 h-10 text-base" : "w-6 h-6 text-xs"} rounded flex items-center justify-center font-bold transition-all ${reviewStatus ? '' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}
            style={
              reviewStatus === 'approved' ? { background: 'rgba(34,197,94,0.25)', color: '#4ade80' }
              : reviewStatus === 'rejected' ? { background: 'rgba(239,68,68,0.25)', color: '#f87171' }
              : undefined
            }
            title={
              reviewStatus === 'approved' ? "Approved — tap to flag it as wrong"
              : reviewStatus === 'rejected' ? "Flagged for review — tap to clear"
              : "Approve this card"
            }
          >
            {reviewStatus === 'rejected'
              ? <X className={large ? "w-4 h-4" : "w-3 h-3"} strokeWidth={3} />
              : <Check className={large ? "w-4 h-4" : "w-3 h-3"} strokeWidth={3} />}
          </button>
        )}
        {isAdmin && (
          <button
            onClick={() => approveWordMutation.mutate({ id: word.id, approved: !word.approved })}
            disabled={approveWordMutation.isPending}
            className={`${large ? "w-10 h-10" : "w-6 h-6"} rounded flex items-center justify-center text-xs font-bold transition-all ${
              word.approved ? 'bg-green-500/25 hover:bg-red-500/20 text-green-400' : 'bg-slate-800 hover:bg-green-500/20 text-slate-400'
            }`}
            title={word.approved ? "Unapprove card" : "Approve card for all users"}
          >
            ✅
          </button>
        )}
        <button
          onClick={() => {
            // Don't try to delete a synthetic/session card — it isn't a real persisted row.
            if (!isRealWordId) { toast.info("This card isn't saved yet"); return; }
            if (word.approved && !isAdmin) { handleDismissWord(word.id); return; }
            deleteWordMutation.mutate({ id: word.id, phonetic: word.phonetic || word.word });
          }}
          className={`${large ? "w-10 h-10 text-lg" : "w-6 h-6"} rounded flex items-center justify-center text-sm hover:bg-red-500/20 transition-all`}
          title={word.approved && !isAdmin ? "Remove from my view" : "Delete word"}
        >
          🗑️
        </button>
      </div>
    </motion.div>
  );
}
