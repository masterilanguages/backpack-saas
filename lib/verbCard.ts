// How a verb card (migration 2200: one card per infinitive, verb_forms = the
// forms the student met) is shown and grouped in the Backpack. Pure and
// import-free apart from lib/verbs, tested with
// `deno test --unstable-sloppy-imports lib/verbCard.test.ts`.

import { CONJUGATION_SLOTS, plainSpelling, slotFor, stripNikud, type VerbOccurrence } from "./verbs";

type Card = {
  word?: string | null;
  phonetic?: string | null;
  translation?: string | null;
  lemma_key?: string | null;
  source_video_id?: string | null;
  source_video_title?: string | null;
  example_sentence?: string | null;
  verb_forms?: VerbOccurrence[] | null;
};

/** The forms of a verb card (empty for every other word). */
export const verbForms = (w: Card | null | undefined): VerbOccurrence[] =>
  Array.isArray(w?.verb_forms) ? (w!.verb_forms as VerbOccurrence[]).filter((o) => o && o.surface) : [];

export const isVerbCard = (w: Card | null | undefined) => verbForms(w).length > 0;

/**
 * The videos a card belongs to: its source video plus, for a verb, the video
 * of each form. A word without verb_forms gives exactly { source_video_id }.
 */
export function wordVideoIds(w: Card): Set<string> {
  const ids = new Set<string>();
  if (w.source_video_id) ids.add(w.source_video_id);
  for (const o of verbForms(w)) if (o.video_id) ids.add(o.video_id);
  return ids;
}

const newest = (list: VerbOccurrence[]) =>
  list.reduce((a, b) => (String(b.added_at || "") > String(a.added_at || "") ? b : a));

/**
 * The form to show: in a video's deck, the one from that video (the newest
 * there); elsewhere the newest form overall. null for non-verb cards.
 */
export function pickOccurrence(w: Card, videoId?: string | null): VerbOccurrence | null {
  const forms = verbForms(w);
  if (!forms.length) return null;
  if (videoId) {
    const here = forms.filter((o) => o.video_id === videoId);
    if (here.length) return newest(here);
  }
  return newest(forms);
}

/** The card's sentence and title for a deck: the form's for a verb, the card's otherwise. */
export function deckSentence(w: Card, videoId?: string | null): string | null {
  return pickOccurrence(w, videoId)?.sentence || w.example_sentence || null;
}
export function deckVideoTitle(w: Card, videoId?: string | null): string | null {
  return pickOccurrence(w, videoId)?.video_title || w.source_video_title || null;
}

