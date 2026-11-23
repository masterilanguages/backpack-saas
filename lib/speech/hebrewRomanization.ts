// Israeli Hebrew romanization for the Backpack platform.
//
// Any school teaching Hebrew uses this. Vocalized text (nikud) is romanized
// deterministically, so the same word always comes out the same and does not
// depend on a model. Unvocalized text still needs a model (vowels are not in
// the spelling); that guess is then normalized onto this standard and cached.
//
// Standard (modern Israeli, learner style):
//   ח and fricative כ/ך → ch     כּ → k          צ/ץ → tz       שׁ → sh    שׂ → s
//   ת → t (never th or s)        בּ/word-initial ב → b    fricative ב → v
//   וֹ/וֹ → o    וּ → u    consonantal ו → v
//   א and ע are silent word-initially and word-finally; between vowels they
//   are an apostrophe (le'ehov, sha'a, me'a, lir'ot).
//   Final ה with no mappiq is silent (toda, not todah).
//   No hyphens. No Ashkenazi or Biblical forms (no "oy" for holam, no
//   "shabbos", no "sav", no "th" for tav). Gemination is not written, except
//   the conventional spelling "shabbat".
//   One Latin word per Hebrew word; prefixes ו ה ב כ ל מ ש join their word.
//   Stress is not marked; the listen button carries stress.
//
// This file is pure TypeScript with no imports so both Next.js and the Deno
// edge functions can load it.

const VOWEL_MARK: Record<string, string> = {
  "\u05B0": "sheva",
  "\u05B1": "hataf-segol",
  "\u05B2": "hataf-patah",
  "\u05B3": "hataf-qamats",
  "\u05B4": "hirik",
  "\u05B5": "tsere",
  "\u05B6": "segol",
  "\u05B7": "patah",
  "\u05B8": "qamats",
  "\u05B9": "holam",
  "\u05BA": "holam",
  "\u05BB": "kubuts",
  "\u05C7": "qamats-katan",
};

type Cluster = { letter: string; dagesh: boolean; sin: boolean; vowel: string | null };

const HEBREW_LETTER = /[\u05D0-\u05EA]/;
const HAS_VOWEL = /[\u05B0-\u05BB\u05C7]/;

export function hasVowelNikud(text: string): boolean {
  return HAS_VOWEL.test(String(text || ""));
}

function parseWord(word: string): Cluster[] {
  const out: Cluster[] = [];
  for (const ch of word) {
    const cp = ch.codePointAt(0) || 0;
    if (cp >= 0x05d0 && cp <= 0x05ea) {
      out.push({ letter: ch, dagesh: false, sin: false, vowel: null });
      continue;
    }
    const c = out[out.length - 1];
    if (!c) continue;
    if (ch === "\u05BC") c.dagesh = true;
    else if (ch === "\u05C2") c.sin = true;
    else if (VOWEL_MARK[ch]) {
      const v = VOWEL_MARK[ch];
      if (v === "qamats-katan") c.vowel = v;
      else if (!c.vowel || c.vowel === "sheva" || v !== "sheva") c.vowel = v;
    }
  }
  return out;
}

function shevaIsVocal(cs: Cluster[], i: number): boolean {
  const c = cs[i];
  if (c.vowel !== "sheva") return false;
  if (i === cs.length - 1) return false;
  if (i > 0 && cs[i - 1].vowel === "sheva") return true;
  if (i === 0) {
    // ב כ ל מ are the prefixes (be/ke/le/me). א ה ח ע ר keep a vowel.
    // ש ס ז צ ט drop it in modern Israeli (shtayim, shneim, shmone), not "she-".
    // The relativizer is שֶׁ with segol, so it never comes through this branch.
    if ("בכלמאהחער".includes(c.letter)) return true;
    const next = cs[1];
    if (next && next.vowel && next.vowel !== "sheva") return false;
    return true;
  }
  return false;
}

function isStop(cs: Cluster[], i: number): boolean {
  const c = cs[i];
  if (!"בכפךף".includes(c.letter)) return false;
  if (c.dagesh) return true;
  // Pe is fricative unless a dagesh is actually written (פברואר is /f/).
  // Final kaf is fricative. After a vowel, or after a silent sheva, an
  // unmarked ב/כ is fricative in modern Israeli (צבעים tzva'im, כתבו katvu).
  if (c.letter === "פ" || c.letter === "ף" || c.letter === "ך") return false;
  if (i === 0 && (c.letter === "ב" || c.letter === "כ")) return true;
  return false;
}

