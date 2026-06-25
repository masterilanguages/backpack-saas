"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

const VERBS = [
  {
    id: "livchor",
    infinitive: "לִבְחֹר",
    romanized: "Livchor",
    meaning: "To Choose",
    root: "ב-ח-ר",
    rootRoman: "B-Ch-R",
    ruleNote: "Future tense uses prefixes (and sometimes suffixes) on the root. This is a regular pa'al verb.",
    prefixRules: [
      { prefix: "Ev-", pronoun: "I (אני)" },
      { prefix: "Ti-", pronoun: "You (m) / She" },
      { prefix: "Ti-...-i", pronoun: "You (f)" },
      { prefix: "Yi-", pronoun: "He / They (m)" },
      { prefix: "Ni-", pronoun: "We" },
      { prefix: "Ti-...-u", pronoun: "You (pl) / They (f)" },
    ],
    rows: [
      { subject: "I", transliteration: "Ev-char", hebrew: "אֶבְחַר" },
      { subject: "You (m)", transliteration: "Ti-vchar", hebrew: "תִּבְחַר" },
      { subject: "You (f)", transliteration: "Ti-vchar-i", hebrew: "תִּבְחֲרִי" },
      { subject: "He", transliteration: "Yi-vchar", hebrew: "יִבְחַר" },
      { subject: "She", transliteration: "Ti-vchar", hebrew: "תִּבְחַר" },
      { subject: "We", transliteration: "Ni-vchar", hebrew: "נִבְחַר" },
      { subject: "You (pl)", transliteration: "Ti-vchar-u", hebrew: "תִּבְחֲרוּ" },
      { subject: "They", transliteration: "Yi-vchar-u", hebrew: "יִבְחֲרוּ" },
    ],
  },
  {
    id: "lachshov",
    infinitive: "לַחְשׁוֹב",
    romanized: "Lachshov",
    meaning: "To Think",
    root: "ח-ש-ב",
    rootRoman: "Ch-Sh-V",
    ruleNote: "Regular pa'al verb. Note: 'tachshevi' = 'you (f) will think' — the feminine adds -i suffix.",
    prefixRules: [
      { prefix: "Ach-", pronoun: "I (אני)" },
      { prefix: "Tach-", pronoun: "You (m) / She" },
      { prefix: "Tach-...-i", pronoun: "You (f)" },
      { prefix: "Yach-", pronoun: "He / They (m)" },
      { prefix: "Nach-", pronoun: "We" },
      { prefix: "Tach-...-u", pronoun: "You (pl) / They (f)" },
    ],
    rows: [
      { subject: "I", transliteration: "Ach-shov", hebrew: "אַחְשׁוֹב" },
      { subject: "You (m)", transliteration: "Tach-shov", hebrew: "תַּחְשׁוֹב" },
      { subject: "You (f)", transliteration: "Tach-shev-i", hebrew: "תַּחְשְׁבִי" },
      { subject: "He", transliteration: "Yach-shov", hebrew: "יַחְשׁוֹב" },
      { subject: "She", transliteration: "Tach-shov", hebrew: "תַּחְשׁוֹב" },
      { subject: "We", transliteration: "Nach-shov", hebrew: "נַחְשׁוֹב" },
      { subject: "You (pl)", transliteration: "Tach-shev-u", hebrew: "תַּחְשְׁבוּ" },
      { subject: "They", transliteration: "Yach-shev-u", hebrew: "יַחְשְׁבוּ" },
    ],
  },
  {
    id: "ledaber",
    infinitive: "לְדַבֵּר",
    romanized: "Ledaber",
    meaning: "To Speak / Talk",
    root: "ד-ב-ר",
    rootRoman: "D-B-R",
    ruleNote: "Pi'el binyan verb (intensive). The middle root letter is doubled (dagesh). Uses slightly different vowel patterns than pa'al.",
    prefixRules: [
      { prefix: "A-dab-", pronoun: "I (אני)" },
      { prefix: "T-dab-", pronoun: "You (m/f) / She" },
      { prefix: "Y-dab-", pronoun: "He / They" },
      { prefix: "N-dab-", pronoun: "We" },
    ],
    rows: [
      { subject: "I", transliteration: "A-daber", hebrew: "אֲדַבֵּר" },
      { subject: "You (m)", transliteration: "T-daber", hebrew: "תְּדַבֵּר" },
      { subject: "You (f)", transliteration: "T-daber-i", hebrew: "תְּדַבְּרִי" },
      { subject: "He", transliteration: "Y-daber", hebrew: "יְדַבֵּר" },
      { subject: "She", transliteration: "T-daber", hebrew: "תְּדַבֵּר" },
      { subject: "We", transliteration: "N-daber", hebrew: "נְדַבֵּר" },
      { subject: "You (pl)", transliteration: "T-daber-u", hebrew: "תְּדַבְּרוּ" },
      { subject: "They", transliteration: "Y-daber-u", hebrew: "יְדַבְּרוּ" },
    ],
  },
  {
    id: "lalecet",
    infinitive: "לָלֶכֶת",
    romanized: "Lalechet",
    meaning: "To Go / Walk",
    root: "ה-ל-כ",
    rootRoman: "H-L-Ch",
    ruleNote: "Irregular verb — one of the most common in Hebrew! The root changes form in future tense (לכ → ל).",
    prefixRules: [
      { prefix: "E-", pronoun: "I → Elech" },
      { prefix: "Te-", pronoun: "You / She → Telech" },
      { prefix: "Ye-", pronoun: "He / They → Yelech / Yelchu" },
      { prefix: "Ne-", pronoun: "We → Nelech" },
    ],
    rows: [
      { subject: "I", transliteration: "E-lech", hebrew: "אֵלֵךְ" },
      { subject: "You (m)", transliteration: "Te-lech", hebrew: "תֵּלֵךְ" },
      { subject: "You (f)", transliteration: "Tel-ch-i", hebrew: "תֵּלְכִי" },
      { subject: "He", transliteration: "Ye-lech", hebrew: "יֵלֵךְ" },
      { subject: "She", transliteration: "Te-lech", hebrew: "תֵּלֵךְ" },
      { subject: "We", transliteration: "Ne-lech", hebrew: "נֵלֵךְ" },
      { subject: "You (pl)", transliteration: "Tel-ch-u", hebrew: "תֵּלְכוּ" },
      { subject: "They", transliteration: "Yel-ch-u", hebrew: "יֵלְכוּ" },
    ],
  },
  {
    id: "lir'ot",
    infinitive: "לִרְאוֹת",
    romanized: "Lir'ot",
    meaning: "To See",
    root: "ר-א-ה",
    rootRoman: "R-A-H",
    ruleNote: "Lamed-heh verb — the final ה drops in conjugations. Very common verb, worth memorizing.",
    prefixRules: [
      { prefix: "Er-", pronoun: "I → Er'eh" },
      { prefix: "Tir-", pronoun: "You / She → Tir'eh" },
      { prefix: "Yir-", pronoun: "He / They → Yir'eh" },
      { prefix: "Nir-", pronoun: "We → Nir'eh" },
    ],
    rows: [
      { subject: "I", transliteration: "Er'eh", hebrew: "אֶרְאֶה" },
      { subject: "You (m)", transliteration: "Tir'eh", hebrew: "תִּרְאֶה" },
      { subject: "You (f)", transliteration: "Tir'i", hebrew: "תִּרְאִי" },
      { subject: "He", transliteration: "Yir'eh", hebrew: "יִרְאֶה" },
      { subject: "She", transliteration: "Tir'eh", hebrew: "תִּרְאֶה" },
      { subject: "We", transliteration: "Nir'eh", hebrew: "נִרְאֶה" },
      { subject: "You (pl)", transliteration: "Tir'u", hebrew: "תִּרְאוּ" },
      { subject: "They", transliteration: "Yir'u", hebrew: "יִרְאוּ" },
    ],
  },
  {
    id: "le'ehov",
    infinitive: "לֶאֱהֹב",
    romanized: "Le'ehov",
    meaning: "To Love",
    root: "א-ה-ב",
    rootRoman: "A-H-V",
    ruleNote: "Pe-alef verb — starts with א. The alef prefix blends with the conjugation prefix, causing vowel shifts.",
    prefixRules: [
      { prefix: "Ohev → ", pronoun: "I (irregular: special prefix)" },
      { prefix: "Te-", pronoun: "You / She → Te'ehav" },
      { prefix: "Ye-", pronoun: "He / They → Ye'ehav" },
      { prefix: "Ne-", pronoun: "We → Ne'ehav" },
    ],
    rows: [
      { subject: "I", transliteration: "O-hav", hebrew: "אֹהַב" },
      { subject: "You (m)", transliteration: "Te'e-hav", hebrew: "תֶּאֱהַב" },
      { subject: "You (f)", transliteration: "Te'e-hav-i", hebrew: "תֶּאֱהֲבִי" },
      { subject: "He", transliteration: "Ye'e-hav", hebrew: "יֶאֱהַב" },
      { subject: "She", transliteration: "Te'e-hav", hebrew: "תֶּאֱהַב" },
      { subject: "We", transliteration: "Ne'e-hav", hebrew: "נֶאֱהַב" },
      { subject: "You (pl)", transliteration: "Te'e-hav-u", hebrew: "תֶּאֱהֲבוּ" },
      { subject: "They", transliteration: "Ye'e-hav-u", hebrew: "יֶאֱהֲבוּ" },
    ],
  },
  {
    id: "la'asot",
    infinitive: "לַעֲשׂוֹת",
    romanized: "La'asot",
    meaning: "To Do / Make",
    root: "ע-ש-ה",
    rootRoman: "'A-Sh-H",
    ruleNote: "Lamed-heh verb with ayin-guttural (ע). The ה drops in future. Extremely common — must know!",
    prefixRules: [
      { prefix: "E'e-", pronoun: "I → E'eseh" },
      { prefix: "Ta'a-", pronoun: "You / She → Ta'aseh" },
      { prefix: "Ya'a-", pronoun: "He / They → Ya'aseh" },
      { prefix: "Na'a-", pronoun: "We → Na'aseh" },
    ],
    rows: [
      { subject: "I", transliteration: "E'e-seh", hebrew: "אֶעֱשֶׂה" },
      { subject: "You (m)", transliteration: "Ta'a-seh", hebrew: "תַּעֲשֶׂה" },
      { subject: "You (f)", transliteration: "Ta'a-s-i", hebrew: "תַּעֲשִׂי" },
      { subject: "He", transliteration: "Ya'a-seh", hebrew: "יַעֲשֶׂה" },
      { subject: "She", transliteration: "Ta'a-seh", hebrew: "תַּעֲשֶׂה" },
      { subject: "We", transliteration: "Na'a-seh", hebrew: "נַעֲשֶׂה" },
      { subject: "You (pl)", transliteration: "Ta'a-s-u", hebrew: "תַּעֲשׂוּ" },
      { subject: "They", transliteration: "Ya'a-s-u", hebrew: "יַעֲשׂוּ" },
    ],
  },
  {
    id: "lomar",
    infinitive: "לוֹמַר",
    romanized: "Lomar",
    meaning: "To Say",
    root: "א-מ-ר",
    rootRoman: "A-M-R",
    ruleNote: "Pe-alef verb. Very common. The initial א creates unique vowel patterns in the future.",
    prefixRules: [
      { prefix: "O-", pronoun: "I → Omar" },
      { prefix: "To-", pronoun: "You / She → Tomar" },
      { prefix: "Yo-", pronoun: "He / They → Yomar" },
      { prefix: "No-", pronoun: "We → Nomar" },
    ],
    rows: [
      { subject: "I", transliteration: "O-mar", hebrew: "אֹמַר" },
      { subject: "You (m)", transliteration: "To-mar", hebrew: "תֹּאמַר" },
      { subject: "You (f)", transliteration: "To-mr-i", hebrew: "תֹּאמְרִי" },
      { subject: "He", transliteration: "Yo-mar", hebrew: "יֹאמַר" },
      { subject: "She", transliteration: "To-mar", hebrew: "תֹּאמַר" },
      { subject: "We", transliteration: "No-mar", hebrew: "נֹאמַר" },
      { subject: "You (pl)", transliteration: "To-mr-u", hebrew: "תֹּאמְרוּ" },
      { subject: "They", transliteration: "Yo-mr-u", hebrew: "יֹאמְרוּ" },
    ],
  },
];

