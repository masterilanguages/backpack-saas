// How a verb card (migration 2200: one card per infinitive, verb_forms = the
// forms the student met) is shown and grouped in the Backpack. Pure and
// import-free apart from lib/verbs, tested with
// `deno test --unstable-sloppy-imports lib/verbCard.test.ts`.

import { CONJUGATION_SLOTS, plainSpelling, sameVerbLetters, slotFor, stripNikud, type VerbOccurrence } from "./verbs";

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

const BINYAN_LABEL: Record<string, string> = {
  paal: "Pa'al", nifal: "Nif'al", piel: "Pi'el", pual: "Pu'al", hifil: "Hif'il", hufal: "Huf'al", hitpael: "Hitpa'el",
};
/** "Verb · Hif'il" for a verb card's tag (just "Verb" when the binyan is unknown). */
export function verbTag(w: Card | null | undefined): string {
  const b = String(w?.lemma_key || "").split("|")[1] || "";
  return BINYAN_LABEL[b] ? `Verb · ${BINYAN_LABEL[b]}` : "Verb";
}

/** Every cell the student met on this card, as "tense:slot" (checked against the table when given). */
export function seenSlots(w: Card, table?: Record<string, Record<string, { he: string }>> | null): Set<string> {
  const out = new Set<string>();
  for (const o of verbForms(w)) {
    const s = usedSlot(table, o);
    if (s) out.add(`${s.tense}:${s.slot}`);
  }
  return out;
}

/** Particles that attach in front of a Hebrew word (ו, ה, ש, כ, ל, ב, מ — up to three: וכשה…). */
const PARTICLES = /^[הוכלבמש]{1,3}$/;

/**
 * The sentence split for display with the verb marked: the words whose
 * spelling (no nikud, no punctuation) is the form; else the form with
 * particles attached in the sentence (וכשהנחת for שהנחת). Never a partial
 * match (הלך must not mark לך): nothing is marked rather than the wrong word.
 */
export function highlightParts(sentence: string, surface: string): { text: string; hit: boolean }[] {
  const s = String(sentence || "");
  const target = plainSpelling(surface);
  if (!s || !target) return s ? [{ text: s, hit: false }] : [];
  const tokens = s.split(/(\s+)/);
  const plain = tokens.map((t) => (/^\s*$/.test(t) ? "" : plainSpelling(t)));
  let hits = plain.map((p) => !!p && p === target);
  if (!hits.some(Boolean)) {
    hits = plain.map((p) => !!p && p.length > target.length && p.endsWith(target) && PARTICLES.test(p.slice(0, p.length - target.length)));
  }
  const parts: { text: string; hit: boolean }[] = [];
  tokens.forEach((t, j) => {
    const last = parts[parts.length - 1];
    if (last && !last.hit && !hits[j]) last.text += t;
    else if (t) parts.push({ text: t, hit: hits[j] });
  });
  return parts;
}

/**
 * The cell of the conjugation table to highlight for a form. The grammar of
 * the analysis decides, as long as that cell really is the form; if it is
 * not, and exactly one cell is spelled like the form, that cell is used.
 */
export function usedSlot(
  table: Record<string, Record<string, { he: string }>> | null | undefined,
  occ: Partial<VerbOccurrence> | null | undefined,
): { tense: keyof typeof CONJUGATION_SLOTS; slot: string } | null {
  if (!occ) return null;
  const byGrammar = slotFor(occ);
  if (!table) return byGrammar;
  const surface = stripNikud(occ.surface || "");
  const spellings = [occ.form || "", surface, surface.slice(1), surface.slice(2), surface.slice(3)].filter((x) => x.length >= 2);
  // Same spelling first; only if none, the same letters apart from ו/י
  // (the sentence's full spelling of a defective form: יכתוב / יִכְתֹּב).
  const find = (same: (cell: string, form: string) => boolean) => {
    const out: { tense: keyof typeof CONJUGATION_SLOTS; slot: string }[] = [];
    for (const tense of TENSES_SHOWN) {
      for (const [slot, cell] of Object.entries(table[tense] || {})) {
        if (cell?.he && spellings.some((f) => same(plainSpelling(cell.he), plainSpelling(f)))) out.push({ tense, slot });
      }
    }
    return out;
  };
  let matches = find((a, b) => a === b);
  if (!matches.length) matches = find((a, b) => sameVerbLetters(a, b));
  if (byGrammar && matches.some((m) => m.tense === byGrammar.tense && m.slot === byGrammar.slot)) return byGrammar;
  if (matches.length === 1) return matches[0];
  return byGrammar;
}

/**
 * The video sentence a word was taken from: the first one where it is a word
 * of the sentence (alone or with particles attached), not just letters inside
 * another word (בת in בתוך). Falls back to the first sentence containing it.
 */
export function findVideoSentence<T extends { hebrew?: string; text?: string }>(segments: T[], word: string, norm: (t: string) => string): T | undefined {
  const key = norm(word || "");
  if (!key) return undefined;
  const asWord = segments.find((sg) => String(sg.hebrew || sg.text || "").split(/\s+/).some((tok) => {
    const t = norm(tok);
    return t === key || (t.length > key.length && t.endsWith(key) && PARTICLES.test(t.slice(0, t.length - key.length)));
  }));
  return asWord || segments.find((sg) => norm(sg.hebrew || sg.text || "").includes(key));
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
