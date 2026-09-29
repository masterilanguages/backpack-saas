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

// Backpack card: up to 3 usage examples, each stacked as phonetic (top, blue),
// native script (every word tappable → "= meaning · + Add"), English (grey).
// Inline styles: Tailwind doesn't scan .jsx.
function UsageExamples({ examples, loading, lang, showEnglish, onAddToBackpack, target }) {
  const stem = String(target || '').replace(/[֑-ׇ]/g, '').replace(/^[הוכלבמש]/, '');
  const [active, setActive] = useState(null); // "exampleIndex:wordIndex"
  if (loading && !examples?.length) {
    return (
      <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 0', fontSize: 12, color: '#94a3b8' }}>
        <Loader2 className="animate-spin" style={{ width: 14, height: 14 }} /> Writing examples…
      </div>
    );
  }
  if (!examples?.length) return null;
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 4 }} onClick={(e) => e.stopPropagation()}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', color: '#94a3b8', textTransform: 'uppercase', paddingLeft: 2 }}>Examples</div>
      {examples.map((ex, i) => {
        const rtl = isRTLText(ex.hebrew_sentence || '');
        const words = Array.isArray(ex.words) && ex.words.length ? ex.words : null;
        const [ai, wi] = (active || '').split(':').map(Number);
        const picked = active && ai === i && words ? words[wi] : null;
        return (
          <div key={i} style={{ borderRadius: 12, background: 'linear-gradient(180deg,#f5f7ff,#eef2ff)', border: '1px solid #e0e7ff', padding: '4px 10px' }}>
            {needsTransliteration(lang) && (
              <div style={{ fontSize: 12, fontStyle: 'italic', color: '#4f46e5', lineHeight: 1.3 }}>{ex.transliteration}</div>
            )}
            <div dir={rtl ? 'rtl' : 'ltr'} style={{ fontSize: 15, color: '#0f172a', lineHeight: 1.35, textAlign: rtl ? 'right' : 'left' }}>
              {words
                ? words.map((w, j) => (
                    <span key={j}>
                      <span
                        onClick={() => setActive(active === `${i}:${j}` ? null : `${i}:${j}`)}
                        style={{
                          cursor: 'pointer', borderRadius: 4, padding: '0 2px',
                          borderBottom: '1px dotted #a5b4fc',
                          background: active === `${i}:${j}` ? '#e0e7ff' : 'transparent',
                          ...(stem && String(w.hebrew || '').replace(/[֑-ׇ]/g, '').includes(stem) ? { color: '#4f46e5', fontWeight: 700 } : {}),
                        }}
                      >
                        {w.hebrew}
                      </span>
                      {j < words.length - 1 ? ' ' : ''}
                    </span>
                  ))
                : ex.hebrew_sentence}
            </div>
            {showEnglish !== false && ex.english && (
              <div style={{ fontSize: 10.5, color: '#94a3b8', lineHeight: 1.25 }}>{ex.english}</div>
            )}
            {picked && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, padding: '4px 8px', borderRadius: 10, background: '#fff', border: '1px solid #c7d2fe', fontSize: 12 }}>
                <span style={{ fontWeight: 700, color: '#4338ca' }}>{picked.word}</span>
                {picked.meaning && <span style={{ color: '#64748b', flex: 1 }}>= {picked.meaning}</span>}
                <button
                  onClick={() => { onAddToBackpack(picked.word, picked.meaning, picked.hebrew); setActive(null); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 3, background: '#6366f1', color: '#fff', border: 0, borderRadius: 8, padding: '3px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                >
                  <Plus style={{ width: 12, height: 12 }} /> Add
                </button>
                <button onClick={() => setActive(null)} style={{ background: 'none', border: 0, color: '#94a3b8', cursor: 'pointer' }}><X style={{ width: 13, height: 13 }} /></button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const RATING_HINTS = {
  1: "1 — Don't know it yet",
  2: "2 — Barely recognize it",
  3: "3 — Getting there",
  4: "4 — Know it well",
  5: "5 — Mastered",
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
  // Backpack only: the 3 usage examples are being generated for this card.
  generatingExamples = false,
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

  // ---------------------------------------------------------------------------
  // Backpack single-card view (variant C1, chosen by the client): white card,
  // the mnemonic image in a large circle, the 💡 line as a pill on the circle's
  // bottom edge, the word stacked (Hebrew / phonetic / meaning on tap), then the
  // video sentence, the action buttons and the 1–5 rating row.
  // Everything is inline-styled: Tailwind doesn't scan .jsx, so new classes here
  // would never be generated.
  // ---------------------------------------------------------------------------
  if (large) {
    const explanation = mnemonicExplanations[word.id] || word.mnemonic_explanation;
    const hasSentence = word.example_sentence && word.example_sentence.includes(' ') && !/^Session \d+$/i.test(word.example_sentence);
    const roundBtn = {
      width: 38, height: 38, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#f1f5f9', color: '#334155', fontSize: 15, border: 0, cursor: 'pointer', transition: 'transform .15s',
    };
    const toggleBtn = (on) => ({
      fontSize: 11, fontWeight: 700, padding: '4px 9px', borderRadius: 999, lineHeight: 1, cursor: 'pointer',
      border: `1px solid ${on ? '#14b8a6' : '#e2e8f0'}`, background: on ? '#14b8a6' : '#fff', color: on ? '#fff' : '#475569',
    });
    const statusChip =
      reviewStatus === 'approved' ? { text: '✓ Approved', bg: '#dcfce7', fg: '#15803d' }
      : reviewStatus === 'rejected' ? { text: '✕ Needs review', bg: '#fee2e2', fg: '#b91c1c' }
      : word.approved ? { text: '✓ Approved card', bg: '#dcfce7', fg: '#15803d' }
      : word._shared ? { text: '⭐ New — tap to rank', bg: '#ccfbf1', fg: '#0f766e' }
      : null;

    return (
      <motion.div
        key={word.id}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        style={{
          flex: '1 0 auto', width: '100%', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center',
          background: '#fff', borderRadius: 28, padding: '12px 12px 14px', color: '#0f172a',
          boxShadow: review
            ? `0 0 0 2px ${review.ring}, 0 20px 50px -24px rgba(79,70,229,.35)`
            : '0 20px 50px -24px rgba(79,70,229,.35)',
        }}
      >
        {/* Status chip (left) + EN / native-script toggles (right) */}
        <div style={{ position: 'absolute', top: 12, left: 12, right: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 3 }}>
          {statusChip
            ? <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: statusChip.bg, color: statusChip.fg }}>{statusChip.text}</span>
            : <span />}
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={(e) => { e.stopPropagation(); onEnglishToggle?.(); }} style={toggleBtn(showAllEnglish)} title="Toggle English">EN</button>
            {needsTransliteration(lang) && (
              <button onClick={(e) => { e.stopPropagation(); onHebrewToggle?.(); }} style={toggleBtn(showHebrew)} title={`Toggle ${languageLabel(lang)}`}>
                {String(lang).toLowerCase() === 'arabic' ? 'ع' : 'א'}
              </button>
            )}
          </div>
        </div>

        {/* Image in a circle, 💡 pill on its bottom edge, actions in a column to its right */}
        <div style={{ position: 'relative', width: '100%', display: 'flex', justifyContent: 'center', marginTop: 36, flexShrink: 0 }}>
        <div style={{ position: 'relative', width: 'min(186px, 52%)' }}>
          <div
            onClick={() => setRevealed(r => !r)}
            style={{
              position: 'relative', width: '100%', aspectRatio: '1 / 1', borderRadius: '50%', overflow: 'hidden', cursor: 'pointer',
              background: 'radial-gradient(circle at 40% 35%, #f5f3ff 0%, #e0e7ff 60%, #c7d2fe 100%)',
              boxShadow: '0 0 0 7px #fff, 0 0 0 8px #eef2ff, 0 18px 36px -14px rgba(79,70,229,.45)',
            }}
          >
            {word.image_url && !imgFailed ? (
              <img
                src={word.image_url}
                alt={word.phonetic}
                onError={() => setImgFailed(true)}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            ) : (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, textAlign: 'center', padding: 24 }}>
                {(isGeneratingImage || regeneratingImage) ? (
                  <>
                    <Loader2 className="animate-spin" style={{ width: 28, height: 28, color: '#6366f1' }} />
                    <span style={{ fontSize: 12, color: '#64748b' }}>Generating image…</span>
                  </>
                ) : (
                  !reviewLocked && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setImgFailed(false); suggestMnemonicForWord(word); }}
                      style={{ fontSize: 12, fontWeight: 600, color: '#4f46e5', background: '#fff', border: '1px solid #c7d2fe', borderRadius: 999, padding: '6px 12px', cursor: 'pointer' }}
                    >
                      🎨 Create image
                    </button>
                  )
                )}
              </div>
            )}
          </div>
          {explanation && (
            <div style={{ position: 'absolute', left: '50%', bottom: -16, transform: 'translateX(-50%)', width: 'min(172%, 310px)', display: 'flex', justifyContent: 'center', containerType: 'inline-size' }}>
              <span
                style={{
                  maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', fontStyle: 'italic', color: '#0f766e',
                  background: '#f0fdfa', border: '1px solid #ccfbf1', borderRadius: 999, padding: '6px 14px',
                  boxShadow: '0 6px 16px -8px rgba(15,118,110,.4)',
                  fontSize: `max(11px, min(13px, calc(100cqw / ${((explanation.length + 6) * 0.56).toFixed(2)})))`,
                }}
              >
                💡 {explanation}
              </span>
            </div>
          )}
        </div>
        {/* Actions: regenerate image · design your own · review ✓ · (admin share) · delete */}
        <div style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button
            onClick={() => suggestMnemonicForWord(word)}
            disabled={suggestingMnemonic === word.id || reviewLocked}
            title={reviewLocked ? "Approved cards can't be changed" : 'Generate mnemonic image'}
            style={{ ...roundBtn, opacity: reviewLocked ? 0.4 : 1, cursor: reviewLocked ? 'not-allowed' : 'pointer' }}
          >
            {suggestingMnemonic === word.id ? <Loader2 className="animate-spin" style={{ width: 16, height: 16, color: '#6366f1' }} /> : '🎨'}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setShowCustomMnemonic(v => !v); setCustomDesc(''); }}
            disabled={reviewLocked}
            title={reviewLocked ? "Approved cards can't be changed" : 'Design your own mnemonic'}
            style={{ ...roundBtn, opacity: reviewLocked ? 0.4 : 1, cursor: reviewLocked ? 'not-allowed' : 'pointer', ...(showCustomMnemonic ? { background: '#e0e7ff', color: '#4f46e5' } : {}) }}
          >
            <Pencil style={{ width: 16, height: 16 }} />
          </button>
          {canReview && (
            <button
              onClick={cycleReview}
              disabled={updateWordMutation.isPending}
              title={
                reviewStatus === 'approved' ? 'Approved — tap to flag it as wrong'
                : reviewStatus === 'rejected' ? 'Flagged for review — tap to clear'
                : 'Approve this card'
              }
              style={{
                ...roundBtn,
                ...(reviewStatus === 'approved' ? { background: '#dcfce7', color: '#16a34a' }
                  : reviewStatus === 'rejected' ? { background: '#fee2e2', color: '#dc2626' }
                  : {}),
              }}
            >
              {reviewStatus === 'rejected'
                ? <X style={{ width: 17, height: 17 }} strokeWidth={3} />
                : <Check style={{ width: 17, height: 17 }} strokeWidth={3} />}
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => approveWordMutation.mutate({ id: word.id, approved: !word.approved })}
              disabled={approveWordMutation.isPending}
              title={word.approved ? 'Unapprove card' : 'Approve card for all users'}
              style={{ ...roundBtn, ...(word.approved ? { background: '#dcfce7' } : {}) }}
            >
              ✅
            </button>
          )}
          <button
            onClick={() => {
              if (!isRealWordId) { toast.info("This card isn't saved yet"); return; }
              if (word.approved && !isAdmin) { handleDismissWord(word.id); return; }
              deleteWordMutation.mutate({ id: word.id, phonetic: word.phonetic || word.word });
            }}
            title={word.approved && !isAdmin ? 'Remove from my view' : 'Delete word'}
            style={{ ...roundBtn, color: '#ef4444' }}
          >
            🗑️
          </button>
        </div>
        </div>

        {/* Word, stacked: native script / phonetic / meaning (tap to reveal) */}
        <div onClick={() => setRevealed(r => !r)} style={{ textAlign: 'center', marginTop: explanation ? 24 : 12, cursor: 'pointer', flexShrink: 0 }}>
          {showHebrew && (
            <div dir={nativeWordRTL ? 'rtl' : 'ltr'} style={{ fontSize: 32, fontWeight: 800, color: '#1e1b4b', lineHeight: 1.1 }}>
              <EditableWord
                text={word.word}
                language={nativeWordRTL ? 'he' : 'en'}
                editable={canEdit}
                onSave={(v) => updateWordMutation.mutate({ id: word.id, data: { word: v } })}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}
          {showTransliteration && (
            <div style={{ fontSize: 16, fontStyle: 'italic', color: '#4f46e5', marginTop: 2 }}>
              <EditableWord
                text={word.phonetic || word.word}
                editable={canEdit}
                onSave={(v) => updateWordMutation.mutate({ id: word.id, data: { phonetic: v } })}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}
          {showingEnglish ? (
            <div style={{ fontSize: 17, fontWeight: 600, color: '#0f172a', marginTop: 4 }}>
              <EditableWord
                text={word.translation || '(no translation)'}
                editable={canEdit}
                onSave={(v) => updateWordMutation.mutate({ id: word.id, data: { translation: v } })}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          ) : (
            <div style={{ display: 'inline-block', fontSize: 11.5, color: '#94a3b8', marginTop: 5, borderBottom: '1px dashed #c7d2fe' }}>
              👆 tap to reveal meaning
            </div>
          )}
          {(word.is_verb || /^l/i.test(word.phonetic || '')) && (
            <div style={{ fontSize: 11, color: '#0f766e', marginTop: 4 }}>verb · ∞ {word.word || word.phonetic}</div>
          )}
        </div>

        {/* 3 usage examples under the word (phonetic on top) */}
        <div style={{ width: '100%', marginTop: 8, flexShrink: 0 }}>
          <UsageExamples
            examples={Array.isArray(word.usage_examples) ? word.usage_examples : null}
            loading={generatingExamples}
            lang={lang}
            showEnglish
            target={word.word}
            onAddToBackpack={(w, meaning, hebrew) => handleAddWordFromSentence(w, meaning, hebrew)}
          />
        </div>

        {/* Custom mnemonic designer (✎) */}
        {showCustomMnemonic && (
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', display: 'flex', gap: 6, alignItems: 'center', marginTop: 10 }}>
            <input
              ref={inputRef}
              autoFocus
              value={customDesc}
              onChange={e => setCustomDesc(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') generateCustomMnemonic(); if (e.key === 'Escape') setShowCustomMnemonic(false); }}
              placeholder="Describe a scene…"
              style={{ flex: 1, minWidth: 0, fontSize: 13, padding: '8px 12px', borderRadius: 12, border: '1px solid #c7d2fe', outline: 'none', color: '#0f172a' }}
            />
            <button
              onClick={generateCustomMnemonic}
              disabled={!customDesc.trim() || regeneratingImage}
              title="Create the image from your description"
              style={{ ...roundBtn, background: '#6366f1', color: '#fff', opacity: !customDesc.trim() || regeneratingImage ? 0.5 : 1 }}
            >
              {regeneratingImage ? <Loader2 className="animate-spin" style={{ width: 16, height: 16 }} /> : '✓'}
            </button>
            <button onClick={() => setShowCustomMnemonic(false)} style={roundBtn} title="Cancel"><X style={{ width: 16, height: 16 }} /></button>
          </div>
        )}

        <div style={{ flex: 1, minHeight: 8 }} />

        {/* Sentence the word was captured from, with listen */}
        {hasSentence && (
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: 14, padding: '8px 12px', flexShrink: 0 }}>
            <button
              onClick={() => generateLessonAudio({ text: word.example_sentence, language: lang }).play()}
              title="Listen to sentence"
              style={{ background: 'none', border: 0, cursor: 'pointer', fontSize: 15 }}
            >
              🔊
            </button>
            <p dir={isRTLText(word.example_sentence) ? 'rtl' : 'ltr'} style={{ flex: 1, fontSize: 15, lineHeight: 1.4, color: '#1e293b', textAlign: isRTLText(word.example_sentence) ? 'right' : 'left' }}>
              {word.example_sentence}
            </p>
          </div>
        )}
        {(generatingSentence[word.id] || cardSentences[word.id]) && (
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', marginTop: 6, background: '#f8fafc', border: '1px solid #eef2f7', borderRadius: 14, padding: '8px 12px', flexShrink: 0, color: '#1e293b' }}>
            {generatingSentence[word.id] ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12, color: '#64748b' }}>
                <Loader2 className="animate-spin" style={{ width: 14, height: 14 }} /> generating…
              </div>
            ) : (
              <>
                <SentenceWords
                  words={cardSentences[word.id].words}
                  onAddToBackpack={(w, meaning, hebrew) => handleAddWordFromSentence(w, meaning, hebrew)}
                  showHebrew={showHebrew}
                  showTransliteration={showTransliteration}
                  lang={lang}
                />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 2 }}>
                  <p style={{ flex: 1, textAlign: 'center', fontSize: 12, fontStyle: 'italic', color: '#64748b' }}>{cardSentences[word.id].english}</p>
                  <button onClick={() => generateCardSentence(word)} title="Regenerate sentence" style={{ background: 'none', border: 0, cursor: 'pointer', color: '#94a3b8' }}>
                    <RefreshCw style={{ width: 13, height: 13 }} />
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* 1–5 rating (5 = mastered) */}
        <div style={{ width: '100%', display: 'flex', gap: 6, flexShrink: 0, marginTop: 8 }}>
          {[1, 2, 3, 4, 5].map((value) => {
            const active = word.times_practiced === value;
            const color = value === 5 ? '#22c55e' : '#14b8a6';
            return (
              <button
                key={value}
                onClick={(e) => handleRateWord(word.id, value, e)}
                title={RATING_HINTS[value]}
                style={{
                  flex: 1, height: 42, borderRadius: 12, border: 0, cursor: 'pointer', fontSize: 16, fontWeight: 700,
                  background: active ? color : '#f1f5f9', color: active ? '#fff' : '#64748b',
                  boxShadow: active ? `0 6px 14px -6px ${color}` : 'none', transition: 'background .15s',
                }}
              >
                {value}
              </button>
            );
          })}
        </div>
      </motion.div>
    );
  }

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
        <div className="px-3 py-1.5 bg-teal-500/10 border-t border-teal-500/20" style={{ containerType: 'inline-size' }}>
          {/* Always ONE line: the text is kept short (≤42 chars), and anything
              longer (e.g. locked approved cards) shrinks its font to fit
              instead of wrapping or being cut with "…". */}
          <p
            className="text-teal-300 italic text-center leading-snug"
            style={{
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              fontSize: `min(${large ? 14 : 10}px, calc(100cqw / ${(((mnemonicExplanations[word.id] || word.mnemonic_explanation || '').length + 3) * 0.56).toFixed(2)}))`,
            }}
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
          {/* 1–5 knowledge scale; 5 = mastered (sets `mastered`). The tapped
              level fills teal (green for 5). */}
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              onClick={(e) => handleRateWord(word.id, value, e)}
              title={RATING_HINTS[value]}
              className={`flex-1 ${large ? 'h-10 rounded-lg text-base' : 'h-6 rounded text-xs'} font-bold transition-all ${
                word.times_practiced === value
                  ? value === 5 ? 'bg-green-500 text-white' : 'bg-teal-500 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {value}
            </button>
          ))}
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
