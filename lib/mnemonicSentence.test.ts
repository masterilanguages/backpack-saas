/// <reference lib="deno.ns" />
// Run: deno test --unstable-sloppy-imports lib/mnemonicSentence.test.ts lib/mnemonicCard.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  applySentenceReview,
  clearSentenceCache,
  exampleSentencePrompt,
  KELEV_SENTENCE,
  sentenceReviewPrompt,
  warmVerifiedExamples,
} from "./mnemonicSentence.ts";
import { prepareMnemonicCard } from "./mnemonicCard.ts";

const kelevInput = {
  language: "hebrew",
  word: KELEV_SENTENCE.word,
  phonetic: KELEV_SENTENCE.phonetic,
  meaning: KELEV_SENTENCE.meaning,
  count: 1 as const,
};

Deno.test("the Hebrew prompt is a native Israeli speaker and teaches the kelev sentence", () => {
  const prompt = exampleSentencePrompt(kelevInput);
  assert(prompt.includes("native Israeli Hebrew"));
  assert(prompt.includes(KELEV_SENTENCE.sentence));
  assert(prompt.includes(KELEV_SENTENCE.transliteration));
  assert(prompt.includes(KELEV_SENTENCE.english));
  assert(/adjective/i.test(prompt));
  assert(/no Biblical/i.test(prompt));
  assert(/כלב שחור/.test(prompt));
  const spanish = exampleSentencePrompt({ language: "spanish", word: "perro", phonetic: "perro", meaning: "dog", count: 1 });
  assert(spanish.includes("native Spanish speaker"));
  assert(!spanish.includes("Israeli"));
});

Deno.test("a bad kelev draft is replaced by the verified sentence, transliteration and English together", () => {
  const draft = {
    hebrew_sentence: "כלב שחור יש לי",
    transliteration: "kelev shachor yesh li",
    english: "Black dog there is to me",
  };
  const verified = applySentenceReview(draft, {
    ok: false,
    hebrew_sentence: KELEV_SENTENCE.sentence,
    transliteration: KELEV_SENTENCE.transliteration,
    english: KELEV_SENTENCE.english,
    words: [
      { hebrew: "יש", word: "yesh", meaning: "there is" },
      { hebrew: "לי", word: "li", meaning: "to me" },
      { hebrew: "כלב", word: "kelev", meaning: "dog" },
      { hebrew: "שחור", word: "shachor", meaning: "black" },
    ],
  });
  assertEquals(verified?.hebrew_sentence, KELEV_SENTENCE.sentence);
  assertEquals(verified?.transliteration, KELEV_SENTENCE.transliteration);
  assertEquals(verified?.english, KELEV_SENTENCE.english);
  assertEquals(verified?.words?.map((w) => w.hebrew).join(" "), KELEV_SENTENCE.sentence);
});

Deno.test("an ok review keeps a transliteration and English that match the accepted sentence", () => {
  const verified = applySentenceReview(
    {
      hebrew_sentence: KELEV_SENTENCE.sentence,
      transliteration: "draft-does-not-match",
      english: "draft english",
    },
    {
      ok: true,
      hebrew_sentence: KELEV_SENTENCE.sentence,
      transliteration: KELEV_SENTENCE.transliteration,
      english: KELEV_SENTENCE.english,
    },
  );
  assertEquals(verified?.transliteration, KELEV_SENTENCE.transliteration);
  assertEquals(verified?.english, KELEV_SENTENCE.english);
});

Deno.test("a rejection without a full correction is not shown", () => {
  assertEquals(
    applySentenceReview(
      { hebrew_sentence: "כלב שחור יש לי", transliteration: "x", english: "y" },
      { ok: false, hebrew_sentence: KELEV_SENTENCE.sentence },
    ),
    null,
  );
});

Deno.test("the reviewer is asked to match transliteration and English to the sentence it accepts", () => {
  const prompt = sentenceReviewPrompt(kelevInput, [{
    hebrew_sentence: "כלב שחור יש לי",
    transliteration: "kelev shachor yesh li",
    english: "Black dog there is to me",
  }]);
  assert(prompt.includes("native Israeli"));
  assert(prompt.includes(KELEV_SENTENCE.sentence));
  assert(/transliteration and the English MUST describe the corrected sentence/.test(prompt));
});

Deno.test("verified sentences are cached and the check runs on a fast model", async () => {
  clearSentenceCache();
  const calls: { model?: string; prompt: string }[] = [];
  const invoke = async (args: { model?: string; prompt: string }) => {
    calls.push(args);
    if (calls.length === 1) {
      return { examples: [{ hebrew_sentence: "כלב שחור יש לי", transliteration: "bad", english: "bad" }] };
    }
    return {
      examples: [{
        ok: false,
        hebrew_sentence: KELEV_SENTENCE.sentence,
        transliteration: KELEV_SENTENCE.transliteration,
        english: KELEV_SENTENCE.english,
      }],
    };
  };
  const first = await warmVerifiedExamples(kelevInput, invoke);
  const second = await warmVerifiedExamples(kelevInput, invoke);
  assertEquals(first[0].hebrew_sentence, KELEV_SENTENCE.sentence);
  assertEquals(first[0].transliteration, KELEV_SENTENCE.transliteration);
  assertEquals(second, first);
  assertEquals(calls.length, 2);
  assertEquals(calls[0].model, "claude-haiku-4-5");
  assertEquals(calls[1].model, "claude-haiku-4-5");
});

Deno.test("the sentence check starts before the image is requested", async () => {
  const order: string[] = [];
  const result = await prepareMnemonicCard(
    { word: "כלב", phonetic: "kelev", translation: "dog", language: "hebrew" },
    "hebrew",
    {
      examples: () => {
        order.push("sentences");
        return new Promise(() => {});
      },
      invoke: async () => {
        order.push("concept");
        return {
          relation: "same",
          lemma: "כלב",
          lemma_phonetic: "kelev",
          lemma_meaning: "dog",
          sound_anchor: "collar",
          explanation: "A COLLAR (kelev) on a dog",
          image_prompt: "a dog wearing a collar",
        };
      },
      generateImage: async (args) => {
        order.push("image");
        assert(args.prompt.includes("collar"));
        return { url: "https://cdn.example/kelev.png" };
      },
    },
  );
  assertEquals(order, ["sentences", "concept", "image"]);
  assertEquals(result.imageUrl, "https://cdn.example/kelev.png");
  assertEquals(result.concept.lemma, "כלב");
});
