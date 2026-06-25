"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

const SECTIONS = [
  {
    id: "time",
    emoji: "⏰",
    title: "Time & Structure",
    items: [
      { hebrew: "הַיּוֹם", roman: "hayóm", english: "today" },
      { hebrew: "מָחָר", roman: "machár", english: "tomorrow" },
      { hebrew: "אֶתְמוֹל", roman: "etmól", english: "yesterday" },
      { hebrew: "עַכְשָׁו", roman: "achsháv", english: "now" },
      { hebrew: "תָּמִיד", roman: "tamíd", english: "always" },
      { hebrew: "רֶגַע", roman: "réga", english: "moment" },
      { hebrew: "שָׁעָה", roman: "shaá", english: "hour" },
      { hebrew: "דַּקָּה", roman: "daká", english: "minute" },
    ],
  },
  {
    id: "days",
    emoji: "📅",
    title: "Days of the Week",
    items: [
      { hebrew: "יוֹם רִאשׁוֹן", roman: "yom rishón", english: "Sunday" },
      { hebrew: "יוֹם שֵׁנִי", roman: "yom shení", english: "Monday" },
      { hebrew: "יוֹם שְׁלִישִׁי", roman: "yom shlishí", english: "Tuesday" },
      { hebrew: "יוֹם רְבִיעִי", roman: "yom rvií", english: "Wednesday" },
      { hebrew: "יוֹם חֲמִישִׁי", roman: "yom chamishí", english: "Thursday" },
      { hebrew: "יוֹם שִׁשִּׁי", roman: "yom shishí", english: "Friday" },
      { hebrew: "שַׁבָּת", roman: "shabát", english: "Saturday / Shabbat" },
    ],
  },
  {
    id: "months",
    emoji: "🗓️",
    title: "Months",
    items: [
      { hebrew: "יָנוּאָר", roman: "yanúar", english: "January" },
      { hebrew: "פֶבְרוּאָר", roman: "fevrúar", english: "February" },
      { hebrew: "מָרְץ", roman: "mártz", english: "March" },
      { hebrew: "אַפְרִיל", roman: "apríl", english: "April" },
      { hebrew: "מַאי", roman: "mái", english: "May" },
      { hebrew: "יוּנִי", roman: "yúni", english: "June" },
      { hebrew: "יוּלִי", roman: "yúli", english: "July" },
      { hebrew: "אוֹגוּסְט", roman: "ogúst", english: "August" },
      { hebrew: "סֶפְטֶמְבֶּר", roman: "septémber", english: "September" },
      { hebrew: "אוֹקְטוֹבֶר", roman: "október", english: "October" },
      { hebrew: "נוֹבֶמְבֶּר", roman: "novémber", english: "November" },
      { hebrew: "דֶּצֶמְבֶּר", roman: "detsémber", english: "December" },
    ],
  },
  {
    id: "numbers",
    emoji: "🔢",
    title: "Numbers (0–20 + key)",
    items: [
      { hebrew: "אֶפֶס", roman: "éfes", english: "0" },
      { hebrew: "אֶחָד", roman: "echád", english: "1" },
      { hebrew: "שְׁתַּיִם", roman: "shtáyim", english: "2" },
      { hebrew: "שָׁלוֹשׁ", roman: "shalósh", english: "3" },
      { hebrew: "אַרְבַּע", roman: "árba", english: "4" },
      { hebrew: "חָמֵשׁ", roman: "chamésḥ", english: "5" },
      { hebrew: "שֵׁשׁ", roman: "shesh", english: "6" },
      { hebrew: "שֶׁבַע", roman: "shéva", english: "7" },
      { hebrew: "שְׁמוֹנֶה", roman: "shmoné", english: "8" },
      { hebrew: "תֵּשַׁע", roman: "tésha", english: "9" },
      { hebrew: "עֶשֶׂר", roman: "éser", english: "10" },
      { hebrew: "אַחַד עָשָׂר", roman: "achád asar", english: "11" },
      { hebrew: "שְׁנֵים עָשָׂר", roman: "shném asar", english: "12" },
      { hebrew: "עֶשְׂרִים", roman: "esrím", english: "20" },
      { hebrew: "שְׁלוֹשִׁים", roman: "shloshím", english: "30" },
      { hebrew: "אַרְבָּעִים", roman: "arbaím", english: "40" },
      { hebrew: "חֲמִישִׁים", roman: "chamishím", english: "50" },
      { hebrew: "מֵאָה", roman: "meá", english: "100" },
      { hebrew: "אֶלֶף", roman: "élef", english: "1,000" },
    ],
  },
  {
    id: "questions",
    emoji: "❓",
    title: "Question Words",
    items: [
      { hebrew: "מָה", roman: "ma", english: "what" },
      { hebrew: "מִי", roman: "mi", english: "who" },
      { hebrew: "אֵיפֹה", roman: "eifó", english: "where" },
      { hebrew: "מָתַי", roman: "matái", english: "when" },
      { hebrew: "לָמָּה", roman: "láma", english: "why" },
      { hebrew: "אֵיךְ", roman: "eich", english: "how" },
      { hebrew: "כַּמָּה", roman: "kamá", english: "how much / many" },
      { hebrew: "אֵיזֶה", roman: "éize", english: "which" },
    ],
  },
  {
    id: "pronouns",
    emoji: "👤",
    title: "Pronouns",
    items: [
      { hebrew: "אֲנִי", roman: "aní", english: "I" },
      { hebrew: "אַתָּה", roman: "atá", english: "you (m)" },
      { hebrew: "אַת", roman: "at", english: "you (f)" },
      { hebrew: "הוּא", roman: "hu", english: "he" },
      { hebrew: "הִיא", roman: "hi", english: "she" },
      { hebrew: "אֲנַחְנוּ", roman: "anáchnu", english: "we" },
      { hebrew: "אַתֶּם", roman: "atém", english: "you (pl m)" },
      { hebrew: "אַתֶּן", roman: "atén", english: "you (pl f)" },
      { hebrew: "הֵם", roman: "hem", english: "they (m)" },
      { hebrew: "הֵן", roman: "hen", english: "they (f)" },
    ],
  },
  {
    id: "connectors",
    emoji: "🔗",
    title: "Connectors",
    items: [
      { hebrew: "וְ", roman: "ve", english: "and" },
      { hebrew: "אֲבָל", roman: "avál", english: "but" },
      { hebrew: "כִּי", roman: "ki", english: "because" },
      { hebrew: "אָז", roman: "az", english: "so / then" },
      { hebrew: "גַּם", roman: "gam", english: "also / too" },
      { hebrew: "רַק", roman: "rak", english: "only / just" },
      { hebrew: "אוֹ", roman: "o", english: "or" },
      { hebrew: "אִם", roman: "im", english: "if" },
      { hebrew: "כְּשֶׁ", roman: "kshe", english: "when (conjunction)" },
    ],
  },
  {
    id: "prepositions",
    emoji: "📍",
    title: "Prepositions",
    items: [
      { hebrew: "בְּ", roman: "be", english: "in / at" },
      { hebrew: "לְ", roman: "le", english: "to / for" },
      { hebrew: "מִ", roman: "mi", english: "from" },
      { hebrew: "עִם", roman: "im", english: "with" },
      { hebrew: "עַל", roman: "al", english: "on / about" },
      { hebrew: "אֶל", roman: "el", english: "to (direction)" },
      { hebrew: "שֶׁל", roman: "shel", english: "of / belonging to" },
      { hebrew: "בֵּין", roman: "bein", english: "between" },
      { hebrew: "אַחֲרֵי", roman: "acharéi", english: "after" },
      { hebrew: "לִפְנֵי", roman: "lifnéi", english: "before / in front of" },
    ],
  },
  {
    id: "adjectives",
    emoji: "🎨",
    title: "Descriptors (Adjectives)",
    items: [
      { hebrew: "טוֹב", roman: "tov", english: "good" },
      { hebrew: "רַע", roman: "ra", english: "bad" },
      { hebrew: "גָּדוֹל", roman: "gadól", english: "big" },
      { hebrew: "קָטָן", roman: "katán", english: "small" },
      { hebrew: "חָדָשׁ", roman: "chadásh", english: "new" },
      { hebrew: "יָשָׁן", roman: "yashán", english: "old" },
      { hebrew: "יָפֶה", roman: "yafé", english: "beautiful / nice" },
      { hebrew: "קָשֶׁה", roman: "kashe", english: "hard / difficult" },
      { hebrew: "קַל", roman: "kal", english: "easy / light" },
      { hebrew: "מְעַנְיֵן", roman: "me'anyén", english: "interesting" },
    ],
  },
  {
    id: "nouns",
    emoji: "🏠",
    title: "Daily Life Nouns",
    items: [
      { hebrew: "בַּיִת", roman: "báyit", english: "house / home" },
      { hebrew: "עֲבוֹדָה", roman: "avodá", english: "work / job" },
      { hebrew: "כֶּסֶף", roman: "késef", english: "money" },
      { hebrew: "זְמַן", roman: "zmán", english: "time" },
      { hebrew: "יוֹם", roman: "yom", english: "day" },
      { hebrew: "לַיְלָה", roman: "láyla", english: "night" },
      { hebrew: "אֹכֶל", roman: "óchel", english: "food" },
      { hebrew: "מַיִם", roman: "máyim", english: "water" },
      { hebrew: "אִישׁ", roman: "ish", english: "man / person" },
      { hebrew: "אִשָּׁה", roman: "ishá", english: "woman" },
      { hebrew: "יֶלֶד", roman: "yéled", english: "child / boy" },
      { hebrew: "מִשְׁפָּחָה", roman: "mishpachá", english: "family" },
    ],
  },
  {
    id: "core_verbs",
    emoji: "⚡",
    title: "Core Verbs (High ROI)",
    items: [
      { hebrew: "לִהְיוֹת", roman: "lihyót", english: "to be" },
      { hebrew: "לַעֲשׂוֹת", roman: "la'asót", english: "to do / make" },
      { hebrew: "לָלֶכֶת", roman: "laléchet", english: "to go / walk" },
      { hebrew: "לָבוֹא", roman: "lavó", english: "to come" },
      { hebrew: "לָקַחַת", roman: "lakáchat", english: "to take" },
      { hebrew: "לָתֵת", roman: "latét", english: "to give" },
      { hebrew: "לִבְחֹר", roman: "livchór", english: "to choose" },
      { hebrew: "לִשְׁלֹחַ", roman: "lishlóach", english: "to send" },
      { hebrew: "לְדַבֵּר", roman: "ledabér", english: "to speak" },
      { hebrew: "לִרְאוֹת", roman: "lir'ót", english: "to see" },
      { hebrew: "לֶאֱהֹב", roman: "le'ehóv", english: "to love" },
      { hebrew: "לוֹמַר", roman: "lomár", english: "to say" },
      { hebrew: "לִשְׁמֹעַ", roman: "lishmóa", english: "to hear / listen" },
      { hebrew: "לָדַעַת", roman: "ladáat", english: "to know" },
      { hebrew: "לִרְצוֹת", roman: "lirtzót", english: "to want" },
      { hebrew: "לְיַכוֹל", roman: "leychól", english: "to be able to / can" },
      { hebrew: "לַחְשׁוֹב", roman: "lachshóv", english: "to think" },
    ],
  },
];

