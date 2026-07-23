// Turns a personal journal entry into a target-language lesson.
//
// This is the single place the Journal feature builds its generation prompt and
// parses the model's structured output. Keeping it out of the page component
// makes the shape reusable (e.g. Masteri could later call the same generator for
// an assignment) and keeps the UI thin.
//
// The model is asked for a natural target-language rendering of the entry split
// into sentence groups, plus key vocabulary, speaking prompts and mnemonic
// hooks. Transliteration is only meaningful for non-Latin scripts (Hebrew) — for
// Latin-script languages the target line already IS its own transliteration, so
// those fields come back empty and the UI omits the extra line.

import { languageLabel, needsTransliteration } from "@/lib/language";

export interface LessonSentence {
  /** Natural target-language sentence (native script). */
  target: string;
  /** English translation. */
  english: string;
  /** Latin-letter pronunciation. Empty for Latin-script languages. */
  transliteration: string;
}

export interface LessonVocab {
  /** The word in the target language (native script). */
  word: string;
  /** English meaning. */
  translation: string;
  /** Latin-letter pronunciation. Empty for Latin-script languages. */
  transliteration: string;
  /** Part of speech, e.g. "verb", "noun". Optional. */
  partOfSpeech?: string;
  /** A short example sentence in the target language. Optional. */
  example?: string;
}

export interface LessonMnemonic {
  word: string;
  /** A memorable hook that ties the word's sound/shape to its meaning. */
  hook: string;
}

export interface GeneratedLesson {
  sentences: LessonSentence[];
  vocab: LessonVocab[];
  speakingPrompts: string[];
  mnemonics: LessonMnemonic[];
  /** Convenience: full target text (sentences joined). */
  generatedTargetText: string;
  /** Convenience: full English translation (sentences joined). */
  englishTranslation: string;
}

export interface GenerateLessonInput {
  originalText: string;
  targetLanguage: string;
  level?: string; // beginner | intermediate | advanced
  tone?: string; // casual | warm | professional | funny | simple and clear
  focus?: string; // travel | emotions | work | ...
  /** base44.integrations.Core — passed in so this module stays UI/SDK-agnostic. */
  invokeLLM: (args: any) => Promise<any>;
}

const LESSON_SCHEMA = {
  type: "object",
  properties: {
    sentences: {
      type: "array",
      items: {
        type: "object",
        properties: {
          target: { type: "string" },
          english: { type: "string" },
          transliteration: { type: "string" },
        },
        required: ["target", "english"],
      },
    },
    vocab: {
      type: "array",
      items: {
        type: "object",
        properties: {
          word: { type: "string" },
          translation: { type: "string" },
          transliteration: { type: "string" },
          partOfSpeech: { type: "string" },
          example: { type: "string" },
        },
        required: ["word", "translation"],
      },
    },
    speakingPrompts: { type: "array", items: { type: "string" } },
    mnemonics: {
      type: "array",
      items: {
        type: "object",
        properties: {
          word: { type: "string" },
          hook: { type: "string" },
        },
        required: ["word", "hook"],
      },
    },
  },
  required: ["sentences", "vocab", "speakingPrompts"],
};

export async function generateLesson(
  input: GenerateLessonInput
): Promise<GeneratedLesson> {
  const { originalText, targetLanguage, level, tone, focus, invokeLLM } = input;
  const langName = languageLabel(targetLanguage);
  const wantsTransliteration = needsTransliteration(targetLanguage);

  const transliterationRule = wantsTransliteration
    ? `For every sentence and vocab item, ALSO provide a Latin-letter transliteration in the "transliteration" field (e.g. "Ani chozer le-Miami ha-yom.").`
    : `${langName} uses the Latin alphabet, so leave every "transliteration" field as an empty string "".`;

  const prompt = `You are a warm, encouraging language tutor helping a learner turn their personal journal entry into a ${langName} mini-lesson they can actually use in real life.

The learner may have written in English OR already in ${langName}. Either way, produce a natural, correct ${langName} version — do not translate word-for-word; make it sound like a native speaker journaling.

Learner's entry:
"""
${originalText}
"""

Settings:
- Target language: ${langName}
- Level: ${level || "beginner"} (match vocabulary and grammar complexity to this level)
- Tone: ${tone || "casual"}
${focus ? `- Focus topic: ${focus} (lean the vocabulary toward this theme where natural)` : ""}

Produce JSON with:
1. "sentences": the ${langName} version split into short sentence groups. Each has "target" (${langName} in its native script), "english" (a faithful but natural English translation), and "transliteration". ${transliterationRule}
2. "vocab": 6-12 KEY words or short phrases from the lesson worth learning, each with "word" (${langName} native script), "translation" (English), "transliteration" (${wantsTransliteration ? "Latin letters" : 'empty string ""'}), "partOfSpeech", and a short "example" sentence in ${langName}.
3. "speakingPrompts": 3-4 short follow-up questions IN ENGLISH that invite the learner to keep talking about their entry out loud.
4. "mnemonics": 2-4 optional memory hooks for the trickiest vocab words ("word" + a vivid "hook"). Omit if nothing is tricky.

Keep it emotionally personal and simple. Return ONLY the JSON.`;

  const result = await invokeLLM({
    prompt,
    response_json_schema: LESSON_SCHEMA,
  });

  const sentences: LessonSentence[] = (result?.sentences || []).map(
    (s: any) => ({
      target: String(s?.target || "").trim(),
      english: String(s?.english || "").trim(),
      transliteration: String(s?.transliteration || "").trim(),
    })
  );

  const vocab: LessonVocab[] = (result?.vocab || []).map((v: any) => ({
    word: String(v?.word || "").trim(),
    translation: String(v?.translation || "").trim(),
    transliteration: String(v?.transliteration || "").trim(),
    partOfSpeech: v?.partOfSpeech ? String(v.partOfSpeech).trim() : undefined,
    example: v?.example ? String(v.example).trim() : undefined,
  }));

  const speakingPrompts: string[] = (result?.speakingPrompts || [])
    .map((p: any) => String(p || "").trim())
    .filter(Boolean);

  const mnemonics: LessonMnemonic[] = (result?.mnemonics || [])
    .map((m: any) => ({
      word: String(m?.word || "").trim(),
      hook: String(m?.hook || "").trim(),
    }))
    .filter((m: LessonMnemonic) => m.word && m.hook);

  return {
    sentences,
    vocab,
    speakingPrompts,
    mnemonics,
    generatedTargetText: sentences.map((s) => s.target).join(" "),
    englishTranslation: sentences.map((s) => s.english).join(" "),
  };
}
