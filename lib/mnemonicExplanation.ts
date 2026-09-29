import { base44 } from "@/api/base44Client";

// The 💡 line under a flashcard image: one complete sentence that fits on ONE
// line of the card. 9 words alone wasn't enough ("A RACCOON (rah-KOOD=to
// dance) twirls on the dance floor." is 9 words / 58 chars and wraps), so
// characters are capped too: ~42 fits a phone-width card.
export const MNEMONIC_EXPLANATION_MAX_WORDS = 9;
export const MNEMONIC_EXPLANATION_MAX_CHARS = 42;
export const MNEMONIC_EXPLANATION_RULE =
  `ONE complete short sentence of at most ${MNEMONIC_EXPLANATION_MAX_WORDS} words AND at most ` +
  `${MNEMONIC_EXPLANATION_MAX_CHARS} characters so it fits on one line (never cut off), ` +
  `like "An ESKIMO (askeem) shaking hands to agree"`;

const clean = (text: unknown) => String(text ?? "").trim().replace(/\s+/g, " ");
const wordCount = (text: string) => (text ? text.split(" ").length : 0);

export function isShortMnemonicExplanation(text: unknown): boolean {
  const t = clean(text);
  return wordCount(t) <= MNEMONIC_EXPLANATION_MAX_WORDS && t.length <= MNEMONIC_EXPLANATION_MAX_CHARS;
}

/**
 * Returns the explanation as one complete sentence of at most 9 words. If the
 * model wrote a longer one, it is asked to rewrite it (never truncated with
 * "…"). If the rewrite fails, the original is kept rather than cut mid-sentence.
 */
export async function ensureShortMnemonicExplanation(text: unknown): Promise<string> {
  const original = clean(text);
  if (!original || isShortMnemonicExplanation(original)) return original;
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const result: any = await base44.integrations.Core.InvokeLLM({
        prompt: `Rewrite this flashcard memory hint as ONE complete, natural sentence of at most ${MNEMONIC_EXPLANATION_MAX_WORDS} words and at most ${MNEMONIC_EXPLANATION_MAX_CHARS} characters, so it fits on one line.
Keep the CAPITALIZED sound-anchor word and the transliteration in parentheses if present.
Do not use "..." and do not cut the sentence off.

Hint: "${original}"

Return JSON: { "explanation": the rewritten sentence }`,
        response_json_schema: {
          type: "object",
          properties: { explanation: { type: "string" } },
        },
      });
      const rewritten = clean(result?.explanation);
      if (rewritten && isShortMnemonicExplanation(rewritten)) return rewritten;
    }
  } catch (e) {
    console.error("[mnemonic] could not shorten explanation", e);
  }
  return original;
}