function consonant(cs: Cluster[], i: number): { text: string; vowelConsumed: boolean } {
  const c = cs[i];
  const L = c.letter;
  if (L === "א" || L === "ע") return { text: "", vowelConsumed: false };
  if (L === "ב") return { text: isStop(cs, i) ? "b" : "v", vowelConsumed: false };
  if (L === "כ" || L === "ך") return { text: isStop(cs, i) ? "k" : "ch", vowelConsumed: false };
  if (L === "פ" || L === "ף") return { text: isStop(cs, i) ? "p" : "f", vowelConsumed: false };
  if (L === "ו") {
    if (c.vowel === "holam") return { text: "o", vowelConsumed: true };
    if (c.dagesh && !c.vowel) return { text: "u", vowelConsumed: true };
    return { text: "v", vowelConsumed: false };
  }
  if (L === "ש") return { text: c.sin ? "s" : "sh", vowelConsumed: false };
  if (L === "צ" || L === "ץ") return { text: "tz", vowelConsumed: false };
  if (L === "ח") return { text: "ch", vowelConsumed: false };
  const map: Record<string, string> = {
    ג: "g", ד: "d", ה: "h", ז: "z", ט: "t", י: "y", ל: "l",
    מ: "m", ם: "m", נ: "n", ן: "n", ס: "s", ק: "k", ר: "r", ת: "t",
  };
  return { text: map[L] || "", vowelConsumed: false };
}

function qamatsIsO(cs: Cluster[], i: number): boolean {
  const c = cs[i];
  if (c.letter === "כ") {
    const n = cs[i + 1];
    if (!n || (n.letter === "ל" && (n.vowel === "sheva" || !n.vowel))) return true;
  }
  const n = cs[i + 1];
  return !!n && n.vowel === "hataf-qamats";
}

function vowelOf(cs: Cluster[], i: number, consumed: boolean): string {
  if (consumed) return "";
  switch (cs[i].vowel) {
    case "sheva": return shevaIsVocal(cs, i) ? "e" : "";
    case "hataf-segol":
    case "tsere":
    case "segol": return "e";
    case "hataf-patah":
    case "patah": return "a";
    case "hataf-qamats": return "o";
    case "hirik": return "i";
    case "qamats": return qamatsIsO(cs, i) ? "o" : "a";
    case "qamats-katan":
    case "holam": return "o";
    case "kubuts": return "u";
    default: return "";
  }
}

function isShabbat(cs: Cluster[]): boolean {
  return cs.length === 3
    && cs[0].letter === "ש" && cs[0].vowel === "patah"
    && cs[1].letter === "ב" && cs[1].dagesh && cs[1].vowel === "qamats"
    && cs[2].letter === "ת";
}

