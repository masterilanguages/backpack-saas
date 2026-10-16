// Real conjugation tables for tests (no AI): what the verbConjugations edge
// function must accept, and the shape the Backpack shows.

/** לְהַנִּיחַ (hifil, נ-ו-ח): to put. */
export const LEHANIACH = {
  past: {
    "1s": { he: "הִנַּחְתִּי", phonetic: "hinachti" }, "2ms": { he: "הִנַּחְתָּ", phonetic: "hinachta" }, "2fs": { he: "הִנַּחְתְּ", phonetic: "hinacht" },
    "3ms": { he: "הֵנִיחַ", phonetic: "heniach" }, "3fs": { he: "הֵנִיחָה", phonetic: "henicha" }, "1p": { he: "הִנַּחְנוּ", phonetic: "hinachnu" },
    "2mp": { he: "הִנַּחְתֶּם", phonetic: "hinachtem" }, "2fp": { he: "הִנַּחְתֶּן", phonetic: "hinachten" }, "3p": { he: "הֵנִיחוּ", phonetic: "henichu" },
  },
  present: {
    ms: { he: "מַנִּיחַ", phonetic: "maniach" }, fs: { he: "מַנִּיחָה", phonetic: "manicha" },
    mp: { he: "מַנִּיחִים", phonetic: "manichim" }, fp: { he: "מַנִּיחוֹת", phonetic: "manichot" },
  },
  future: {
    "1s": { he: "אַנִּיחַ", phonetic: "aniach" }, "2ms": { he: "תַּנִּיחַ", phonetic: "taniach" }, "2fs": { he: "תַּנִּיחִי", phonetic: "tanichi" },
    "3ms": { he: "יַנִּיחַ", phonetic: "yaniach" }, "3fs": { he: "תַּנִּיחַ", phonetic: "taniach" }, "1p": { he: "נַנִּיחַ", phonetic: "naniach" },
    "2p": { he: "תַּנִּיחוּ", phonetic: "tanichu" }, "3p": { he: "יַנִּיחוּ", phonetic: "yanichu" },
  },
  imperative: { ms: { he: "הַנַּח", phonetic: "hanach" }, fs: { he: "הַנִּיחִי", phonetic: "hanichi" }, p: { he: "הַנִּיחוּ", phonetic: "hanichu" } },
};

/** לִבְנוֹת (paal, ל"ה): to build — a different root class, same marks. */
export const LIVNOT = {
  past: {
    "1s": { he: "בָּנִיתִי" }, "2ms": { he: "בָּנִיתָ" }, "2fs": { he: "בָּנִית" }, "3ms": { he: "בָּנָה" }, "3fs": { he: "בָּנְתָה" },
    "1p": { he: "בָּנִינוּ" }, "2mp": { he: "בְּנִיתֶם" }, "2fp": { he: "בְּנִיתֶן" }, "3p": { he: "בָּנוּ" },
  },
  present: { ms: { he: "בּוֹנֶה" }, fs: { he: "בּוֹנָה" }, mp: { he: "בּוֹנִים" }, fp: { he: "בּוֹנוֹת" } },
  future: {
    "1s": { he: "אֶבְנֶה" }, "2ms": { he: "תִּבְנֶה" }, "2fs": { he: "תִּבְנִי" }, "3ms": { he: "יִבְנֶה" }, "3fs": { he: "תִּבְנֶה" },
    "1p": { he: "נִבְנֶה" }, "2p": { he: "תִּבְנוּ" }, "3p": { he: "יִבְנוּ" },
  },
  imperative: { ms: { he: "בְּנֵה" }, fs: { he: "בְּנִי" }, p: { he: "בְּנוּ" } },
};

/** לְסֻדַּר (pual): to be arranged — no imperative. */
export const LESUDAR = {
  past: {
    "1s": { he: "סֻדַּרְתִּי" }, "2ms": { he: "סֻדַּרְתָּ" }, "2fs": { he: "סֻדַּרְתְּ" }, "3ms": { he: "סֻדַּר" }, "3fs": { he: "סֻדְּרָה" },
    "1p": { he: "סֻדַּרְנוּ" }, "2mp": { he: "סֻדַּרְתֶּם" }, "2fp": { he: "סֻדַּרְתֶּן" }, "3p": { he: "סֻדְּרוּ" },
  },
  present: { ms: { he: "מְסֻדָּר" }, fs: { he: "מְסֻדֶּרֶת" }, mp: { he: "מְסֻדָּרִים" }, fp: { he: "מְסֻדָּרוֹת" } },
  future: {
    "1s": { he: "אֲסֻדַּר" }, "2ms": { he: "תְּסֻדַּר" }, "2fs": { he: "תְּסֻדְּרִי" }, "3ms": { he: "יְסֻדַּר" }, "3fs": { he: "תְּסֻדַּר" },
    "1p": { he: "נְסֻדַּר" }, "2p": { he: "תְּסֻדְּרוּ" }, "3p": { he: "יְסֻדְּרוּ" },
  },
};

export const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
