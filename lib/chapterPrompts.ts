// Prompts that turn chapter sentences into transliteration, English and a
// gloss per word. Shared by the app (lib, Next.js) and the prepareChapter edge
// function (Deno), so a chapter prepared on the server reads the same as one
// prepared in the browser. Pure TypeScript: no imports.

// Transliteration is where a small model fails in Hebrew (written without
// vowels, Haiku guessed "Nikansta lekhayay" for נכנסת לחיי = "Nichnast lechayai";
// measured: Sonnet 5.5 still misreads forms, Opus 5.5 gets them right).
export const QUALITY_MODEL = "claude-opus-5-5";

// Simple style, like the lyric videos students compare with: no hyphens or
// apostrophes, one-letter prefixes joined to their word (Mark's choice).
export const HEBREW_TRANSLIT_RULES = `Transliterate Hebrew exactly as it is pronounced in modern Israeli Hebrew (for song lyrics, as it is sung), in a simple everyday style: "ch" for ח and for כ without dagesh, "tz" for צ, "sh" for ש, every vowel that is actually spoken, and no hyphens or apostrophes. Work out each word's grammatical form from the context (person, gender, tense) before transliterating it, and use its real pronunciation, never a letter-by-letter guess. Keep one Latin word per Hebrew word, with a one-letter prefix (ו ה ב כ ל מ ש) joined to its word. Examples: נכנסת לחיי = nichnast lechayai; לפני שוויתרתי = lifnei shevitarti; הערת את הלב בים של צבעים = heart et halev beyam shel tzvaim; בן אדם, מה לך נרדם = ben adam, ma lecha nirdam.`;

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