/** Other forms of the card than `occ`, one per word + video. */
export function otherOccurrences(w: Card, occ: VerbOccurrence | null): VerbOccurrence[] {
  const seen = new Set<string>();
  const key = (o: VerbOccurrence) => `${plainSpelling(o.surface)}|${o.video_id || ""}`;
  if (occ) seen.add(key(occ));
  return verbForms(w).filter((o) => {
    const k = key(o);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const TENSE_LABEL: Record<string, string> = { past: "Past", present: "Present", future: "Future", imperative: "Imperative", infinitive: "Infinitive" };
const PERSON_LABEL: Record<number, string> = { 1: "1st person", 2: "2nd person", 3: "3rd person" };

/** "Past · 2nd person · masculine · singular", as chips. Only what is known. */
export function grammarChips(o: Partial<VerbOccurrence> | null | undefined): string[] {
  if (!o) return [];
  const out: string[] = [];
  if (o.tense && TENSE_LABEL[o.tense]) out.push(TENSE_LABEL[o.tense]);
  if (o.person && PERSON_LABEL[o.person]) out.push(PERSON_LABEL[o.person]);
  if (o.gender) out.push(o.gender === "m" ? "masculine" : "feminine");
  if (o.number) out.push(o.number === "sg" ? "singular" : "plural");
  return out;
}

/** Labels of the conjugation table's cells. */
export const SLOT_LABELS: Record<string, Record<string, string>> = {
  past: { "1s": "I", "2ms": "you (m.)", "2fs": "you (f.)", "3ms": "he", "3fs": "she", "1p": "we", "2mp": "you (m. pl.)", "2fp": "you (f. pl.)", "3p": "they" },
  present: { ms: "m. singular", fs: "f. singular", mp: "m. plural", fp: "f. plural" },
  future: { "1s": "I", "2ms": "you (m.)", "2fs": "you (f.)", "3ms": "he", "3fs": "she", "1p": "we", "2p": "you (pl.)", "3p": "they" },
  imperative: { ms: "to a man", fs: "to a woman", p: "to several" },
};
export const TENSES_SHOWN = Object.keys(CONJUGATION_SLOTS) as (keyof typeof CONJUGATION_SLOTS)[];

/** Every cell the student met on this card, as "tense:slot". */
export function seenSlots(w: Card): Set<string> {
  const out = new Set<string>();
  for (const o of verbForms(w)) {
    const s = slotFor(o);
    if (s) out.add(`${s.tense}:${s.slot}`);
  }
  return out;
}

/**
 * The sentence split for display with the verb marked: whole words whose
 * spelling (no nikud, no punctuation) is the form; if none, the first word
 * containing the form without its prefix.
 */
export function highlightParts(sentence: string, surface: string): { text: string; hit: boolean }[] {
  const s = String(sentence || "");
  const target = plainSpelling(surface);
  if (!s || !target) return s ? [{ text: s, hit: false }] : [];
  const tokens = s.split(/(\s+)/);
  let hits = tokens.map((t) => !/^\s+$/.test(t) && plainSpelling(t) === target);
  if (!hits.some(Boolean)) {
    const stem = plainSpelling(stripNikud(surface).replace(/^[הוכלבמש]/, ""));
    const i = stem.length >= 2 ? tokens.findIndex((t) => !/^\s+$/.test(t) && plainSpelling(t).includes(stem)) : -1;
    hits = tokens.map((_, j) => j === i);
  }
  const parts: { text: string; hit: boolean }[] = [];
  tokens.forEach((t, j) => {
    const last = parts[parts.length - 1];
    if (last && last.hit === hits[j] && !hits[j]) last.text += t;
    else if (t) parts.push({ text: t, hit: hits[j] });
  });
  return parts;
}

/** Whether the student already saved this exact word (as a word, or as a form of a verb card). */
export function hasSavedWord(words: Card[], clean: string): boolean {
  const c = String(clean || "");
  const plain = plainSpelling(c);
  return words.some(
    (w) => w.word === c || (w.phonetic || "").toLowerCase() === c.toLowerCase()
      || (!!plain && verbForms(w).some((o) => plainSpelling(o.surface) === plain)),
  );
}

/**
 * The analysis of a word the student already met as a form of one of their
 * verb cards — reused as is, so saving it again (e.g. from another song)
 * costs no AI call. The contextual translation is left out on purpose: the
 * caller's one (this sentence) is used. undefined when not found.
 */
export function knownAnalysisFromCards(words: Card[], surface: string): any {
  const plain = plainSpelling(surface);
  if (!plain) return undefined;
  for (const w of words) {
    const o = verbForms(w).find((f) => plainSpelling(f.surface) === plain);
    if (!o || !w.word) continue;
    return {
      is_verb: true,
      lemma: w.word,
      lemma_phonetic: w.phonetic || "",
      lemma_meaning: w.translation || "",
      binyan: String(w.lemma_key || "").split("|")[1] || "",
      tense: o.tense, person: o.person, gender: o.gender, number: o.number,
      prefix: o.prefix || "", form: o.form || "",
      phonetic: o.phonetic || "",
      translation: "",
    };
  }
  return undefined;
}

/** The request body of the verbConjugations edge function for a card. */
export function conjugationRequest(w: Card, language: string) {
  return {
    language,
    lemma_key: w.lemma_key || "",
    lemma: w.word || "",
    lemma_phonetic: w.phonetic || "",
    lemma_meaning: w.translation || "",
    binyan: String(w.lemma_key || "").split("|")[1] || "",
  };
}
