// Modern Israeli nikud for the Backpack platform.
//
// Adding points follows the transliteration the learner is looking at, so the
// vowels match that reading (a small Nakdan: consonants stay, points are
// placed from the Latin). Stripping removes U+0591–U+05C7, the full nikud
// block including dagesh and shin/sin dots. Results are cached so the same
// spelling does not get a different pointing later.
//
// Pure TypeScript, no imports: Next and Deno both load it. The speech facade
// checks a pointing by romanizing it back.

export const NIKUD_BLOCK = /[\u0591-\u05C7]/g;

/** Drop nikud. Letters, maqaf is inside this block (U+05BE) and goes too, per the platform range. */
export function stripNikud(text: string): string {
  return String(text || "").replace(NIKUD_BLOCK, "");
}

export function hasNikud(text: string): boolean {
  return /[\u0591-\u05C7]/.test(String(text || ""));
}

const VOWEL: Record<string, string> = {
  a: "\u05B7", // patach
  e: "\u05B6", // segol
  i: "\u05B4", // hirik
  o: "\u05B9", // holam
  u: "\u05BB", // kubuts, only when no vav follows
};

const LETTER = /[\u05D0-\u05EA]/;

type Cons = { next: number; marks: string; asVowel: "o" | "u" | "i" | null };

function takeCons(letter: string, lat: string, i: number): Cons | null {
  const rest = lat.slice(i);
  const eat = (s: string, marks = "", asVowel: Cons["asVowel"] = null): Cons | null =>
    rest.startsWith(s) ? { next: i + s.length, marks, asVowel } : null;
  switch (letter) {
    case "א":
    case "ע":
      return rest.startsWith("'") ? { next: i + 1, marks: "", asVowel: null } : { next: i, marks: "", asVowel: null };
    case "ב":
      return eat("b", "\u05BC") || eat("v");
    case "ג": return eat("g");
    case "ד": return eat("d");
    case "ה":
      return rest.startsWith("h") ? { next: i + 1, marks: "", asVowel: null } : { next: i, marks: "", asVowel: null };
    case "ו":
      return eat("v") || eat("o", "\u05B9", "o") || eat("u", "\u05BC", "u");
    case "ז": return eat("z");
    case "ח": return eat("ch");
    case "ט": return eat("t");
    case "י":
      return eat("y") || eat("i", "", "i");
    case "כ":
    case "ך":
      return eat("ch") || eat("k", "\u05BC");
    case "ל": return eat("l");
    case "מ":
    case "ם": return eat("m");
    case "נ":
    case "ן": return eat("n");
    case "ס": return eat("s");
    case "פ":
    case "ף":
      return eat("p", "\u05BC") || eat("f");
    case "צ":
    case "ץ":
      return eat("tz") || eat("ts");
    case "ק": return eat("k");
    case "ר": return eat("r");
    case "ש":
      return eat("sh", "\u05C1") || eat("s", "\u05C2");
    case "ת": return eat("t");
    default: return null;
  }
}

function pointWord(hebrew: string, latin: string): string | null {
  const lat = latin.toLowerCase().replace(/[^a-z']/g, "");
  const letters: string[] = [];
  for (let c = 0; c < hebrew.length; c++) if (LETTER.test(hebrew.charAt(c))) letters.push(hebrew.charAt(c));
  if (!letters.length || !lat) return null;
  let i = 0;
  let mater: "o" | "u" | "i" | null = null;
  const out: string[] = [];
  for (let n = 0; n < letters.length; n++) {
    const L = letters[n];
    if (mater === "o" && L === "ו") { out.push("ו"); mater = null; continue; }
    if (mater === "u" && L === "ו") { out.push("ו\u05BC"); mater = null; continue; }
    if (mater === "i" && L === "י") { out.push("י"); mater = null; continue; }
    mater = null;
    const cons = takeCons(L, lat, i);
    if (!cons) return null;
    i = cons.next;
    if (cons.asVowel) { out.push(L + cons.marks); continue; }
    const vow = lat[i];
    let marks = cons.marks;
    if (vow && "aeiou".includes(vow)) {
      const next = letters[n + 1];
      if (vow === "o" && next === "ו") mater = "o";
      else if (vow === "u" && next === "ו") mater = "u";
      else if (vow === "i" && next === "י") mater = "i";
      if (mater !== "u") marks += VOWEL[vow];
      i += 1;
    }
    out.push(L + marks);
  }
  if (mater || i !== lat.length) return null;
  return out.join("");
}

/**
 * Point `hebrew` so it reads as `transliteration`. Null when the Latin does
 * not line up with the letters — the caller then asks the model.
 * One Hebrew word per Latin word. Punctuation around a word is kept.
 */
export function pointHebrew(hebrew: string, transliteration: string): string | null {
  const hw = String(hebrew || "").trim().split(/\s+/).filter(Boolean);
  const lw = String(transliteration || "").trim().split(/\s+/).filter(Boolean);
  if (!hw.length || hw.length !== lw.length) return null;
  const pointed = hw.map((word, n) => {
    const lead = (word.match(/^[^\u05D0-\u05EA]+/) || [""])[0];
    const trail = (word.match(/[^\u05D0-\u05EA]+$/) || [""])[0];
    const core = stripNikud(word).replace(/^[^\u05D0-\u05EA]+|[^\u05D0-\u05EA]+$/g, "");
    const latin = lw[n].replace(/[^A-Za-z']/g, "");
    const body = pointWord(core, latin);
    if (!body) return null;
    return lead + body + trail;
  });
  if (pointed.some((w) => !w)) return null;
  return pointed.join(" ");
}

const MEM = new Map<string, string>();
const LS_KEY = "backpack.speech.nikud.v1";

function cacheKey(hebrew: string, transliteration: string) {
  return `${stripNikud(hebrew).replace(/\s+/g, " ").trim()}|${transliteration.toLowerCase().replace(/\s+/g, " ").trim()}`;
}

export function readNikudCache(hebrew: string, transliteration: string): string | null {
  const key = cacheKey(hebrew, transliteration);
  const hit = MEM.get(key);
  if (hit) return hit;
  try {
    if (typeof localStorage === "undefined") return null;
    const value = JSON.parse(localStorage.getItem(LS_KEY) || "{}")[key];
    if (typeof value === "string" && value) {
      MEM.set(key, value);
      return value;
    }
  } catch { /* ignore */ }
  return null;
}

export function writeNikudCache(hebrew: string, transliteration: string, pointed: string) {
  const letters = (s: string) => stripNikud(s).replace(/[^\u05D0-\u05EA]/g, "");
  if (!pointed || letters(pointed) !== letters(hebrew)) return;
  const key = cacheKey(hebrew, transliteration);
  MEM.set(key, pointed);
  try {
    if (typeof localStorage === "undefined") return;
    const prev = JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    prev[key] = pointed;
    const keys = Object.keys(prev);
    if (keys.length > 400) delete prev[keys[0]];
    localStorage.setItem(LS_KEY, JSON.stringify(prev));
  } catch { /* ignore */ }
}

export const NIKUD_PREFERENCE_KEY = "backpack.speech.showNikud";
