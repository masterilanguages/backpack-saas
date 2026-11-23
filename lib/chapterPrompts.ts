// Prompts that turn chapter sentences into transliteration, English and a
// gloss per word. Shared by the app (lib, Next.js) and the prepareChapter edge
// function (Deno), so a chapter prepared on the server reads the same as one
// prepared in the browser. Pure TypeScript: no imports.

// Transliteration is where a small model fails in Hebrew (written without
// vowels, Haiku guessed "Nikansta lekhayay" for נכנסת לחיי = "nichnast lechayai";
// measured: Sonnet still misreads forms, Opus gets them right). Hebrew
// romanization always asks for QUALITY_MODEL. The deterministic romanizer in
// lib/speech/hebrewRomanization.ts then locks vocalized output to this standard.
export const QUALITY_MODEL = "claude-opus-5-5";

// Platform standard for every school teaching Hebrew. Full write-up: docs/speech.md.
// Apostrophe is only the glottal of א/ע between vowels (le'ehov, sha'a) — the
// old "no apostrophes" line deleted ע and, in one example, taught the English
// word "heart" for הערת.
export const HEBREW_TRANSLIT_RULES = `Transliterate Hebrew exactly as it is pronounced in modern Israeli Hebrew (for song lyrics, as it is sung). Use "ch" for ח and for כ/ך without dagesh (never "kh", never the English "ch" of "chair"); "k" for כּ; "tz" for צ (never "ts" or "tsch"); "sh" for שׁ and "s" for שׂ; "t" for ת (never "th" or Ashkenazi "s"); "b" for בּ and word-initial ב, "v" for fricative ב and consonantal ו. Work out each word's grammatical form from context (person, gender, number, tense) and write the vowels that are actually spoken — never a letter-by-letter guess, never Ashkenazi or Biblical forms (no "oy" for holam, no "shabbos", no "sav"). א and ע are silent at the start or end of a word; between vowels write an apostrophe (le'ehov, sha'a, me'a, lir'ot, tzva'im). Final ה is silent (toda, not todah). No hyphens. One Latin word per Hebrew word, with a one-letter prefix (ו ה ב כ ל מ ש) joined to its word. Examples: נכנסת לחיי = nichnast lechayai; לפני שוויתרתי = lifnei shevitarti; הערת את הלב בים של צבעים = he'arta et halev beyam shel tzva'im; בן אדם, מה לך נרדם = ben adam, ma lecha nirdam; לֶאֱהֹב = le'ehov; שַׁבָּת = shabbat; חָמֵשׁ = chamesh.`;

export const translitRules = (label: string) => (/hebrew/i.test(label) ? `\n${HEBREW_TRANSLIT_RULES}` : "");

// Chapter sentences carry a gloss per word ({ w, phonetic, meaning }), made
// with the sentence translation, so a tapped word shows its meaning at once.
export const glossPrompt = (label: string, texts: string[]) => `For each ${label} sentence below give its Latin-letter transliteration, a natural English translation, and every word of it (split on spaces, in order) with its transliteration and its English meaning in this context (1-4 words).${translitRules(label)}
${texts.map((t, i) => `${i}: ${t}`).join("\n")}
Return JSON: { "items": [ { "i": number, "transliteration": string, "english": string, "words": [ { "w": the word exactly as written, "phonetic": string, "meaning": string } ] } ] }`;

export const GLOSS_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          i: { type: "number" },
          transliteration: { type: "string" },
          english: { type: "string" },
          words: { type: "array", items: { type: "object", properties: { w: { type: "string" }, phonetic: { type: "string" }, meaning: { type: "string" } } } },
        },
      },
    },
  },
};

export const cleanGlosses = (words: any) =>
  (Array.isArray(words) ? words : [])
    .filter((g: any) => g?.w && g?.meaning)
    .map((g: any) => ({ w: String(g.w), phonetic: String(g.phonetic || ""), meaning: String(g.meaning) }));

// App language name ("hebrew") -> the label used in prompts ("Hebrew").
export const promptLanguageLabel = (lang: string) => {
  const l = String(lang || "").trim();
  return l ? l.charAt(0).toUpperCase() + l.slice(1).toLowerCase() : "the target language";
};

// Same as glossPrompt, but each line may come with a second hearing of the
// same seconds (YouTube's own captions). The model first fixes words that were
// clearly misheard — choosing between the two hearings, never rewriting —
// then transliterates, translates and glosses the corrected line.
export const reviewGlossPrompt = (label: string, lines: { text: string; alt?: string }[]) => `Below are the lines of a ${label} video as heard by speech recognition (A), with a second independent hearing of the same seconds where available (B). For each line:
1. "fixed": the line in ${label} script with only the words that were clearly misheard corrected — words that do not exist in ${label}, or that do not fit the grammar or meaning of the line (wrong person, gender, a letter swapped). Use B and the surrounding lines to choose the right word. Never rewrite, shorten, reorder or improve the line; if unsure, keep A's word. If nothing is wrong, return A unchanged.
2. Its Latin-letter transliteration, a natural English translation, and every word of the fixed line (split on spaces, in order) with its transliteration and its English meaning in this context (1-4 words).${translitRules(label)}
${lines.map((l, i) => `${i}: A: ${l.text}${l.alt ? `\n   B: ${l.alt}` : ""}`).join("\n")}
Return JSON: { "items": [ { "i": number, "fixed": string, "transliteration": string, "english": string, "words": [ { "w": the word exactly as written in "fixed", "phonetic": string, "meaning": string } ] } ] }`;

export const REVIEW_GLOSS_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          i: { type: "number" },
          fixed: { type: "string" },
          transliteration: { type: "string" },
          english: { type: "string" },
          words: { type: "array", items: { type: "object", properties: { w: { type: "string" }, phonetic: { type: "string" }, meaning: { type: "string" } } } },
        },
      },
    },
  },
};