function romanizeWord(cs: Cluster[]): string {
  if (isShabbat(cs)) return "shabbat";
  let out = "";
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    const last = i === cs.length - 1;
    if (c.letter === "ו" && !c.vowel && !c.dagesh && /[ou]$/.test(out)) continue;
    if (c.letter === "י" && !c.vowel && !c.dagesh && /i$/.test(out)) continue;
    if (c.letter === "י" && !c.vowel && !c.dagesh && /[ea]$/.test(out)) { out += "i"; continue; }

    if (i === 0 && c.letter === "ו" && c.vowel === "sheva") {
      const n = cs[1];
      if (n && ("במפ".includes(n.letter) || n.letter === "ו" || n.vowel === "sheva")) { out += "u"; continue; }
      if (n && n.letter === "י" && (!n.vowel || n.vowel === "sheva")) { out += "vi"; i++; continue; }
      out += "ve";
      continue;
    }

    // Furtive patach is pronounced before the final guttural. The letter
    // before it may be a mater (י/ו) with no point of its own, so judge by
    // the Latin already written, not by that cluster's mark.
    const furtive = last && "חעה".includes(c.letter) && c.vowel === "patah" && /[aeiou]$/.test(out);
    if (furtive) {
      const g = c.letter === "ע" || c.letter === "א" ? "" : (c.letter === "ה" ? (c.dagesh ? "h" : "") : consonant(cs, i).text);
      out += "a" + g;
      continue;
    }
    if (last && c.letter === "ה" && !c.vowel && !c.dagesh) continue;

    const cons = consonant(cs, i);
    const vow = vowelOf(cs, i, cons.vowelConsumed);
    if (c.letter === "א" || c.letter === "ע") {
      if (!vow) {
        // No point on the letter itself, but it still breaks the syllable
        // before a following vowel (לִרְאוֹת: the holam sits on the vav).
        const next = cs[i + 1];
        const nextHasVowel = !!next && (next.vowel === "holam" || (next.letter === "ו" && next.dagesh && !next.vowel) || (!!next.vowel && next.vowel !== "sheva"));
        if (out.length && !/[aeiou']$/.test(out) && nextHasVowel) out += "'";
        continue;
      }
      if (out.length) out += "'";
      out += vow;
      continue;
    }
    out += cons.text + vow;
  }
  return out;
}

/**
 * Romanize vocalized Hebrew. Returns "" when the text has no vowel points,
 * so callers keep the model guess instead of letter-guessing unvocalized spelling.
 */
export function romanizeHebrew(input: string): string {
  const text = String(input || "");
  if (!hasVowelNikud(text)) return "";
  const tokens = text.split(/(\s+|־)/);
  const pieces: string[] = [];
  for (const tok of tokens) {
    if (tok === "־") { pieces.push(" "); continue; }
    if (!HEBREW_LETTER.test(tok)) { pieces.push(tok); continue; }
    const m = tok.match(/^([^\u0590-\u05FF]*)([\u0590-\u05FF]+)(.*)$/);
    if (!m || !hasVowelNikud(m[2])) return "";
    const cs = parseWord(m[2]);
    if (!cs.length) return "";
    pieces.push(m[1] + romanizeWord(cs) + m[3]);
  }
  return pieces.join("").replace(/[ ]{2,}/g, " ").trim();
}

/** Pull a model's Latin guess onto the Israeli standard. */
export function normalizeHebrewRomanization(raw: string): string {
  if (!raw) return "";
  let s = String(raw).normalize("NFC").trim();
  s = s.replace(/[\u0590-\u05FF]/g, " ");
  s = s.replace(/[áàâäāǎ]/gi, "a").replace(/[éèêëē]/gi, "e");
  s = s.replace(/[íìîïī]/gi, "i").replace(/[óòôöō]/gi, "o").replace(/[úùûüū]/gi, "u");
  s = s.replace(/ḥ|ḫ|ẖ|ḵ/gi, "ch").replace(/ṭ/gi, "t").replace(/ṣ/gi, "tz");
  s = s.replace(/š/gi, "sh").replace(/ś/gi, "s");
  s = s.replace(/kh/gi, "ch").replace(/tsch/gi, "tz").replace(/ts/gi, "tz");
  s = s.replace(/th(?![aeiou])/gi, "t");
  s = s.replace(/-/g, "");
  s = s.toLowerCase();
  s = s.replace(/([aeiou])h\b/g, "$1");
  s = s.replace(/'+/g, "'").replace(/^'+|'+$/g, "");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

const MEM = new Map<string, string>();
const LS_KEY = "backpack.speech.hebrewTranslit.v1";
const CACHE_MAX = 400;

function readCache(key: string): string | null {
  const hit = MEM.get(key);
  if (hit) return hit;
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw)?.[key];
    if (typeof value === "string" && value) {
      MEM.set(key, value);
      return value;
    }
  } catch { /* private mode / bad json */ }
  return null;
}

function writeCache(key: string, value: string) {
  if (MEM.has(key)) MEM.delete(key);
  MEM.set(key, value);
  if (MEM.size > CACHE_MAX) {
    const oldest = MEM.keys().next().value;
    if (oldest) MEM.delete(oldest);
  }
  try {
    if (typeof localStorage === "undefined") return;
    const prev = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    prev[key] = value;
    const keys = Object.keys(prev);
    if (keys.length > CACHE_MAX) delete prev[keys[0]];
    localStorage.setItem(LS_KEY, JSON.stringify(prev));
  } catch { /* ignore quota */ }
}

export function clearTranslitCache() {
  MEM.clear();
  try { if (typeof localStorage !== "undefined") localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
}

/**
 * Best Israeli romanization of `hebrew`. Vocalized text ignores `guess`.
 * Unvocalized text normalizes `guess` and caches it so the same spelling
 * does not drift between calls.
 */
export function resolveHebrewTranslit(hebrew: string, guess = ""): string {
  const key = String(hebrew || "").normalize("NFC").replace(/\s+/g, " ").trim();
  if (key) {
    const hit = readCache(key);
    if (hit) return hit;
  }
  let out = "";
  if (key && hasVowelNikud(key)) out = romanizeHebrew(key);
  if (!out) out = normalizeHebrewRomanization(guess);
  if (key && out) writeCache(key, out);
  return out;
}

const SOURCE_KEYS = ["hebrew", "he", "target", "w", "lemma", "word", "fixed", "text"];
const LATIN_KEYS = ["transliteration", "phonetic", "lemma_phonetic", "roman", "romanized"];

/**
 * Walk a model payload and rewrite Hebrew romanization fields onto the
 * standard. Objects with no Hebrew-script sibling are left alone, so Spanish
 * (and every other language) pass through until they grow a romanizer.
 */
export function polishSpeechFields<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => polishSpeechFields(item)) as T;
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = polishSpeechFields(v);
  const hebrew = SOURCE_KEYS
    .map((k) => out[k])
    .find((v) => typeof v === "string" && /[\u0590-\u05FF]/.test(v)) as string | undefined;
  if (hebrew) {
    for (const k of LATIN_KEYS) {
      if (typeof out[k] === "string" && String(out[k]).trim()) {
        const next = resolveHebrewTranslit(hebrew, String(out[k]));
        if (next) out[k] = next;
      }
    }
  }
  return out as T;
}
