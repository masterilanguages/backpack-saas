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
 * Last resort, no AI: keep the first meaningful clause and, if it's still too
 * long, drop whole words from the end (never "…", never mid-word).
 * "A YOGI (yo-ghee ≈ yoshvim) is the sound anchor — sitting in a deep…"
 *   → "A YOGI (yo-ghee ≈ yoshvim)"
 */
export function compactMnemonicExplanation(text: unknown): string {
  let t = clean(text);
  const cut = t.search(/ (?:is the sound anchor|to show|showing|symboliz|representing|which|that)(?![a-z])|\s[—–-]\s|[—–;,:]/i);
  if (cut > 8) t = t.slice(0, cut);
  t = t.replace(/[\s.,;:—–-]+$/, "");
  if (isShortMnemonicExplanation(t)) return t;
  const words = t.split(" ");
  const out: string[] = [];
  for (const w of words) {
    const next = [...out, w].join(" ");
    if (next.length > MNEMONIC_EXPLANATION_MAX_CHARS || out.length >= MNEMONIC_EXPLANATION_MAX_WORDS) break;
    out.push(w);
  }
  // Don't end on a dangling connector.
  while (out.length > 2 && /^(a|an|the|and|or|of|to|in|on|with|for|at|by|is|are)$/i.test(out[out.length - 1])) out.pop();
  return out.join(" ");
}

/**
 * Returns the explanation as one complete, short line. A longer one is sent
 * back to the model to be rewritten (up to 3 tries); if that still fails, it
 * is compacted without AI. Never truncated with "…".
 */
export async function ensureShortMnemonicExplanation(text: unknown): Promise<string> {
  const original = clean(text);
  if (!original || isShortMnemonicExplanation(original)) return original;
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const result: any = await base44.integrations.Core.InvokeLLM({
        prompt: `Rewrite this flashcard memory hint as ONE short, complete phrase: aim for 6 words and about 36 characters (hard limit ${MNEMONIC_EXPLANATION_MAX_WORDS} words / ${MNEMONIC_EXPLANATION_MAX_CHARS} characters).
Keep the CAPITALIZED sound-anchor word and a short transliteration in parentheses. Drop explanations like "is the sound anchor", "symbolizing…", "to show…".
Example: "A YOGI (yo-ghee ≈ yoshvim) is the sound anchor — sitting in a deep cross-legged meditation pose" → "A YOGI (yo-ghee) sits cross-legged"
Do not use "..." and do not cut the phrase off.

Hint: "${original}"

Return JSON: { "explanation": the rewritten phrase }`,
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
  return compactMnemonicExplanation(original);
}
