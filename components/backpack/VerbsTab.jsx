"use client";

import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { languageLabel, isRTLText, usesNikud, needsTransliteration } from "@/lib/language";

// Detect if a word is likely a verb by phonetic pattern
function looksLikeVerb(word) {
  const p = (word.phonetic || word.word || "").toLowerCase();
  return word.is_verb === true || /^l[aeiou]/i.test(p);
}

const TENSES = ["past", "present", "future"];
const TENSE_LABELS = { past: "Past", present: "Present", future: "Future" };

function ConjugationTable({ conjugations, onEdit }) {
  if (!conjugations) return null;
  const persons = [
    { key: "i", label: "I" },
    { key: "you_m", label: "You (m)" },
    { key: "you_f", label: "You (f)" },
    { key: "he", label: "He" },
    { key: "she", label: "She" },
    { key: "we", label: "We" },
    { key: "you_pl", label: "You (pl)" },
    { key: "they", label: "They" },
  ];
  return (
    <div className="grid grid-cols-3 gap-2 mt-2">
      {TENSES.map(tense => (
        <div key={tense} className="bg-slate-800 rounded-lg p-2 border border-slate-700">
          <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">{TENSE_LABELS[tense]}</p>
          {persons.map(({ key, label }) => {
            const val = conjugations[tense]?.[key];
            if (!val && val !== '') return null;
            return (
              <div key={key} className="flex justify-between items-baseline gap-1 py-0.5 border-b border-slate-700 last:border-0">
                <span className="text-[9px] text-slate-400 shrink-0">{label}</span>
                <EditableConjugation
                  value={val || ''}
                  onChange={(newVal) => onEdit(tense, key, newVal)}
                />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function EditableConjugation({ value, onChange }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const commit = () => {
    setEditing(false);
    if (draft !== value) onChange(draft);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(value); setEditing(false); } }}
        className="text-[11px] text-teal-300 font-medium text-right bg-slate-800 border border-teal-500 rounded px-1 outline-none w-full"
      />
    );
  }
  return (
    <span
      onClick={() => { setDraft(value); setEditing(true); }}
      className="text-[11px] text-teal-300 font-medium text-right cursor-pointer hover:underline hover:bg-slate-800 rounded px-0.5"
    >
      {value || <span className="text-slate-500 italic">—</span>}
    </span>
  );
}

function isHebrew(str) {
  return /[֐-׿]/.test(str || '');
}

export default function VerbsTab({ words }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState({});
  const [generating, setGenerating] = useState({});
  const [localConjugations, setLocalConjugations] = useState({});
  const [localHebrew, setLocalHebrew] = useState({});

  const updateWordMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Word.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['wordRatings'] }),
    onError: (e) => {
      console.error("updateWordMutation failed", e);
      toast.error("Could not save verb update");
    },
  });

  const verbWords = words.filter(looksLikeVerb);

  // Auto-fetch native script for any verb missing it (only for languages whose
  // native form differs from its Latin transliteration, e.g. Hebrew). For
  // Latin-script languages the word already is its own native spelling.
  useEffect(() => {
    // Persist a 'hebrew fetch attempted' marker outside component state so a
    // permanently-failing write doesn't re-fire the (paid) LLM call on every remount.
    let attempted;
    try {
      attempted = new Set(JSON.parse(localStorage.getItem('verbHebrewFetchAttempted') || '[]'));
    } catch {
      attempted = new Set();
    }
    const markAttempted = (id) => {
      if (!id) return;
      attempted.add(id);
      try { localStorage.setItem('verbHebrewFetchAttempted', JSON.stringify([...attempted])); } catch (e) { console.error('Could not persist verbHebrewFetchAttempted', e); }
    };

    verbWords.forEach(word => {
      const lang = word.language || 'hebrew';
      // Latin-script languages don't have a separate native script to fetch.
      if (!needsTransliteration(lang)) return;
      if (localHebrew[word.id]) return;
      if (isHebrew(word.word)) return; // already has native script
      if (attempted.has(word.id)) return; // already tried — avoid repeated LLM cost
      // word.word is just transliteration, fetch native script
      markAttempted(word.id);
      const label = languageLabel(lang);
      const nikudHint = usesNikud(lang) ? ` (${label} script WITH full nikud / vowel points, e.g. לְהִשְׁתַּתֵּף)` : ` (correct native spelling in ${label})`;
      base44.integrations.Core.InvokeLLM({
        prompt: `Convert the ${label} transliteration "${word.phonetic || word.word}" to its native ${label} script characters. Return JSON with: hebrew${nikudHint}.`,
        response_json_schema: { type: 'object', properties: { hebrew: { type: 'string' } } }
      }).then(res => {
        if (res?.hebrew) {
          setLocalHebrew(prev => ({ ...prev, [word.id]: res.hebrew }));
          if (word.id) updateWordMutation.mutateAsync({ id: word.id, data: { word: res.hebrew } }).catch(e => console.error('Failed to persist verb Hebrew script', e));
        }
      }).catch(e => console.error('Failed to fetch verb Hebrew script', e));
    });
  }, [verbWords.length]); // eslint-disable-line

  const generateConjugations = async (word) => {
    const lang = word.language || 'hebrew';
    const label = languageLabel(lang);
    const valueInstruction = needsTransliteration(lang)
      ? 'Values should be the transliterated (Latin letters) conjugated form only.'
      : `Values should be the conjugated form in ${label} (correct native spelling).`;
    setGenerating(prev => ({ ...prev, [word.id]: true }));
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Generate ${label} verb conjugations for the verb "${word.phonetic || word.word}" (meaning: "${word.translation}").

Return JSON with conjugations object containing past, present, future keys.
Each tense is an object with keys: i, you_m, you_f, he, she, we, you_pl, they.
${valueInstruction}`,
        response_json_schema: {
          type: "object",
          properties: {
            conjugations: {
              type: "object",
              properties: {
                past: { type: "object" },
                present: { type: "object" },
                future: { type: "object" },
              }
            }
          }
        }
      });

      const conj = result.conjugations;
      setLocalConjugations(prev => ({ ...prev, [word.id]: conj }));

      if (word.id) {
        await updateWordMutation.mutateAsync({
          id: word.id,
          data: { is_verb: true, verb_conjugations: conj }
        });
      }
      toast.success("Conjugations generated!");
    } catch (e) {
      toast.error("Failed to generate conjugations");
    }
    setGenerating(prev => ({ ...prev, [word.id]: false }));
  };

  const handleEditConjugation = async (word, conj, tense, personKey, newVal) => {
    const updated = {
      ...conj,
      [tense]: { ...conj[tense], [personKey]: newVal }
    };
    setLocalConjugations(prev => ({ ...prev, [word.id]: updated }));
    if (word.id) {
      await updateWordMutation.mutateAsync({ id: word.id, data: { verb_conjugations: updated } });
    }
  };

  const toggleExpand = async (word) => {
    const isExpanded = expanded[word.id];
    setExpanded(prev => ({ ...prev, [word.id]: !isExpanded }));
    if (!isExpanded && !word.verb_conjugations && !localConjugations[word.id] && !generating[word.id]) {
      await generateConjugations(word);
    }
  };

  if (verbWords.length === 0) {
    return <p className="text-slate-400 text-center py-8">No verbs in your backpack yet.</p>;
  }

  return (
    <div className="space-y-2">
      {verbWords.map(word => {
        const conj = localConjugations[word.id] || word.verb_conjugations;
        const isExpanded = expanded[word.id];
        return (
          <div key={word.id} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <button
              onClick={() => toggleExpand(word)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800 transition-all"
            >
              <div className="flex items-center gap-3 text-left">
                <span className="text-teal-400 font-bold text-base">{word.phonetic || word.word}</span>
                <span className="text-slate-400 text-xs">=</span>
                <span className="text-slate-200 text-sm">{word.translation}</span>
                {(localHebrew[word.id] || isHebrew(word.word) ? (localHebrew[word.id] || word.word) : null) && (
                  (() => {
                    const nativeText = localHebrew[word.id] || word.word;
                    return (
                      <span className="text-teal-300 text-sm font-medium" dir={isRTLText(nativeText) ? "rtl" : "ltr"}>{nativeText}</span>
                    );
                  })()
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {conj && <span className="text-[10px] text-green-500 font-semibold">✓ conjugated</span>}
                {generating[word.id] ? (
                  <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                ) : isExpanded ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </div>
            </button>

            {isExpanded && (
              <div className="px-4 pb-4">
                {generating[word.id] ? (
                  <div className="flex items-center justify-center gap-2 py-4">
                    <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                    <span className="text-slate-400 text-sm">Generating conjugations...</span>
                  </div>
                ) : conj ? (
                  <ConjugationTable
                    conjugations={conj}
                    onEdit={(tense, key, val) => handleEditConjugation(word, conj, tense, key, val)}
                  />
                ) : (
                  <button
                    onClick={() => generateConjugations(word)}
                    className="w-full py-2 rounded-lg text-sm text-teal-300 border border-teal-500/40 bg-teal-500/15 hover:bg-teal-500/25 transition-all"
                  >
                    Generate conjugations
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
