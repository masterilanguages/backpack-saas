"use client";

// AddWordsSheet — type one word or a whole list (one per line, or separated by
// commas) and each becomes its own flashcard. One LLM call fills in native
// script, transliteration and English meaning for the whole batch, then a Word
// row is created per word — the same shape the transcript "add to backpack"
// popup writes.

import React, { useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { languageLabel, nativeScriptInstruction, isRTLText } from "@/lib/language";

/** Split free text into distinct words/phrases: newlines, commas, semicolons. */
function parseEntries(text) {
  const seen = new Set();
  return String(text || "")
    .split(/[\n,;،]+/)
    .map((w) => w.trim())
    .filter((w) => {
      if (!w) return false;
      const k = w.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

export default function AddWordsSheet({ open, onClose, language = "hebrew", existingWords = [], onAdded }) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const entries = parseEntries(text);
  const label = languageLabel(language);

  const close = () => {
    if (saving) return;
    setText("");
    onClose();
  };

  const isDuplicate = (entry, info = {}) => {
    const keys = [entry, info.word, info.phonetic].filter(Boolean).map((s) => s.toLowerCase());
    return existingWords.some((w) =>
      keys.includes((w.word || "").toLowerCase()) || keys.includes((w.phonetic || "").toLowerCase())
    );
  };

  const save = async () => {
    const fresh = entries.filter((e) => !isDuplicate(e));
    const skipped = entries.length - fresh.length;
    if (fresh.length === 0) {
      toast.info(entries.length === 1 ? "Already in your backpack!" : "All of these are already in your backpack!");
      return;
    }

    setSaving(true);
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `A student learning ${label} typed these words to make flashcards. Each item may be written in native ${label} script, in Latin transliteration, or occasionally as an English word they want in ${label}.

Items:
${fresh.map((e, i) => `${i + 1}. ${e}`).join("\n")}

For EVERY item, in the same order, return:
- input: the item exactly as given
- word: ${nativeScriptInstruction(language)}
- phonetic: Latin-letter transliteration of the ${label} word (for Latin-script languages, the word itself)
- translation: English meaning, 1-4 words

Return JSON: { "items": [ { "input", "word", "phonetic", "translation" } ] }`,
        response_json_schema: {
          type: "object",
          properties: {
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  input: { type: "string" },
                  word: { type: "string" },
                  phonetic: { type: "string" },
                  translation: { type: "string" },
                },
              },
            },
          },
        },
      });

      const infoByInput = new Map((result?.items || []).map((it) => [String(it.input || "").trim().toLowerCase(), it]));
      const created = [];
      let dupes = skipped;
      for (let i = 0; i < fresh.length; i++) {
        const entry = fresh[i];
        // Match by echoed input, falling back to position.
        const info = infoByInput.get(entry.toLowerCase()) || result?.items?.[i] || {};
        if (isDuplicate(entry, info)) { dupes++; continue; }
        const row = await base44.entities.Word.create({
          word: info.word || entry,
          translation: info.translation || "",
          phonetic: info.phonetic || entry,
          category: "wordbank",
          language,
          times_practiced: 0,
          mastered: false,
        });
        created.push(row);
      }

      if (created.length > 0) {
        toast.success(`${created.length} card${created.length > 1 ? "s" : ""} added! 🎒`);
      }
      if (dupes > 0) toast.info(`${dupes} already in your backpack — skipped`);
      onAdded?.(created);
      setText("");
      onClose();
    } catch (e) {
      console.error("AddWordsSheet failed", e);
      toast.error("Couldn't add the words — please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={close}>
      <div
        className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">Add words</h2>
          <button onClick={close} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-2 text-sm text-slate-500">
          Type a {label} word — or several, one per line or separated by commas. Each one becomes a card.
        </p>
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save(); }}
          dir={isRTLText(text) ? "rtl" : "ltr"}
          rows={4}
          placeholder={language === "hebrew" ? "שלום\nkelev, chatul" : "word one\nword two, word three"}
          className="w-full resize-none rounded-2xl border border-indigo-100 bg-slate-50 px-4 py-3 text-base text-slate-800 outline-none placeholder:text-slate-400 focus:border-indigo-400"
        />
        {entries.length > 1 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {entries.map((w) => (
              <span
                key={w}
                dir={isRTLText(w) ? "rtl" : "ltr"}
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  isDuplicate(w) ? "bg-slate-100 text-slate-400 line-through" : "bg-indigo-50 text-indigo-700"
                }`}
              >
                {w}
              </span>
            ))}
          </div>
        )}
        <button
          onClick={save}
          disabled={saving || entries.length === 0}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-fuchsia-500 to-indigo-500 px-5 py-3 font-semibold text-white shadow disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {saving
            ? "Creating cards…"
            : entries.length > 1
              ? `Add ${entries.length} cards`
              : "Add card"}
        </button>
      </div>
    </div>
  );
}
