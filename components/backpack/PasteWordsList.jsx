"use client";

import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { languageLabel, nativeScriptInstruction } from "@/lib/language";

/**
 * Accepts a pasted list of words (one per line, or comma-separated).
 * Each line can be:
 *   - just a word/transliteration  → AI will fill the translation
 *   - "word - meaning" or "word: meaning" or "word, meaning"
 * All words are created at vocab level 0 (New).
 */
export default function PasteWordsList({ userProfile, onWordsAdded }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  const handleImport = async () => {
    if (!text.trim()) return;
    setLoading(true);

    // Fetch current user so the dedup check is scoped to this user's own words
    let me = null;
    try {
      me = await base44.auth.me();
    } catch (e) {
      console.error("Could not load current user", e);
    }

    // Parse lines
    const lines = text
      .split(/[\n,]+/)
      .map(l => l.trim())
      .filter(Boolean);

    // Try to split each line into word + meaning
    const parsed = lines.map(line => {
      const match = line.match(/^(.+?)\s*[-:]\s*(.+)$/);
      if (match) return { phonetic: match[1].trim(), translation: match[2].trim() };
      return { phonetic: line.trim(), translation: "" };
    });

    // For entries missing translation, ask AI to fill them all at once
    const needsTranslation = parsed.filter(w => !w.translation);
    if (needsTranslation.length > 0) {
      try {
        const lang = userProfile?.language || "hebrew";
        const langCap = languageLabel(lang);
        const result = await base44.integrations.Core.InvokeLLM({
          prompt: `Translate these ${langCap} words/transliterations to English. Return JSON with a "words" array matching the input order, each with: phonetic (keep as given), translation (English meaning, 1-4 words), hebrew (${nativeScriptInstruction(lang)}).\n\nWords: ${needsTranslation.map(w => w.phonetic).join(", ")}`,
          response_json_schema: {
            type: "object",
            properties: {
              words: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    phonetic: { type: "string" },
                    translation: { type: "string" },
                    hebrew: { type: "string" }
                  }
                }
              }
            }
          }
        });
        const filled = result?.words || [];
        let fillIdx = 0;
        for (const w of parsed) {
          if (!w.translation && filled[fillIdx]) {
            w.translation = filled[fillIdx].translation || "";
            w.hebrew = filled[fillIdx].hebrew || "";
            fillIdx++;
          }
        }
      } catch (e) {
        toast.error("Could not auto-translate some words");
      }
    }

    // Create all words at level 0, skipping duplicates
    let added = 0;
    let skipped = 0;
    const lang = userProfile?.language || "hebrew";
    for (const w of parsed) {
      if (!w.phonetic) continue;
      try {
        // Scope dedup to this user's own words (word_sel is world-readable)
        const existing = await base44.entities.Word.filter({ phonetic: w.phonetic, created_by: me?.email });
        if (existing.length > 0) { skipped++; continue; }
        await base44.entities.Word.create({
          word: w.hebrew || w.phonetic,
          translation: w.translation || w.phonetic,
          phonetic: w.phonetic,
          category: "wordbank",
          language: lang,
          times_practiced: 0,
          mastered: false,
          vocab_level: 0,
        });
        added++;
      } catch (e) {
        console.error("Failed to add word:", w.phonetic, e);
      }
    }

    const skippedMsg = skipped > 0 ? ` (${skipped} duplicate${skipped > 1 ? "s" : ""} skipped)` : "";
    toast.success(`${added} word${added !== 1 ? "s" : ""} added to New cards!${skippedMsg} ✨`);
    setText("");
    setOpen(false);
    onWordsAdded?.();
    setLoading(false);
  };

  return (
    <div className="mt-3 border-t border-slate-800 pt-3">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
      >
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        Paste a list of words
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          <p className="text-[11px] text-slate-400">
            One word per line. Optionally add meaning: <em>shalom - hello</em>. Missing meanings are auto-filled.
          </p>
          <Textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={"shalom\ntodah - thank you\nma nishma\nkelev - dog"}
            className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 text-sm resize-none h-28 focus:border-teal-500 focus:outline-none"
          />
          <Button
            onClick={handleImport}
            disabled={loading || !text.trim()}
            size="sm"
            style={{ background: '#14b8a6', color: 'white' }}
          >
            {loading ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> Importing...</> : "Add to New Cards"}
          </Button>
        </div>
      )}
    </div>
  );
}
