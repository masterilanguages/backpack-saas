/// <reference lib="deno.ns" />
// Run: deno test --unstable-sloppy-imports lib/mnemonicLemma.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { acceptMnemonicLemma, embedLemma, hebrewCliticPrefix, mnemonicBaseLabel, mnemonicSaveFields, readEmbeddedLemma, stripLemmaMarker } from "./mnemonicLemma.ts";

Deno.test("בבית / babait (in the house) uses בית / bayit", () => {
  const got = acceptMnemonicLemma(
    { language: "hebrew", word: "בבית", phonetic: "babait", meaning: "in the house" },
    { relation: "clitic", lemma: "בית", lemma_phonetic: "bayit", lemma_meaning: "house" },
  );
  assertEquals(got.lemma, "בית");
  assertEquals(got.lemmaPhonetic, "bayit");
  assertEquals(got.changed, true);
  assertEquals(got.relation, "clitic");
});

Deno.test("the definite article ה comes off even when the gloss is just the noun", () => {
  const got = acceptMnemonicLemma(
    { language: "hebrew", word: "הבית", phonetic: "habayit", meaning: "house" },
    { relation: "clitic", lemma: "בית", lemma_phonetic: "bayit", lemma_meaning: "house" },
  );
  assertEquals([got.lemma, got.lemmaPhonetic], ["בית", "bayit"]);
});

Deno.test("stacked clitics וה / שב come off", () => {
  assertEquals(hebrewCliticPrefix("וה"), true);
  assertEquals(hebrewCliticPrefix("שב"), true);
  const got = acceptMnemonicLemma(
    { language: "hebrew", word: "והבית", phonetic: "vehabayit", meaning: "and the house" },
    { lemma: "בית", lemma_phonetic: "bayit", lemma_meaning: "house" },
  );
  assertEquals(got.lemma, "בית");
});

Deno.test("לחם (bread) keeps its root ל — a one-letter chop is refused", () => {
  const got = acceptMnemonicLemma(
    { language: "hebrew", word: "לחם", phonetic: "lechem", meaning: "bread" },
    { relation: "clitic", lemma: "חם", lemma_phonetic: "chem", lemma_meaning: "ham" },
  );
  assertEquals(got.lemma, "לחם");
  assertEquals(got.lemmaPhonetic, "lechem");
  assertEquals(got.changed, false);
});

Deno.test("ללכת (to go) keeps the infinitive ל", () => {
  const got = acceptMnemonicLemma(
    { language: "hebrew", word: "ללכת", phonetic: "lalechet", meaning: "to go" },
    { relation: "clitic", lemma: "לכת", lemma_phonetic: "lechet", lemma_meaning: "to go" },
  );
  assertEquals(got.lemmaPhonetic, "lalechet");
});

Deno.test("מים and שמש are not prefix-stripped", () => {
  for (const [word, phonetic, lemma, lemmaPhonetic] of [
    ["מים", "mayim", "ים", "yam"],
    ["שמש", "shemesh", "מש", "mesh"],
  ] as const) {
    const got = acceptMnemonicLemma(
      { language: "hebrew", word, phonetic, meaning: phonetic },
      { relation: "clitic", lemma, lemma_phonetic: lemmaPhonetic },
    );
    assertEquals(got.lemmaPhonetic, phonetic);
  }
});

Deno.test("a verb inflection that is not a first-letter chop is kept", () => {
  const got = acceptMnemonicLemma(
    { language: "hebrew", word: "הלכתי", phonetic: "halakhti", meaning: "I went" },
    { relation: "inflection", lemma: "ללכת", lemma_phonetic: "lalechet", lemma_meaning: "to go" },
  );
  assertEquals(got.lemma, "ללכת");
  assertEquals(got.relation, "inflection");
});

Deno.test("Spanish, French and German articles come off; a plural becomes singular", () => {
  assertEquals(
    acceptMnemonicLemma(
      { language: "spanish", word: "del perro", phonetic: "del perro", meaning: "of the dog" },
      { relation: "clitic", lemma: "perro", lemma_phonetic: "perro", lemma_meaning: "dog" },
    ).lemma,
    "perro",
  );
  assertEquals(
    acceptMnemonicLemma(
      { language: "french", word: "l'eau", phonetic: "lo", meaning: "the water" },
      { relation: "clitic", lemma: "eau", lemma_phonetic: "o", lemma_meaning: "water" },
    ).lemma,
    "eau",
  );
  assertEquals(
    acceptMnemonicLemma(
      { language: "german", word: "das Haus", phonetic: "das haus", meaning: "the house" },
      { relation: "clitic", lemma: "Haus", lemma_phonetic: "haus", lemma_meaning: "house" },
    ).lemma,
    "Haus",
  );
  assertEquals(
    acceptMnemonicLemma(
      { language: "spanish", word: "casas", phonetic: "casas", meaning: "houses" },
      { relation: "inflection", lemma: "casa", lemma_phonetic: "casa", lemma_meaning: "house" },
    ).lemma,
    "casa",
  );
});

Deno.test("Arabic al- comes off", () => {
  const got = acceptMnemonicLemma(
    { language: "arabic", word: "البيت", phonetic: "albayt", meaning: "the house" },
    { relation: "clitic", lemma: "بيت", lemma_phonetic: "bayt", lemma_meaning: "house" },
  );
  assertEquals(got.lemma, "بيت");
});

Deno.test("the mnemonic base is not stored in lemma_key", () => {
  const saved = mnemonicSaveFields(
    { lemma: "בית", lemmaPhonetic: "bayit", lemmaMeaning: "house" },
    "A HOUSE (bayit) you walk into",
    "https://cdn.example/bayit.jpg",
  );
  assertEquals("lemma_key" in saved, false);
  assertEquals(saved.mnemonic_lemma, "בית");
  assertEquals(saved.mnemonic_lemma_phonetic, "bayit");
  assertEquals(saved.mnemonic_lemma_meaning, "house");
  assertEquals(saved.mnemonic_explanation.startsWith("[[lemma:בית|bayit|house]]"), true);
  assertEquals(stripLemmaMarker(saved.mnemonic_explanation), "A HOUSE (bayit) you walk into");
  assertEquals(readEmbeddedLemma(saved.mnemonic_explanation)?.lemmaPhonetic, "bayit");
  assertEquals(
    mnemonicBaseLabel({ word: "בבית", phonetic: "babait", mnemonic_explanation: embedLemma("A HOUSE", { lemma: "בית", lemmaPhonetic: "bayit", lemmaMeaning: "house" }) }),
    "בית · bayit",
  );
});

Deno.test("the card label shows the base only when it differs from the saved word", () => {
  assertEquals(
    mnemonicBaseLabel({ word: "בבית", phonetic: "babait", mnemonic_lemma: "בית", mnemonic_lemma_phonetic: "bayit" }),
    "בית · bayit",
  );
  assertEquals(
    mnemonicBaseLabel({ word: "כלב", phonetic: "kelev", mnemonic_lemma: "כלב", mnemonic_lemma_phonetic: "kelev" }),
    null,
  );
});