function Section({ section, onAddToBackpack }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-stone-200 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full p-4 text-left flex items-center justify-between hover:bg-stone-50/50 transition-all"
        style={{ background: 'linear-gradient(135deg, #5a6b5a18, #6b7c6312)' }}
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">{section.emoji}</span>
          <div>
            <h3 className="font-bold text-base" style={{ color: '#3d4a2e', fontFamily: 'Cormorant Garamond, Georgia, serif' }}>
              {section.title}
            </h3>
            <p className="text-stone-400 text-xs">{section.items.length} words</p>
          </div>
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
            <div className="p-4 flex flex-wrap gap-3 justify-center">
              {section.items.map((item, idx) => (
                <div
                  key={idx}
                  className="flex flex-col items-center text-center px-3 py-1.5 rounded-lg group w-fit"
                  style={{ background: idx % 2 === 0 ? '#ffffff70' : '#f5f0e850', border: '1px solid #e8e4d860' }}
                >
                  <span className="text-xs font-medium leading-none" style={{ color: '#6b7c5a' }}>{item.roman}</span>
                  <span className="text-[10px] text-stone-500 leading-none">{item.english}</span>
                  <span className="text-base font-bold leading-none mt-0.5" dir="rtl" style={{ color: '#3d4a2e' }}>{item.hebrew}</span>
                  {onAddToBackpack && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddToBackpack({ hebrew: item.hebrew, transliteration: item.roman, english: item.english });
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity mt-1 px-1.5 py-0.5 rounded text-xs font-medium bg-amber-500/20 text-amber-600 hover:bg-amber-500/30"
                      title="Add to backpack"
                    >
                      +
                    </button>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function CoreVocabTab({ onAddToBackpack }) {
  return (
    <div className="space-y-3">
      <div className="p-4 rounded-xl mb-2" style={{ background: '#5a6b5a18', border: '1px solid #5a6b5a30' }}>
        <p className="text-sm font-semibold mb-1" style={{ color: '#3d4a2e' }}>📚 Core Vocabulary — The Foundation</p>
        <p className="text-xs" style={{ color: '#5a6b5a' }}>
          These are the highest-ROI words in Hebrew. Master these first and you'll understand the structure of most everyday conversations. Click any word's + to add to backpack.
        </p>
      </div>
      {SECTIONS.map(section => (
        <Section key={section.id} section={section} onAddToBackpack={onAddToBackpack} />
      ))}
    </div>
  );
}