function EditableCell({ value, onChange }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const save = () => {
    onChange(draft);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") { setDraft(value); setEditing(false); } }}
        className="w-full bg-amber-50 border border-amber-400 rounded px-2 py-0.5 text-center outline-none text-sm"
        style={{ minWidth: 60 }}
      />
    );
  }

  return (
    <span
      onClick={() => { setEditing(true); setDraft(value); }}
      className="cursor-pointer px-1 rounded hover:bg-amber-100 transition-colors"
      title="Click to edit"
    >
      {value}
    </span>
  );
}

function VerbCard({ verb }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(verb.rows);
  const [rules, setRules] = useState(verb.prefixRules);
  const [ruleNote, setRuleNote] = useState(verb.ruleNote);

  const updateRow = (idx, field, val) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r));
  };

  const updateRule = (idx, field, val) => {
    setRules(prev => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r));
  };

  return (
    <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-stone-200 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full p-5 text-left flex items-center justify-between hover:bg-stone-50/50 transition-all"
        style={{ background: 'linear-gradient(135deg, #5a6b5a18, #6b7c6312)' }}
      >
        <div>
          <div className="flex items-center gap-3">
            <h3 className="text-xl font-bold" style={{ color: '#3d4a2e', fontFamily: 'Cormorant Garamond, Georgia, serif' }}>
              {verb.infinitive} — {verb.romanized}
            </h3>
          </div>
          <p className="text-stone-500 text-sm mt-0.5">{verb.meaning} · Future Tense · Root: {verb.root} ({verb.rootRoman})</p>
        </div>
        <ChevronDown className={`w-5 h-5 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} style={{ color: '#6b7c5a' }} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {/* Rule Note */}
            <div className="mx-4 mt-4 p-3 rounded-xl text-sm" style={{ background: '#f5f0e825', border: '1px solid #5a6b5a30' }}>
              <p className="font-semibold mb-1" style={{ color: '#3d4a2e' }}>📌 Rule</p>
              <p
                onClick={e => {
                  const el = e.currentTarget;
                  el.contentEditable = "true";
                  el.focus();
                  const range = document.createRange();
                  range.selectNodeContents(el);
                  window.getSelection().removeAllRanges();
                  window.getSelection().addRange(range);
                }}
                onBlur={e => setRuleNote(e.currentTarget.textContent)}
                className="cursor-pointer hover:bg-amber-50 rounded px-1 transition-colors"
                style={{ color: '#5a6b5a' }}
                suppressContentEditableWarning
              >
                {ruleNote}
              </p>

              {/* Prefix rules grid */}
              <div className="grid grid-cols-2 gap-1 mt-3 text-xs" style={{ color: '#6b7c5a' }}>
                {rules.map((r, i) => (
                  <span key={i} className="flex gap-1">
                    •{" "}
                    <EditableCell value={r.prefix} onChange={v => updateRule(i, "prefix", v)} />
                    <span className="text-stone-400">→</span>
                    <EditableCell value={r.pronoun} onChange={v => updateRule(i, "pronoun", v)} />
                  </span>
                ))}
              </div>
            </div>

            {/* Conjugation Table */}
            <div className="p-4 space-y-2">
              {rows.map((row, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 rounded-xl"
                  style={{ background: idx % 2 === 0 ? '#ffffff60' : '#f5f0e840', border: '1px solid #e8e4d850' }}
                >
                  <span className="text-sm font-medium w-20 flex-shrink-0" style={{ color: '#6b7c5a' }}>{row.subject}</span>
                  <span className="text-base font-semibold flex-1 text-center" style={{ color: '#3d4a2e' }}>
                    <EditableCell value={row.transliteration} onChange={v => updateRow(idx, "transliteration", v)} />
                  </span>
                  <span className="text-xl font-bold text-right flex-shrink-0" style={{ color: '#5a6b3a', direction: 'rtl', minWidth: 80 }}>
                    <EditableCell value={row.hebrew} onChange={v => updateRow(idx, "hebrew", v)} />
                  </span>
                </div>
              ))}
              <p className="text-xs text-stone-400 text-center pt-1">Click any cell to edit</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function GrammarTab() {
  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl mb-2" style={{ background: '#5a6b5a18', border: '1px solid #5a6b5a30' }}>
        <p className="text-sm font-semibold mb-1" style={{ color: '#3d4a2e' }}>⚡ Future Tense — The Pattern</p>
        <p className="text-xs" style={{ color: '#5a6b5a' }}>
          In Hebrew, the future tense is formed by adding <strong>prefixes</strong> (and sometimes <strong>suffixes</strong>) to the verb root. The prefix indicates the subject (I/you/he/we/they). Click any verb to expand its conjugation table. <strong>Click any cell to edit it.</strong>
        </p>
      </div>
      {VERBS.map(verb => (
        <VerbCard key={verb.id} verb={verb} />
      ))}
    </div>
  );
}
