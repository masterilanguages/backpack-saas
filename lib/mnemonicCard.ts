// Image and example sentences for one card. The sentence check starts before
// the image model is called, so the two overlap. The picture is ready as soon
// as it exists; sentences stay on their own promise until they are verified.

import { buildMnemonicConcept, type MnemonicConcept } from "./mnemonicConcept";
import {
  sentenceInputFromWord,
  warmVerifiedExamples,
  type CardExample,
  type LlmInvoke,
} from "./mnemonicSentence";

export type PrepareDeps = {
  invoke: LlmInvoke;
  generateImage: (args: { prompt: string; cache?: boolean }) => Promise<{ url: string }>;
  /** Injected in tests. Production uses the shared verified-sentence cache. */
  examples?: (word: any) => Promise<CardExample[]>;
  cacheImage?: boolean;
};

export async function prepareMnemonicCard(word: any, language: string, deps: PrepareDeps): Promise<{
  concept: MnemonicConcept;
  imageUrl: string;
  examplesP: Promise<CardExample[]>;
}> {
  const already = Array.isArray(word?.usage_examples) && word.usage_examples.length > 0;
  const examplesP = already
    ? Promise.resolve(word.usage_examples as CardExample[])
    : (deps.examples
      ? deps.examples(word)
      : warmVerifiedExamples(sentenceInputFromWord(word, language), deps.invoke));
  const concept = await buildMnemonicConcept(word, language, deps.invoke);
  const image = await deps.generateImage({
    prompt: concept.fullImagePrompt,
    cache: deps.cacheImage !== false,
  });
  if (!image?.url) throw new Error("The image service returned no picture.");
  return { concept, imageUrl: image.url, examplesP };
}
