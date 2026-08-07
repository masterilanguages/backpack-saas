"use client";

// PhotoWordCapture — snap a photo of handwritten vocabulary words and add
// them to the Backpack. Mobile-first: the file input uses capture="environment"
// so phones open the camera directly.
//
// Flow: photo → UploadFile (storage) → InvokeLLM with the image URL (Claude
// vision reads the handwriting) → cleaned word list → the SAME
// pendingBackpackWords localStorage flow the Backpack page already reads on
// mount ({ word, meaning: "", hebrew: "" }), plus a browser event for any
// live listeners. No separate backpack system.

import React, { useRef, useState } from "react";
import { Loader2, Camera } from "lucide-react";
import { toast } from "sonner";
import { base44 as base44Client } from "@/api/base44Client";
import { languageLabel, isRTLText } from "@/lib/language";

const base44 = base44Client;

export default function PhotoWordCapture({ language = "hebrew" }) {
  const inputRef = useRef(null);
  const [scanning, setScanning] = useState(false);
  const [captured, setCaptured] = useState([]); // last scan's words, shown as chips

  const handlePhoto = async (e) => {
    const file = e.target.files?.[0];
    // Allow re-selecting the same photo next time.
    e.target.value = "";
    if (!file) return;

    setScanning(true);
    setCaptured([]);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });

      const label = languageLabel(language);
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `This photo shows handwritten (or printed) vocabulary words a student is learning ${label}. Read the image carefully and extract ONLY the individual vocabulary words — no sentences, no headings, no translations, no numbering. Keep each word exactly as written (native script preserved). Return JSON: { "words": ["...", "..."] }. If the image contains no readable words, return { "words": [] }.`,
        file_urls: [file_url],
        response_json_schema: {
          type: "object",
          properties: { words: { type: "array", items: { type: "string" } } },
        },
      });

      // Clean: trim, drop empties, dedupe case-insensitively.
      const seen = new Set();
      const words = (result?.words || [])
        .map((w) => String(w || "").trim())
        .filter((w) => {
          if (!w) return false;
          const k = w.toLowerCase();
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });

      if (words.length === 0) {
        toast.error("I couldn’t find words in that photo. Try a brighter, closer shot.");
        return;
      }

      // Same pending flow StickyNote/Backpack use — the Backpack page picks
      // these up on mount and walks the user through rating them.
      const pending = JSON.parse(localStorage.getItem("pendingBackpackWords") || "[]");
      const additions = words.map((w) => ({
        word: w,
        meaning: "",
        hebrew: isRTLText(w) ? w : "",
      }));
      localStorage.setItem("pendingBackpackWords", JSON.stringify([...pending, ...additions]));
      window.dispatchEvent(new CustomEvent("pendingBackpackWordsUpdated", { detail: { added: words.length } }));

      setCaptured(words);
      toast.success(`${words.length} word${words.length > 1 ? "s" : ""} added to backpack.`);
    } catch (err) {
      console.error("PhotoWordCapture failed", err);
      toast.error("Couldn’t scan that photo — please try again.");
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="flex-shrink-0">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handlePhoto}
        className="hidden"
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={scanning}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-stone-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-teal-500 hover:text-teal-700 disabled:opacity-60"
      >
        {scanning ? <Loader2 className="h-4 w-4 animate-spin text-teal-600" /> : <Camera className="h-4 w-4 text-teal-600" />}
        {scanning ? "Scanning your photo…" : "📷 Scan handwritten words"}
      </button>

      {captured.length > 0 && (
        <div className="mt-2 rounded-2xl border border-stone-200 bg-white px-3 py-2 shadow-sm">
          <p className="mb-1.5 text-[11px] font-semibold text-slate-400">
            Captured — review &amp; rate them in your Backpack:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {captured.map((w) => (
              <span
                key={w}
                dir={isRTLText(w) ? "rtl" : "ltr"}
                className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-800"
              >
                {w}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
