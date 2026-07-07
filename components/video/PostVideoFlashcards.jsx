"use client";

import React, { useState, useEffect } from "react";
import PostSessionJournal from "./PostSessionJournal";
import { motion, AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Pause, RefreshCw, Check } from "lucide-react";
import { languageLabel, isRTLText } from "@/lib/language";

const RATINGS = [
  { value: 1, label: "1", color: "#ef4444" },
  { value: 2, label: "2", color: "#f97316" },
  { value: 3, label: "3", color: "#eab308" },
  { value: 5, label: "M ⭐", color: "#22c55e" },
];

export default function PostVideoFlashcards({ words, onClose, onJournal, videoTitle, userProfile }) {
  const queryClient = useQueryClient();
  const lang = userProfile?.language || "hebrew";
  const isHebrew = lang === "hebrew";
  const langLabel = languageLabel(lang);
  const [step, setStep] = useState("flashcards");
  const [cardIdx, setCardIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState([]);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [showJournal, setShowJournal] = useState(false);
  const [showHebrew, setShowHebrew] = useState(true);
  const [showEnglish, setShowEnglish] = useState(false);
  const [mnemonicData, setMnemonicData] = useState({});
  const [customMnemonicInput, setCustomMnemonicInput] = useState(null); // key or null
  const [customMnemonicText, setCustomMnemonicText] = useState("");
  const [approvedState, setApprovedState] = useState({}); // local approved override per word id

  const updateWordMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Word.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['wordRatings'] }),
  });

  const createWordMutation = useMutation({
    mutationFn: (data) => base44.entities.Word.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['wordRatings'] }),
  });

  const getKey = (word) => word.id || word.phonetic;

  // Pre-generate mnemonics for current + next 2 cards in parallel
  useEffect(() => {
    if (step !== "flashcards") return;
    const toGenerate = words.slice(cardIdx, cardIdx + 3);
    toGenerate.forEach(word => {
      if (!word) return;
      const key = getKey(word);
      if (mnemonicData[key]) return;
      // Seed from existing DB data first
      if (word.image_url || word.mnemonic_explanation) {
        setMnemonicData(prev => ({
          ...prev,
          [key]: {
            image_url: word.image_url || null,
            explanation: word.mnemonic_explanation || null,
            loading: !word.image_url // still generate image if missing
          }
        }));
        if (!word.image_url) generateMnemonic(word);
      } else {
        generateMnemonic(word);
      }
    });
  }, [cardIdx, step]);

  const generateMnemonic = async (word) => {
    const key = getKey(word);
    setMnemonicData(prev => ({ ...prev, [key]: { ...(prev[key] || {}), loading: true } }));
    try {
      const isVerb = word.is_verb === true;
      // The "l" infinitive prefix stripping only applies to Hebrew verbs (e.g. "lalechet").
      const stripHebrewPrefix = isHebrew && isVerb && /^l/i.test(word.phonetic);
      const soundPhonetic = stripHebrewPrefix ? word.phonetic.slice(1) : word.phonetic;
      const concept = await base44.integrations.Core.InvokeLLM({
        prompt: `Create a mnemonic to remember the word "${soundPhonetic}" meaning "${word.translation}".
Find an English word/phrase that SOUNDS like "${soundPhonetic}"${stripHebrewPrefix ? ` (the "l" at the start of "${word.phonetic}" is just the Hebrew infinitive prefix — completely ignore it, base the sound only on "${soundPhonetic}")` : ''} and connect it visually to the meaning "${word.translation}".

CRITICAL: Do NOT name any character, creature, animal, or person in the image with the sound-anchor word, the target word, or any variant. They are just generic characters/objects performing the action.

Return JSON with:
- sound_anchor: English word/phrase that sounds like "${soundPhonetic}"
- explanation: one punchy memorable sentence using the sound_anchor that hints at the meaning WITHOUT using the exact English translation "${word.translation}" or "${word.phonetic}". Use synonyms or indirect references.
- image_prompt: vivid cartoon scene description (no text in image, single clear subject, bright colors, no naming any creatures or characters)`,
        response_json_schema: {
          type: "object",
          properties: {
            sound_anchor: { type: "string" },
            explanation: { type: "string" },
            image_prompt: { type: "string" }
          }
        }
      });

      const imageResult = await base44.integrations.Core.GenerateImage({
        prompt: `${concept.image_prompt}. 3D Pixar-style render, high definition, glossy and vibrant, expressive cartoon character with big eyes, cinematic lighting, ultra-detailed textures, colorful and fun. Plain white background. ABSOLUTELY NO TEXT, NO LETTERS, NO WORDS anywhere in the image.`
      });

      setMnemonicData(prev => ({
        ...prev,
        [key]: { image_url: imageResult.url, explanation: concept.explanation, loading: false }
      }));

      // Persist to DB if word has an id
      if (word.id) {
        base44.entities.Word.update(word.id, { image_url: imageResult.url, mnemonic_explanation: concept.explanation }).catch(e => { console.error('save mnemonic failed', e); toast.error('Could not save mnemonic — it may be lost on reload'); });
      }
    } catch (e) {
      setMnemonicData(prev => ({ ...prev, [key]: { ...(prev[key] || {}), loading: false } }));
      toast.error("Failed to generate mnemonic");
    }
  };

  // Detect if a word is a conjugated verb and return the infinitive form if so
  const normalizeToInfinitive = async (word) => {
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Is "${word.phonetic}" (meaning: "${word.translation}") in ${langLabel} a conjugated verb form (not an infinitive/base form)? If yes, return the infinitive/dictionary form. If it's already an infinitive or not a verb, return it as-is.

Return JSON only:
- is_conjugated: boolean
- infinitive_phonetic: the infinitive in Latin transliteration
- infinitive_word: the infinitive in native script (${langLabel})
- infinitive_translation: English meaning of the infinitive (e.g. "to run" not "ran")`,
        response_json_schema: {
          type: "object",
          properties: {
            is_conjugated: { type: "boolean" },
            infinitive_phonetic: { type: "string" },
            infinitive_word: { type: "string" },
            infinitive_translation: { type: "string" }
          }
        }
      });
      if (result.is_conjugated && result.infinitive_phonetic) {
        return {
          ...word,
          phonetic: result.infinitive_phonetic,
          word: result.infinitive_word || word.word,
          translation: result.infinitive_translation || word.translation,
          is_verb: true,
        };
      }
    } catch (e) { /* fall through */ }
    return word;
  };

  const handleRate = async (word, rating) => {
    setSaving(true);
    const key = getKey(word);
    const imageUrl = mnemonicData[key]?.image_url;
    // Retry-backup the generated mnemonic explanation alongside the rating (same backup path as image_url)
    const mnemonicExplanation = mnemonicData[key]?.customExplanation || mnemonicData[key]?.explanation;
    setResults(prev => [...prev, { word, rating }]);

    if (word.id) {
      await updateWordMutation.mutateAsync({
        id: word.id,
        data: { times_practiced: rating, mastered: rating >= 5, ...(imageUrl ? { image_url: imageUrl } : {}), ...(mnemonicExplanation ? { mnemonic_explanation: mnemonicExplanation } : {}) }
      });
    } else {
      // Normalize conjugated verbs to their infinitive before saving
      const normalizedWord = await normalizeToInfinitive(word);
      // Fetch current user so the dedup check is scoped to this user's own words
      let me = null;
      try {
        me = await base44.auth.me();
      } catch (e) {
        console.error("Could not load current user", e);
      }
      // Check if this infinitive already exists to avoid duplicates — scoped to this user (word_sel is world-readable)
      const existing = await base44.entities.Word.filter({ phonetic: normalizedWord.phonetic, created_by: me?.email });
      if (existing.length > 0) {
        await updateWordMutation.mutateAsync({
          id: existing[0].id,
          data: { times_practiced: rating, mastered: rating >= 5, ...(imageUrl ? { image_url: imageUrl } : {}), ...(mnemonicExplanation ? { mnemonic_explanation: mnemonicExplanation } : {}) }
        });
      } else {
        await createWordMutation.mutateAsync({
          word: normalizedWord.word,
          translation: normalizedWord.translation,
          phonetic: normalizedWord.phonetic,
          category: "wordbank",
          language: userProfile?.language || "hebrew",
          times_practiced: rating,
          mastered: rating >= 5,
          vocab_level: 0,
          is_verb: normalizedWord.is_verb || false,
          ...(imageUrl ? { image_url: imageUrl } : {}),
          ...(mnemonicExplanation ? { mnemonic_explanation: mnemonicExplanation } : {}),
        });
      }
    }

    setSaving(false);
    if (cardIdx + 1 >= words.length) {
      setShowJournal(true);
    } else {
      setCardIdx(i => i + 1);
      setFlipped(false);
    }
  };

  const handleApprove = async (word) => {
    if (!word.id) return;
    const currentApproved = approvedState[word.id] !== undefined ? approvedState[word.id] : word.approved;
    const newApproved = !currentApproved;
    setApprovedState(prev => ({ ...prev, [word.id]: newApproved }));
    await updateWordMutation.mutateAsync({ id: word.id, data: { approved: newApproved } });
    toast.success(newApproved ? "Card approved ✅" : "Approval removed");
  };

  const handleSkip = () => {
    if (cardIdx + 1 >= words.length) setStep("done");
    else { setCardIdx(i => i + 1); setFlipped(false); }
  };

  const currentWord = words[cardIdx];
  const currentKey = currentWord ? getKey(currentWord) : null;
  const currentMnemonic = currentKey ? mnemonicData[currentKey] : null;

  if (showJournal) {
    return (
      <PostSessionJournal
        words={words}
        onClose={() => { setShowJournal(false); setStep("done"); }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center px-4 py-6 overflow-y-auto"
      style={{ background: 'linear-gradient(160deg, #020617 0%, #0f172a 100%)' }}>



      {/* Confirm leave dialog */}
      {confirmLeave && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-sm w-full mx-4 text-center space-y-4 shadow-2xl">
            <div className="text-4xl">⏸️</div>
            <h3 className="text-white font-bold text-lg">Leave this session?</h3>
            <p className="text-slate-400 text-sm">Your progress so far will be saved.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmLeave(false)}
                className="flex-1 py-3 rounded-xl font-semibold text-sm bg-slate-800 text-slate-200 hover:bg-slate-700"
              >
                Keep Going
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-xl font-semibold text-sm bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20"
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">


        {step === "flashcards" && currentWord && (
          <motion.div
            key={`card-${cardIdx}`}
            initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -60 }}
            className="w-full max-w-sm flex flex-col gap-3"
          >
            {/* Progress */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-teal-500 rounded-full transition-all"
                  style={{ width: `${(cardIdx / words.length) * 100}%` }}
                />
              </div>
              <span className="text-slate-400 text-xs">{cardIdx + 1} / {words.length}</span>
            </div>

            {/* Card */}
            <div
              className="w-full rounded-3xl overflow-hidden select-none shadow-lg"
              style={{ background: '#0f172a', border: '1px solid #1e293b' }}
            >
              {/* Top-right controls: Hebrew/translit toggle + pause */}
              <div className="flex justify-between items-center px-3 pt-3">
                <div />
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowHebrew(v => !v); }}
                    className={`px-2 py-1 rounded-lg text-xs font-bold transition-all border ${
                      showHebrew ? 'bg-teal-500/15 border-teal-500/30 text-teal-300' : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                    title={showHebrew ? "Switch to transliteration" : `Switch to ${langLabel}`}
                  >
                    {showHebrew ? (isHebrew ? 'א' : langLabel.charAt(0)) : 'abc'}
                  </button>
                  <button
                    onClick={() => setConfirmLeave(true)}
                    className="text-slate-500 hover:text-slate-300 transition-colors p-1.5 rounded-full hover:bg-slate-800"
                    title="Exit session"
                  >
                    <Pause className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Approved badge - always shown at top if approved */}
              {(approvedState[currentWord.id] !== undefined ? approvedState[currentWord.id] : currentWord.approved) && (
                <div className="flex items-center justify-center gap-1 px-4 py-2 bg-green-500/10 border-b border-green-500/20">
                  <span className="text-green-400 text-sm font-bold">✅ Approved card</span>
                </div>
              )}

              {/* Mnemonic image — white bg, contain */}
              <div className="w-full flex items-center justify-center bg-slate-800" style={{ minHeight: 200 }}>
                {currentMnemonic?.loading ? (
                  <div className="flex flex-col items-center gap-2 py-12">
                    <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
                    <p className="text-slate-400 text-xs">Generating mnemonic...</p>
                  </div>
                ) : currentMnemonic?.image_url ? (
                  <img
                    src={currentMnemonic.image_url}
                    alt="mnemonic"
                    className="w-full"
                    style={{ objectFit: 'contain', maxHeight: 260, background: '#1e293b' }}
                  />
                ) : (
                  <div className="py-12 text-slate-500 text-sm">No image yet</div>
                )}
              </div>

              {/* Mnemonic explanation — always shown */}
              <div className="px-5 py-2 bg-teal-500/10 border-t border-teal-500/20" style={{ minHeight: 36 }}>
                {/* Always show the AI explanation if present */}
                {currentMnemonic?.explanation && (
                  <div className="flex items-center gap-2">
                    <p className="text-teal-300 text-xs italic flex-1 truncate">💡 {currentMnemonic.explanation}</p>
                    {!customMnemonicInput && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setCustomMnemonicInput(currentKey); setCustomMnemonicText(currentMnemonic.customExplanation || ""); }}
                        className="flex-shrink-0 w-7 h-7 rounded-full bg-teal-500/15 hover:bg-teal-500/25 flex items-center justify-center text-base transition-all"
                        title="Write your own mnemonic"
                      >✏️</button>
                    )}
                  </div>
                )}
                {!currentMnemonic?.explanation && !currentMnemonic?.loading && !customMnemonicInput && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setCustomMnemonicInput(currentKey); setCustomMnemonicText(""); }}
                    className="w-full text-xs text-teal-400 hover:text-teal-300 text-center"
                  >✏️ Write your own mnemonic</button>
                )}
                {currentMnemonic?.loading && !currentMnemonic?.explanation && (
                  <p className="text-teal-400 text-xs text-center italic">Crafting mnemonic...</p>
                )}

                {/* Custom mnemonic inline input */}
                {customMnemonicInput === currentKey && (
                  <div className="mt-2 space-y-1" onClick={e => e.stopPropagation()}>
                    <div className="flex gap-1">
                      <input
                        autoFocus
                        value={customMnemonicText}
                        onChange={e => setCustomMnemonicText(e.target.value)}
                        placeholder="Your own memory trick..."
                        className="flex-1 text-xs px-2 py-1 rounded-lg border border-slate-700 bg-slate-800 text-white placeholder:text-slate-500 outline-none focus:border-teal-500"
                        onKeyDown={async e => {
                          if (e.key === 'Escape') { setCustomMnemonicInput(null); return; }
                          if (e.key === 'Enter' && customMnemonicText.trim()) {
                            const text = customMnemonicText.trim();
                            setMnemonicData(prev => ({ ...prev, [currentKey]: { ...prev[currentKey], customExplanation: text, loading: true } }));
                            if (currentWord.id) base44.entities.Word.update(currentWord.id, { mnemonic_explanation: text }).catch(e => { console.error('save mnemonic failed', e); toast.error('Could not save mnemonic — it may be lost on reload'); });
                            setCustomMnemonicInput(null);
                            try {
                              const imageResult = await base44.integrations.Core.GenerateImage({
                                prompt: `${text}. 3D Pixar-style render, high definition, glossy and vibrant, expressive cartoon character with big eyes, cinematic lighting, ultra-detailed textures, colorful and fun. Plain white background. ABSOLUTELY NO TEXT, NO LETTERS, NO WORDS anywhere in the image.`
                              });
                              setMnemonicData(prev => ({ ...prev, [currentKey]: { ...prev[currentKey], image_url: imageResult.url, loading: false } }));
                              if (currentWord.id) base44.entities.Word.update(currentWord.id, { image_url: imageResult.url }).catch(e => { console.error('save mnemonic failed', e); toast.error('Could not save mnemonic — it may be lost on reload'); });
                            } catch (e) {
                              setMnemonicData(prev => ({ ...prev, [currentKey]: { ...prev[currentKey], loading: false } }));
                              toast.error("Failed to generate image");
                            }
                          }
                        }}
                      />
                      <button
                        onClick={() => {
                          if (customMnemonicText.trim()) {
                            setMnemonicData(prev => ({ ...prev, [currentKey]: { ...prev[currentKey], customExplanation: customMnemonicText.trim() } }));
                            if (currentWord.id) base44.entities.Word.update(currentWord.id, { mnemonic_explanation: customMnemonicText.trim() }).catch(e => { console.error('save mnemonic failed', e); toast.error('Could not save mnemonic — it may be lost on reload'); });
                          }
                          setCustomMnemonicInput(null);
                        }}
                        className="text-xs px-2 py-1 rounded-lg bg-teal-500 text-white font-semibold hover:bg-teal-400"
                      >Save</button>
                      <button onClick={() => setCustomMnemonicInput(null)} className="text-xs text-slate-400 hover:text-slate-200 px-1">✕</button>
                    </div>
                    {/* Generate new image from custom text */}
                    <button
                      onClick={async () => {
                        if (!customMnemonicText.trim()) return;
                        // Save text first
                        setMnemonicData(prev => ({ ...prev, [currentKey]: { ...prev[currentKey], customExplanation: customMnemonicText.trim(), loading: true } }));
                        if (currentWord.id) base44.entities.Word.update(currentWord.id, { mnemonic_explanation: customMnemonicText.trim() }).catch(e => { console.error('save mnemonic failed', e); toast.error('Could not save mnemonic — it may be lost on reload'); });
                        setCustomMnemonicInput(null);
                        try {
                          const imageResult = await base44.integrations.Core.GenerateImage({
                            prompt: `${customMnemonicText.trim()}. 3D Pixar-style render, high definition, glossy and vibrant, expressive cartoon character with big eyes, cinematic lighting, ultra-detailed textures, colorful and fun. Plain white background. ABSOLUTELY NO TEXT, NO LETTERS, NO WORDS anywhere in the image.`
                          });
                          setMnemonicData(prev => ({ ...prev, [currentKey]: { ...prev[currentKey], image_url: imageResult.url, loading: false } }));
                          if (currentWord.id) base44.entities.Word.update(currentWord.id, { image_url: imageResult.url }).catch(e => { console.error('save mnemonic failed', e); toast.error('Could not save mnemonic — it may be lost on reload'); });
                        } catch (e) {
                          setMnemonicData(prev => ({ ...prev, [currentKey]: { ...prev[currentKey], loading: false } }));
                          toast.error("Failed to generate image");
                        }
                      }}
                      disabled={!customMnemonicText.trim()}
                      className="w-full text-xs py-1 rounded-lg bg-teal-500/15 hover:bg-teal-500/25 text-teal-300 font-semibold transition-all disabled:opacity-40"
                    >
                      🎨 Save & Generate New Image
                    </button>
                  </div>
                )}

                {/* Show custom override if set */}
                {!customMnemonicInput && currentMnemonic?.customExplanation && (
                  <div className="flex items-center gap-1 justify-center mt-1">
                    <p className="text-teal-300 text-xs text-center italic flex-1 truncate">🌟 {currentMnemonic.customExplanation}</p>
                    <button onClick={e => { e.stopPropagation(); setCustomMnemonicInput(currentKey); setCustomMnemonicText(currentMnemonic.customExplanation); }} className="text-sm hover:scale-110 transition-transform flex-shrink-0">✏️</button>
                  </div>
                )}
              </div>

              {/* Word info */}
              <div className="flex flex-col items-center px-6 pt-4 pb-2 gap-1" onClick={() => !flipped && setFlipped(true)}>
                {/* English always shown */}
                <p className="text-white font-bold text-2xl">{currentWord.translation}</p>

                {/* Phonetic + Hebrew: revealed on flip, hidden if Hebrew toggle OFF */}
                {flipped && !showHebrew && (
                  <>
                    <p className="text-teal-400 font-bold text-xl">{currentWord.phonetic}</p>
                    {currentWord.word && (
                      <p className="text-teal-300 font-bold text-lg" dir={isRTLText(currentWord.word) ? "rtl" : "ltr"} style={{ fontFamily: 'serif' }}>
                        {currentWord.word}
                      </p>
                    )}
                  </>
                )}

                {/* Tap hint */}
                {!flipped && (
                  <p className="text-slate-500 text-xs mt-2">tap to reveal the word</p>
                )}

                <AnimatePresence>
                  {flipped && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex gap-2 w-full mt-3 mb-1"
                    >
                      {RATINGS.map(r => (
                        <button
                          key={r.value}
                          onClick={(e) => { e.stopPropagation(); handleRate(currentWord, r.value); }}
                          disabled={saving}
                          className="flex-1 py-3 px-1 rounded-xl font-bold text-sm transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                          style={{ background: `${r.color}18`, border: `1.5px solid ${r.color}60`, color: r.color }}
                        >
                          {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : r.label}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Bottom action row inside card */}
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800">
                <div className="flex gap-1.5 items-center">
                  {/* Regenerate mnemonic */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const key = getKey(currentWord);
                      setMnemonicData(prev => ({ ...prev, [key]: undefined }));
                      generateMnemonic(currentWord);
                    }}
                    disabled={currentMnemonic?.loading}
                    className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-teal-300 hover:bg-slate-800 transition-all"
                    title="New mnemonic"
                  >
                    {currentMnemonic?.loading ? <Loader2 className="w-3 h-3 animate-spin" /> : '🎨'}
                  </button>

                  {/* English toggle */}
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowEnglish(v => !v); }}
                    className={`px-2 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                      showEnglish ? 'bg-teal-500/15 border-teal-500/30 text-teal-300' : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                    title="Toggle English"
                  >
                    {showEnglish ? '👁 EN' : '🙈 EN'}
                  </button>

                  {/* Approve / Disapprove */}
                  {currentWord.id && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleApprove(currentWord); }}
                      className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                        (approvedState[currentWord.id] !== undefined ? approvedState[currentWord.id] : currentWord.approved)
                          ? 'bg-green-500/15 border-green-500/30 text-green-400'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-green-400 hover:bg-green-500/10'
                      }`}
                      title={(approvedState[currentWord.id] !== undefined ? approvedState[currentWord.id] : currentWord.approved) ? "Click to disapprove" : "Approve card"}
                    >
                      <Check className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <button
                  onClick={(e) => { e.stopPropagation(); handleSkip(); }}
                  className="text-slate-500 text-xs hover:text-slate-300 transition-colors"
                >
                  Skip →
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {step === "done" && (
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-md w-full text-center space-y-5"
          >
            <div className="text-6xl">🎒</div>
            <h2 className="text-white text-2xl font-bold">Session Complete!</h2>
            <p className="text-slate-400">
              You reviewed <span className="text-teal-400 font-bold">{words.length} words</span>.
            </p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {results.map((r, i) => (
                <div key={i} className="bg-slate-900 rounded-xl p-3 flex justify-between items-center border border-slate-800 shadow-sm">
                  <span className="text-slate-300">{r.word.phonetic}</span>
                  <span className="font-bold" style={{ color: RATINGS.find(rt => rt.value === r.rating)?.color }}>
                    {r.rating === 5 ? "⭐ M" : `Lvl ${r.rating}`}
                  </span>
                </div>
              ))}
            </div>
            <div className="space-y-3">
              {onJournal && (
                <button
                  onClick={onJournal}
                  className="w-full py-4 rounded-2xl text-white font-bold text-lg"
                  style={{ background: 'linear-gradient(135deg, #14b8a6, #0d9488)' }}
                >
                  📓 Write in Journal →
                </button>
              )}
              <button
                onClick={onClose}
                className="w-full py-3 rounded-2xl font-semibold text-sm bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800"
              >
                Done
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}