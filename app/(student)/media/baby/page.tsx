"use client";

import React, { useState, useEffect } from "react";
import { base44 as base44Client } from "@/api/base44Client";
// base44Client is a JS shim whose `entities` are built dynamically, so TS can't
// see entity keys. Cast to `any` for ergonomic access — the runtime shape is
// guaranteed by the shim.
const base44: any = base44Client;
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Play, ArrowLeft, Coins, Check, Backpack, Volume2, Star, BookOpen, Plus, ChevronRight, Loader2, FileText, GripVertical, ChevronDown, Music, Upload, Trash2 } from "lucide-react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import KaraokeTranscript from "@/components/transcript/KaraokeTranscript";
import { Input } from "@/components/ui/input";
import { useNavigate } from "@/lib/router-compat";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import GameHeader from "@/components/game/GameHeader";
import ClickableWord from "@/components/learning/ClickableWord";
import TranslatorWidget from "@/components/TranslatorWidget";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import VideoTranscript from "@/components/video/VideoTranscript";
import EditableWord from "@/components/learning/EditableWord";
import VideoAdminControls from "@/components/admin/VideoAdminControls";
import GrammarTab from "@/components/grammar/GrammarTab";
import { transcribeMediaSource, youtubeSource } from "@/lib/transcription";
import CoreVocabTab from "@/components/grammar/CoreVocabTab";

// Videos with transcripts - Piece of Hebrew channel
const level1Videos: any[] = [
  {
    id: 1,
    title: "Learn Hebrew Every Day - הַרְגָלִים",
    thumbnail: "https://img.youtube.com/vi/n8XvkVp6CfQ/maxresdefault.jpg",
    youtubeId: "n8XvkVp6CfQ",
    duration: "13:07",
    coins: 75,
    category: "Daily Habits",
    transcript: [
      { transliteration: "Hergel", english: "Habit", hebrew: "הֶרְגֵּל", time: "0:30" },
      { transliteration: "Lilmod", english: "To learn", hebrew: "לִלְמוֹד", time: "1:00" },
      { transliteration: "Kol yom", english: "Every day", hebrew: "כָּל יוֹם", time: "1:30" },
      { transliteration: "Asuk", english: "Busy", hebrew: "עָסוּק", time: "2:00" },
      { transliteration: "Zman", english: "Time", hebrew: "זְמַן", time: "2:30" },
      { transliteration: "Daka", english: "Minute", hebrew: "דַּקָּה", time: "3:00" },
      { transliteration: "Kashe", english: "Hard/Difficult", hebrew: "קָשֶׁה", time: "3:30" },
      { transliteration: "Kal", english: "Easy", hebrew: "קַל", time: "4:00" },
      { transliteration: "Lehatchil", english: "To start", hebrew: "לְהִתְחִיל", time: "4:30" },
      { transliteration: "Lehamshich", english: "To continue", hebrew: "לְהַמְשִׁיךְ", time: "5:00" },
      { transliteration: "Lo levater", english: "Don't give up", hebrew: "לֹא לְוַתֵּר", time: "5:30" },
      { transliteration: "Hatzlacha", english: "Success", hebrew: "הַצְלָחָה", time: "6:00" },
      { transliteration: "Letargel", english: "To practice", hebrew: "לְתַרְגֵּל", time: "6:30" },
      { transliteration: "Ivrit", english: "Hebrew", hebrew: "עִבְרִית", time: "7:00" },
      { transliteration: "Ledaber", english: "To speak", hebrew: "לְדַבֵּר", time: "7:30" },
      { transliteration: "Likro", english: "To read", hebrew: "לִקְרוֹא", time: "8:00" },
      { transliteration: "Lichtov", english: "To write", hebrew: "לִכְתּוֹב", time: "8:30" },
      { transliteration: "Lishmoa", english: "To listen", hebrew: "לִשְׁמוֹעַ", time: "9:00" },
    ],
    exercises: [
      {
        type: "multiple_choice",
        question: "What does 'הֶרְגֵּל' (Hergel) mean?",
        options: ["Time", "Habit", "Day", "Easy"],
        correct: 1
      },
      {
        type: "multiple_choice",
        question: "How do you say 'every day' in Hebrew?",
        options: ["Kol yom", "Zman", "Daka", "Kashe"],
        correct: 0
      },
      {
        type: "multiple_choice",
        question: "What is the opposite of 'קָשֶׁה' (Kashe - Hard)?",
        options: ["Asuk", "Kal", "Zman", "Hergel"],
        correct: 1
      },
    ]
  },
  {
    id: 2,
    title: "Israeli School System 🎒",
    thumbnail: "https://img.youtube.com/vi/L93zseSWcsg/maxresdefault.jpg",
    youtubeId: "L93zseSWcsg",
    duration: "14:53",
    coins: 80,
    category: "School",
    transcript: [
      { hebrew: "בֵּית סֵפֶר", transliteration: "Beit sefer", meaning: "School", time: "0:30" },
      { hebrew: "גַּן יְלָדִים", transliteration: "Gan yeladim", meaning: "Kindergarten", time: "1:00" },
      { hebrew: "כִּיתָּה", transliteration: "Kita", meaning: "Class/Grade", time: "1:20" },
      { hebrew: "תִּיכוֹן", transliteration: "Tichon", meaning: "High school", time: "1:30" },
      { hebrew: "יְסוֹדִי", transliteration: "Yesodi", meaning: "Elementary", time: "1:45" },
      { hebrew: "תַּלְמִיד", transliteration: "Talmid", meaning: "Student (m)", time: "2:00" },
      { hebrew: "תַּלְמִידָה", transliteration: "Talmida", meaning: "Student (f)", time: "2:15" },
      { hebrew: "מוֹרֶה", transliteration: "Moreh", meaning: "Teacher (m)", time: "2:30" },
      { hebrew: "מוֹרָה", transliteration: "Mora", meaning: "Teacher (f)", time: "2:45" },
      { hebrew: "שִׁעוּר", transliteration: "Shiur", meaning: "Lesson", time: "3:00" },
      { hebrew: "הַפְסָקָה", transliteration: "Hafsaka", meaning: "Break", time: "3:30" },
      { hebrew: "אֲרוּחַת צָהֳרַיִם", transliteration: "Aruchat tzohorayim", meaning: "Lunch", time: "3:45" },
      { hebrew: "שִׁעוּרֵי בַּיִת", transliteration: "Shiurei bayit", meaning: "Homework", time: "4:00" },
      { hebrew: "מִבְחָן", transliteration: "Mivchan", meaning: "Test/Exam", time: "4:30" },
      { hebrew: "צִיּוּן", transliteration: "Tziun", meaning: "Grade", time: "5:00" },
      { hebrew: "מַנְהָל", transliteration: "Manhal", meaning: "Principal", time: "5:30" },
      { hebrew: "חֲצֵר", transliteration: "Chatzer", meaning: "Yard/Playground", time: "6:00" },
      { hebrew: "סֵפֶר", transliteration: "Sefer", meaning: "Book", time: "6:30" },
      { hebrew: "מַחְבֶּרֶת", transliteration: "Machberet", meaning: "Notebook", time: "7:00" },
      { hebrew: "עִפָּרוֹן", transliteration: "Iparon", meaning: "Pencil", time: "7:30" },
      { hebrew: "תִּיק", transliteration: "Tik", meaning: "Bag/Backpack", time: "8:00" },
      { hebrew: "לוּחַ", transliteration: "Luach", meaning: "Board", time: "8:30" },
      { hebrew: "שֻׁלְחָן", transliteration: "Shulchan", meaning: "Desk/Table", time: "9:00" },
      { hebrew: "כִּסֵּא", transliteration: "Kiseh", meaning: "Chair", time: "9:30" },
    ],
    exercises: [
      {
        type: "multiple_choice",
        question: "What does 'בֵּית סֵפֶר' mean?",
        options: ["House", "School", "Library", "Office"],
        correct: 1
      },
      {
        type: "multiple_choice",
        question: "How do you say 'homework' in Hebrew?",
        options: ["Mivchan", "Shiurei bayit", "Hafsaka", "Tziun"],
        correct: 1
      },
    ]
  },
  {
    id: 3,
    title: "Public Transportation 🚌",
    thumbnail: "https://img.youtube.com/vi/IS11NMk9sW8/maxresdefault.jpg",
    youtubeId: "IS11NMk9sW8",
    duration: "13:44",
    coins: 70,
    category: "Travel",
    transcript: [
      { hebrew: "אוֹטוֹבּוּס", transliteration: "Otobus", meaning: "Bus", time: "0:30" },
      { hebrew: "רַכֶּבֶת", transliteration: "Rakevet", meaning: "Train", time: "1:00" },
      { hebrew: "רַכֶּבֶת קַלָּה", transliteration: "Rakevet kala", meaning: "Light rail", time: "1:20" },
      { hebrew: "תַּחֲנָה", transliteration: "Tachana", meaning: "Station", time: "1:30" },
      { hebrew: "תַּחֲנָה מֶרְכָּזִית", transliteration: "Tachana merkazit", meaning: "Central station", time: "1:45" },
      { hebrew: "מוֹנִית", transliteration: "Monit", meaning: "Taxi", time: "2:00" },
      { hebrew: "נַהָג", transliteration: "Nahag", meaning: "Driver", time: "2:15" },
      { hebrew: "כַּרְטִיס", transliteration: "Kartis", meaning: "Ticket", time: "2:30" },
      { hebrew: "רַב קַו", transliteration: "Rav kav", meaning: "Bus card", time: "2:45" },
      { hebrew: "נוֹסֵעַ", transliteration: "Nosea", meaning: "Passenger", time: "3:00" },
      { hebrew: "לַעֲלוֹת", transliteration: "La'alot", meaning: "To get on", time: "3:30" },
      { hebrew: "לָרֶדֶת", transliteration: "Laredet", meaning: "To get off", time: "4:00" },
      { hebrew: "עֲצִירָה", transliteration: "Atzira", meaning: "Stop", time: "4:30" },
      { hebrew: "קַו", transliteration: "Kav", meaning: "Line/Route", time: "5:00" },
      { hebrew: "לוּחַ זְמַנִּים", transliteration: "Luach zmanim", meaning: "Schedule", time: "5:30" },
      { hebrew: "אֵיחוּר", transliteration: "Ichur", meaning: "Delay", time: "6:00" },
      { hebrew: "מְהִיר", transliteration: "Mahir", meaning: "Fast", time: "6:30" },
      { hebrew: "אִטִּי", transliteration: "Iti", meaning: "Slow", time: "7:00" },
      { hebrew: "יָשָׁר", transliteration: "Yashar", meaning: "Straight", time: "7:30" },
      { hebrew: "יָמִינָה", transliteration: "Yamina", meaning: "Right", time: "8:00" },
      { hebrew: "שְׂמֹאלָה", transliteration: "Smola", meaning: "Left", time: "8:30" },
      { hebrew: "לְאָן?", transliteration: "Le'an?", meaning: "Where to?", time: "9:00" },
      { hebrew: "כַּמָּה עוֹלֶה?", transliteration: "Kama oleh?", meaning: "How much?", time: "9:30" },
    ],
    exercises: [
      {
        type: "multiple_choice",
        question: "What does 'רַכֶּבֶת' mean?",
        options: ["Bus", "Taxi", "Train", "Plane"],
        correct: 2
      },
      {
        type: "multiple_choice",
        question: "How do you say 'ticket' in Hebrew?",
        options: ["Tachana", "Kartis", "Monit", "Kav"],
        correct: 1
      },
    ]
  },
  {
    id: 4,
    title: "Van Life Day in Hebrew 🚐",
    thumbnail: "https://img.youtube.com/vi/Q2TToSUWbAw/maxresdefault.jpg",
    youtubeId: "Q2TToSUWbAw",
    duration: "9:42",
    coins: 55,
    category: "Daily Life",
    transcript: [
      { hebrew: "בֹּקֶר", transliteration: "Boker", meaning: "Morning", time: "0:30" },
      { hebrew: "לְהִתְעוֹרֵר", transliteration: "Lehit'orer", meaning: "To wake up", time: "1:00" },
      { hebrew: "קָם", transliteration: "Kam", meaning: "Got up", time: "1:15" },
      { hebrew: "שֵׁינָה", transliteration: "Sheina", meaning: "Sleep", time: "1:30" },
      { hebrew: "לְבַשֵּׁל", transliteration: "Levashel", meaning: "To cook", time: "2:00" },
      { hebrew: "אֹכֶל", transliteration: "Ochel", meaning: "Food", time: "2:15" },
      { hebrew: "אֲרוּחַת בֹּקֶר", transliteration: "Aruchat boker", meaning: "Breakfast", time: "2:30" },
      { hebrew: "קָפֶה", transliteration: "Kafe", meaning: "Coffee", time: "2:45" },
      { hebrew: "עֲבוֹדָה", transliteration: "Avoda", meaning: "Work", time: "3:00" },
      { hebrew: "מַחְשֵׁב", transliteration: "Machshev", meaning: "Computer", time: "3:30" },
      { hebrew: "אִינְטֶרְנֶט", transliteration: "Internet", meaning: "Internet", time: "3:45" },
      { hebrew: "טֶבַע", transliteration: "Teva", meaning: "Nature", time: "4:00" },
      { hebrew: "יָם", transliteration: "Yam", meaning: "Sea", time: "4:15" },
      { hebrew: "הָרִים", transliteration: "Harim", meaning: "Mountains", time: "4:30" },
      { hebrew: "חוֹפֶשׁ", transliteration: "Chofesh", meaning: "Freedom", time: "4:45" },
      { hebrew: "הַרְפַּתְקָה", transliteration: "Harpatka", meaning: "Adventure", time: "5:00" },
      { hebrew: "לָנוּחַ", transliteration: "Lanuach", meaning: "To rest", time: "5:30" },
      { hebrew: "לַיְלָה", transliteration: "Layla", meaning: "Night", time: "6:00" },
      { hebrew: "כּוֹכָבִים", transliteration: "Kochavim", meaning: "Stars", time: "6:30" },
      { hebrew: "יָפֶה", transliteration: "Yafe", meaning: "Beautiful", time: "7:00" },
      { hebrew: "שָׁקֵט", transliteration: "Shaket", meaning: "Quiet", time: "7:30" },
      { hebrew: "מְאֻשָּׁר", transliteration: "Me'ushar", meaning: "Happy", time: "8:00" },
    ],
  },
  {
    id: 5,
    title: "Travel Vocabulary - Packing ✈️",
    thumbnail: "https://img.youtube.com/vi/Lfj52BSoFq0/maxresdefault.jpg",
    youtubeId: "Lfj52BSoFq0",
    duration: "13:11",
    coins: 70,
    category: "Travel",
    transcript: [
      { hebrew: "מִזְוָדָה", transliteration: "Mizvada", meaning: "Suitcase", time: "0:30" },
      { hebrew: "תִּיק גַּב", transliteration: "Tik gav", meaning: "Backpack", time: "0:45" },
      { hebrew: "לֶאֱרוֹז", transliteration: "Le'eroz", meaning: "To pack", time: "1:00" },
      { hebrew: "בְּגָדִים", transliteration: "Begadim", meaning: "Clothes", time: "1:30" },
      { hebrew: "חֻלְצָה", transliteration: "Chultza", meaning: "Shirt", time: "1:45" },
      { hebrew: "מִכְנָסַיִם", transliteration: "Michnasayim", meaning: "Pants", time: "2:00" },
      { hebrew: "נַעֲלַיִם", transliteration: "Na'alayim", meaning: "Shoes", time: "2:15" },
      { hebrew: "דַּרְכּוֹן", transliteration: "Darkon", meaning: "Passport", time: "2:30" },
      { hebrew: "וִיזָה", transliteration: "Viza", meaning: "Visa", time: "2:45" },
      { hebrew: "טִיסָה", transliteration: "Tisa", meaning: "Flight", time: "3:00" },
      { hebrew: "שָׂדֶה תְּעוּפָה", transliteration: "Sdeh te'ufa", meaning: "Airport", time: "3:30" },
      { hebrew: "מָטוֹס", transliteration: "Matos", meaning: "Airplane", time: "3:45" },
      { hebrew: "לִנְסֹעַ", transliteration: "Linsoa", meaning: "To travel", time: "4:00" },
      { hebrew: "חֻפְשָׁה", transliteration: "Chufsha", meaning: "Vacation", time: "4:30" },
      { hebrew: "מָלוֹן", transliteration: "Malon", meaning: "Hotel", time: "5:00" },
      { hebrew: "חֶדֶר", transliteration: "Cheder", meaning: "Room", time: "5:15" },
      { hebrew: "הַזְמָנָה", transliteration: "Hazmana", meaning: "Reservation", time: "5:30" },
      { hebrew: "תַּיָּר", transliteration: "Tayar", meaning: "Tourist", time: "6:00" },
      { hebrew: "מַפָּה", transliteration: "Mapa", meaning: "Map", time: "6:30" },
      { hebrew: "מַזְכֶּרֶת", transliteration: "Mazkeret", meaning: "Souvenir", time: "7:00" },
      { hebrew: "תְּמוּנָה", transliteration: "Tmuna", meaning: "Picture/Photo", time: "7:30" },
      { hebrew: "מַצְלֵמָה", transliteration: "Matslema", meaning: "Camera", time: "8:00" },
    ],
    exercises: [
      {
        type: "multiple_choice",
        question: "What does 'מִזְוָדָה' mean?",
        options: ["Passport", "Ticket", "Suitcase", "Hotel"],
        correct: 2
      },
      {
        type: "multiple_choice",
        question: "How do you say 'airport' in Hebrew?",
        options: ["Tisa", "Malon", "Darkon", "Sdeh te'ufa"],
        correct: 3
      },
    ]
  },
  {
    id: 6,
    title: "Winter Day in Israel ☕❄️",
    thumbnail: "https://img.youtube.com/vi/owShOrwDC-c/maxresdefault.jpg",
    youtubeId: "owShOrwDC-c",
    duration: "13:00",
    coins: 65,
    category: "Seasons",
    transcript: [
      { hebrew: "חֹרֶף", transliteration: "Choref", meaning: "Winter", time: "0:30" },
      { hebrew: "קַר", transliteration: "Kar", meaning: "Cold", time: "1:00" },
      { hebrew: "קָרִיר", transliteration: "Karir", meaning: "Cool", time: "1:15" },
      { hebrew: "גֶּשֶׁם", transliteration: "Geshem", meaning: "Rain", time: "1:30" },
      { hebrew: "יוֹרֵד גֶּשֶׁם", transliteration: "Yored geshem", meaning: "It's raining", time: "1:45" },
      { hebrew: "מִטְרִיָּה", transliteration: "Mitriya", meaning: "Umbrella", time: "2:00" },
      { hebrew: "מְעִיל", transliteration: "Me'il", meaning: "Coat", time: "2:30" },
      { hebrew: "סְוֶדֶר", transliteration: "Sveder", meaning: "Sweater", time: "2:45" },
      { hebrew: "מַגָּפַיִם", transliteration: "Magafayim", meaning: "Boots", time: "3:00" },
      { hebrew: "חַם", transliteration: "Cham", meaning: "Hot/Warm", time: "3:15" },
      { hebrew: "קָפֶה", transliteration: "Kafe", meaning: "Coffee", time: "3:30" },
      { hebrew: "תֵּה", transliteration: "Te", meaning: "Tea", time: "4:00" },
      { hebrew: "שׁוֹקוֹ חַם", transliteration: "Shoko cham", meaning: "Hot chocolate", time: "4:15" },
      { hebrew: "בַּיִת", transliteration: "Bayit", meaning: "Home", time: "4:30" },
      { hebrew: "נָעִים", transliteration: "Na'im", meaning: "Pleasant/Cozy", time: "5:00" },
      { hebrew: "שְׂמִיכָה", transliteration: "Smicha", meaning: "Blanket", time: "5:30" },
      { hebrew: "חִימוּם", transliteration: "Chimum", meaning: "Heating", time: "6:00" },
      { hebrew: "עָנָן", transliteration: "Anan", meaning: "Cloud", time: "6:30" },
      { hebrew: "רוּחַ", transliteration: "Ruach", meaning: "Wind", time: "7:00" },
      { hebrew: "סוּפָה", transliteration: "Sufa", meaning: "Storm", time: "7:30" },
      { hebrew: "בָּרָד", transliteration: "Barad", meaning: "Hail", time: "8:00" },
      { hebrew: "שֶׁלֶג", transliteration: "Sheleg", meaning: "Snow", time: "8:30" },
    ],
  },
  {
    id: 7,
    title: "Hebrew Learning Tips 📚",
    thumbnail: "https://img.youtube.com/vi/gUmuuDHg2vM/maxresdefault.jpg",
    youtubeId: "gUmuuDHg2vM",
    duration: "12:12",
    coins: 60,
    category: "Learning",
    transcript: [
      { hebrew: "טִיפ", transliteration: "Tip", meaning: "Tip", time: "0:30" },
      { hebrew: "עֵצָה", transliteration: "Etza", meaning: "Advice", time: "1:00" },
      { hebrew: "תַּרְגּוּל", transliteration: "Tirgul", meaning: "Practice", time: "1:30" },
      { hebrew: "חֲזָרָה", transliteration: "Chazara", meaning: "Review", time: "1:45" },
      { hebrew: "שִׁנּוּן", transliteration: "Shinun", meaning: "Memorization", time: "2:00" },
      { hebrew: "זִכָּרוֹן", transliteration: "Zikaron", meaning: "Memory", time: "2:15" },
      { hebrew: "הֲבָנָה", transliteration: "Havana", meaning: "Understanding", time: "2:30" },
      { hebrew: "אוֹצַר מִלִּים", transliteration: "Otzar milim", meaning: "Vocabulary", time: "3:00" },
      { hebrew: "מִלָּה", transliteration: "Mila", meaning: "Word", time: "3:15" },
      { hebrew: "מִשְׁפָּט", transliteration: "Mishpat", meaning: "Sentence", time: "3:30" },
      { hebrew: "דִּקְדּוּק", transliteration: "Dikduk", meaning: "Grammar", time: "4:00" },
      { hebrew: "הִגּוּי", transliteration: "Higui", meaning: "Pronunciation", time: "4:30" },
      { hebrew: "שִׂיחָה", transliteration: "Sicha", meaning: "Conversation", time: "5:00" },
      { hebrew: "לְדַבֵּר", transliteration: "Ledaber", meaning: "To speak", time: "5:15" },
      { hebrew: "לְהַקְשִׁיב", transliteration: "Lehakshiv", meaning: "To listen", time: "5:30" },
      { hebrew: "לִקְרוֹא", transliteration: "Likro", meaning: "To read", time: "5:45" },
      { hebrew: "לִכְתּוֹב", transliteration: "Lichtov", meaning: "To write", time: "6:00" },
      { hebrew: "בִּטָּחוֹן", transliteration: "Bitachon", meaning: "Confidence", time: "6:30" },
      { hebrew: "טָעוּת", transliteration: "Ta'ut", meaning: "Mistake", time: "7:00" },
      { hebrew: "הִשְׁתַּפְּרוּת", transliteration: "Hishtaprut", meaning: "Improvement", time: "7:30" },
      { hebrew: "הַצְלָחָה", transliteration: "Hatzlacha", meaning: "Success", time: "8:00" },
      { hebrew: "סַבְלָנוּת", transliteration: "Savlanut", meaning: "Patience", time: "8:30" },
    ],
    exercises: [
      {
        type: "multiple_choice",
        question: "What does 'אוֹצַר מִלִּים' mean?",
        options: ["Grammar", "Vocabulary", "Pronunciation", "Practice"],
        correct: 1
      },
    ]
  },
  {
    id: 8,
    title: "Adult Independence 🏠",
    thumbnail: "https://img.youtube.com/vi/bAmh4Acx9jI/maxresdefault.jpg",
    youtubeId: "bAmh4Acx9jI",
    duration: "14:01",
    coins: 75,
    category: "Adult Life",
    transcript: [
      { hebrew: "עַצְמָאוּת", transliteration: "Atzma'ut", meaning: "Independence", time: "0:30" },
      { hebrew: "לָגוּר לְבַד", transliteration: "Lagur levad", meaning: "To live alone", time: "0:45" },
      { hebrew: "דִּירָה", transliteration: "Dira", meaning: "Apartment", time: "1:00" },
      { hebrew: "בַּיִת", transliteration: "Bayit", meaning: "House", time: "1:15" },
      { hebrew: "שְׂכִירוּת", transliteration: "Sechirut", meaning: "Rent", time: "1:30" },
      { hebrew: "בַּעַל בַּיִת", transliteration: "Ba'al bayit", meaning: "Landlord", time: "1:45" },
      { hebrew: "חֶשְׁבּוֹנוֹת", transliteration: "Cheshbonot", meaning: "Bills", time: "2:00" },
      { hebrew: "חַשְׁמַל", transliteration: "Chashmal", meaning: "Electricity", time: "2:15" },
      { hebrew: "מַיִם", transliteration: "Mayim", meaning: "Water", time: "2:30" },
      { hebrew: "גַּז", transliteration: "Gaz", meaning: "Gas", time: "2:45" },
      { hebrew: "מַשְׂכּוֹרֶת", transliteration: "Maskoret", meaning: "Salary", time: "3:00" },
      { hebrew: "עֲבוֹדָה", transliteration: "Avoda", meaning: "Work/Job", time: "3:15" },
      { hebrew: "חִסָּכוֹן", transliteration: "Chisayon", meaning: "Savings", time: "3:30" },
      { hebrew: "בַּנְק", transliteration: "Bank", meaning: "Bank", time: "3:45" },
      { hebrew: "כֶּסֶף", transliteration: "Kesef", meaning: "Money", time: "4:00" },
      { hebrew: "אַחְרָיוּת", transliteration: "Achrayut", meaning: "Responsibility", time: "4:15" },
      { hebrew: "בּוֹגֵר", transliteration: "Boger", meaning: "Adult/Graduate", time: "4:30" },
      { hebrew: "לְנַקּוֹת", transliteration: "Lenakot", meaning: "To clean", time: "5:00" },
      { hebrew: "לְבַשֵּׁל", transliteration: "Levashel", meaning: "To cook", time: "5:15" },
      { hebrew: "קְנִיּוֹת", transliteration: "Kniyot", meaning: "Shopping", time: "5:30" },
      { hebrew: "סוּפֶּר", transliteration: "Super", meaning: "Supermarket", time: "5:45" },
      { hebrew: "הַצְלָחָה", transliteration: "Hatzlacha", meaning: "Success", time: "6:00" },
      { hebrew: "עָתִיד", transliteration: "Atid", meaning: "Future", time: "6:30" },
      { hebrew: "חֲלוֹמוֹת", transliteration: "Chalomot", meaning: "Dreams", time: "7:00" },
    ],
    exercises: [
      {
        type: "multiple_choice",
        question: "What does 'עַצְמָאוּת' mean?",
        options: ["Apartment", "Independence", "Success", "Future"],
        correct: 1
      },
      {
        type: "multiple_choice",
        question: "How do you say 'salary' in Hebrew?",
        options: ["Sechirut", "Chisayon", "Maskoret", "Cheshbonot"],
        correct: 2
      },
    ]
  },
];

export default function BabyVideos() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams(); // next/navigation devuelve el objeto directo (no array como react-router)
  const [activeTab, setActiveTab] = useState(
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get('tab') === 'songs' ? 'songs' : 'videos'
  );
  const [videoTypeFilter, setVideoTypeFilter] = useState('all'); // all, video, audio, song
  const [expandedVideoId, setExpandedVideoId] = useState<any>(null);
  const [showVocabForVideo, setShowVocabForVideo] = useState<any>(null);
  const [selectedVideo, setSelectedVideo] = useState<any>(null);
  // Songs state
  const [expandedSongId, setExpandedSongId] = useState<any>(null);
  const [addingSong, setAddingSong] = useState(false);
  const [newSongUrl, setNewSongUrl] = useState("");
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [backpackOpen, setBackpackOpen] = useState(false);
  const [showFluent, setShowFluent] = useState(false);
  const [showExercises, setShowExercises] = useState(false);
  const [currentExercise, setCurrentExercise] = useState(0);
  const [exerciseAnswers, setExerciseAnswers] = useState<any>({});
  const [fillBlankAnswer, setFillBlankAnswer] = useState("");
  const [translateAnswer, setTranslateAnswer] = useState("");
  const [exerciseResults, setExerciseResults] = useState<any>(null);
  const [fullTranscripts, setFullTranscripts] = useState<any>({});
  const [loadingTranscript, setLoadingTranscript] = useState<any>(null);
  const [customVideoUrl, setCustomVideoUrl] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [videoEdits, setVideoEdits] = useState<any>({});
  const [recommendedExpanded, setRecommendedExpanded] = useState(false);

  // Check if current user is admin and if managing another user
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [managingUserEmail, setManagingUserEmail] = useState<any>(
    typeof window !== "undefined" ? localStorage.getItem('admin_managing_user') : null
  );

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const user = await base44.auth.me();
        setCurrentUser(user);
      } catch (e) {}
    };
    fetchUser();
  }, []);

  const { data: userProfile } = useQuery({
    queryKey: ['userProfile', currentUser?.email],
    queryFn: async () => {
      const profiles = await base44.entities.UserProfile.filter({ created_by: currentUser.email });
      return profiles[0] || null;
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: !!currentUser?.email,
  });

  const { data: userCoins } = useQuery({
    queryKey: ['userCoins', currentUser?.email],
    queryFn: async () => {
      const coins = await base44.entities.UserCoins.filter({ created_by: currentUser.email });
      return coins[0] || { coins: 0 };
    },
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: !!currentUser?.email,
  });

  const { data: wordRatings = [] } = useQuery({
    queryKey: ['wordRatings', currentUser?.email],
    queryFn: () => base44.entities.Word.filter({ category: "wordbank", created_by: currentUser.email }),
    staleTime: 3 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: !!currentUser?.email,
  });

  // Check if current user is a coach managing students
  const { data: coachAssignments = [] } = useQuery({
    queryKey: ['myCoachAssignments', currentUser?.email],
    queryFn: () => base44.entities.CoachAssignment.filter({ coach_email: currentUser.email }),
    enabled: !!currentUser && currentUser.role !== 'admin',
  });

  const { data: customVideos = [] } = useQuery({
    queryKey: ['customVideos', userProfile?.language, managingUserEmail],
    queryFn: async () => {
      const list = await base44.entities.Video.list();
      // Filter by language, deleted status, and user (if admin/coach is managing)
      const filtered = list.filter((v: any) => {
        const notDeleted = !v.deleted_at && v.is_active !== false;
        const matchesLanguage = !userProfile?.language || v.language === userProfile.language;

        // If admin is managing a user, show only that user's videos
        // If coach, check if managing this student
        const isCoachOfStudent = managingUserEmail && coachAssignments.some((a: any) => a.student_email === managingUserEmail);
        const matchesUser = managingUserEmail
          ? (v.created_by === managingUserEmail && (currentUser.role === 'admin' || isCoachOfStudent))
          : v.created_by === currentUser?.email;

        return notDeleted && matchesLanguage && matchesUser;
      });
      // Sort by order field
      return filtered.sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
    },
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
    enabled: !!userProfile && !!currentUser,
  });

  // Songs queries
  const { data: songs = [] } = useQuery({
    queryKey: ['songs'],
    queryFn: async () => {
      const allSongs = await base44.entities.Song.list();
      return allSongs.sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
    },
  });

  const { data: songProgress = [] } = useQuery({
    queryKey: ['songProgress'],
    queryFn: () => base44.entities.SongProgress.list(),
  });

  // Songs mutations
  const createSongProgressMutation = useMutation({
    mutationFn: (data: any) => base44.entities.SongProgress.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['songProgress'] }),
  });
  const updateSongProgressMutation = useMutation({
    mutationFn: ({ id, data }: any) => base44.entities.SongProgress.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['songProgress'] }),
  });
  const createSongMutation = useMutation({
    mutationFn: (song: any) => base44.entities.Song.create(song),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['songs'] }); setAddingSong(false); setNewSongUrl(""); toast.success("Song added! 🎵"); },
  });
  const updateSongMutation = useMutation({
    mutationFn: ({ id, data }: any) => base44.entities.Song.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['songs'] }); toast.success("Updated!"); },
  });
  const deleteSongMutation = useMutation({
    mutationFn: (id: any) => base44.entities.Song.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['songs'] }); toast.success("Song deleted"); },
  });
  const reorderSongsMutation = useMutation({
    mutationFn: async (reorderedSongs: any[]) => {
      await Promise.all(reorderedSongs.map((song, index) => base44.entities.Song.update(song.id, { order: index })));
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['songs'] }); },
  });

  const addWordToBackpack = async (word: any, songId: any, songTitle: any) => {
    const existingWord = wordRatings.find((w: any) => w.word === word.hebrew);
    if (existingWord) { toast.info("Already in backpack!"); return; }
    await createWordMutation.mutateAsync({ word: word.hebrew, translation: word.english, phonetic: word.transliteration, category: 'wordbank', example_sentence: `From song: ${songTitle}`, times_practiced: 1, mastered: false });
    toast.success(`Added "${word.transliteration}" to backpack! 🎒`);
    const progress = songProgress.find((p: any) => p.song_id === songId);
    const song = songs.find((s: any) => s.id === songId);
    if (song) {
      const allWordsAdded = song.transcript.every((w: any) => wordRatings.find((wr: any) => wr.word === w.hebrew) || w.hebrew === word.hebrew);
      if (progress) {
        await updateSongProgressMutation.mutateAsync({ id: progress.id, data: { words_added: [...(progress.words_added || []), word.hebrew], completed: allWordsAdded } });
        if (allWordsAdded) toast.success("🎉 Song completed! All words added!");
      } else {
        await createSongProgressMutation.mutateAsync({ song_id: songId, words_added: [word.hebrew], completed: allWordsAdded });
      }
    }
  };

  const handleSongsDragEnd = (result: any) => {
    if (!result.destination) return;
    const reordered = Array.from(songs);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);
    reorderSongsMutation.mutate(reordered);
  };

  const handleAddSong = () => {
    const ytId = extractYouTubeId(newSongUrl);
    if (!ytId && !newSongUrl.includes('http')) { toast.error("Invalid YouTube URL"); return; }
    createSongMutation.mutate({ title: `Song ${songs.length + 1}`, youtube_url: newSongUrl, youtube_id: ytId, transcript: [], level: 1, order: songs.length });
  };

  const handleAudioUpload = async (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('audio/')) { toast.error("Please upload an audio file"); return; }
    setUploadingAudio(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    createSongMutation.mutate({ title: `Song ${songs.length + 1}`, audio_url: file_url, transcript: [], level: 1, order: songs.length });
    setUploadingAudio(false);
  };

  const updateCoinsMutation = useMutation({
    mutationFn: (data: any) => base44.entities.UserCoins.update(userCoins?.id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['userCoins'] }),
  });

  const createWordMutation = useMutation({
    mutationFn: (word: any) => base44.entities.Word.create(word),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['wordRatings'] }),
  });

  const updateWordMutation = useMutation({
    mutationFn: ({ id, data }: any) => base44.entities.Word.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['wordRatings'] }),
  });

  const createVideoMutation = useMutation({
    mutationFn: async (video: any) => {
      console.log('Creating video:', video);
      const result = await base44.entities.Video.create(video);
      console.log('Video created:', result);
      return result;
    },
    onSuccess: (newVideo: any) => {
      console.log('Success callback, new video:', newVideo);
      queryClient.invalidateQueries({ queryKey: ['customVideos'] });
      setCustomVideoUrl("");
      setTimeout(() => {
        setExpandedVideoId(`custom-${newVideo.id}`);
      }, 100);
      toast.success("Video added! 🎬");
    },
    onError: (error: any) => {
      console.error('Error creating video:', error);
      toast.error(`Failed: ${error.message || 'Unknown error'}`);
    }
  });

  const deleteWordMutation = useMutation({
    mutationFn: (id: any) => base44.entities.Word.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['wordRatings'] }),
  });

  const deleteVideoMutation = useMutation({
    mutationFn: async ({ videoId, deleteData }: any) => {
      console.log('Deleting video:', videoId, deleteData);
      // Soft delete the video
      const result = await base44.entities.Video.update(videoId, deleteData);
      console.log('Video updated:', result);

      // Find and disable any To-Do items pointing to this video
      const todos = await base44.entities.TodoItem.filter({ target_video_id: videoId.toString() });
      console.log('Found todos:', todos);
      for (const todo of todos) {
        await base44.entities.TodoItem.update(todo.id, { is_active: false });
      }

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customVideos'] });
      queryClient.invalidateQueries({ queryKey: ['todoItems'] });
      setExpandedVideoId(null);
      toast.success("Video deleted!");
    },
    onError: (error: any) => {
      console.error('Delete error:', error);
      toast.error(`Delete failed: ${error.message}`);
    }
  });

  const reorderVideosMutation = useMutation({
    mutationFn: async (videos: any[]) => {
      await Promise.all(
        videos.map((video, index) =>
          base44.entities.Video.update(video.id, { order: index })
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customVideos'] });
      toast.success("Order saved!");
    },
    onError: (e: any) => {
      console.error("Failed to reorder videos", e);
      toast.error(`Failed to save order: ${e.message || 'Unknown error'}`);
    }
  });

  const updateVideoMutation = useMutation({
    mutationFn: ({ id, data }: any) => base44.entities.Video.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customVideos'] });
      toast.success("Updated!");
    },
    onError: (e: any) => {
      console.error("Failed to update video", e);
      toast.error(`Failed to update video: ${e.message || 'Unknown error'}`);
    }
  });

  useEffect(() => {
    document.title = "Videos - Lashon Languages";
  }, []);

  const copyToMyVideosMutation = useMutation({
    mutationFn: async (video: any) => {
      const ytId = video.youtubeId;
      const youtubeUrl = `https://www.youtube.com/watch?v=${ytId}`;

      return await base44.entities.Video.create({
        video_url: youtubeUrl,
        title: video.title,
        youtube_video_id: ytId,
        language: userProfile?.language || 'hebrew',
        order: customVideos.length,
        level: userProfile?.current_day || 1,
        tags: video.category || '',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customVideos'] });
      toast.success("Added to My Videos! 🎬");
    },
    onError: (e: any) => {
      console.error("Failed to copy video to My Videos", e);
      toast.error(`Failed to add to My Videos: ${e.message || 'Unknown error'}`);
    }
  });

  // Check if single video mode (from day task)
  const singleVideoMode = searchParams.get('single') === 'true';
  const targetVideoId = searchParams.get('videoId');

  // Auto-expand video from URL parameter
  useEffect(() => {
    if (targetVideoId) {
      // Try to parse as number for hardcoded videos, keep as string for custom
      const parsedId: any = !isNaN(targetVideoId as any) && !targetVideoId.startsWith('custom-')
        ? parseInt(targetVideoId, 10)
        : targetVideoId;

      setExpandedVideoId(parsedId);

      // Auto-expand recommended section if this is a recommended video (ID is a number)
      if (!isNaN(targetVideoId as any)) {
        setRecommendedExpanded(true);
      }

      // Scroll to video after longer delay for mobile rendering
      setTimeout(() => {
        const videoElement = document.getElementById(`video-${parsedId}`);
        if (videoElement) {
          videoElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 1000);
    }
  }, [targetVideoId]);

  const removeFromBackpack = async (word: any) => {
    const existingWord = wordRatings.find((w: any) => w.word === word.hebrew || w.word === word);
    if (existingWord) {
      await deleteWordMutation.mutateAsync(existingWord.id);
      toast.success("Removed from backpack");
    }
  };

  const handleVideoDragEnd = (result: any) => {
    if (!result.destination) return;

    const sourceIndex = result.source.index;
    const destIndex = result.destination.index;

    if (sourceIndex === destIndex) return;

    const reordered = Array.from(customVideos);
    const [removed] = reordered.splice(sourceIndex, 1);
    reordered.splice(destIndex, 0, removed);

    reorderVideosMutation.mutate(reordered);
  };

  const addTranscriptWordToBackpack = async (line: any) => {
    const existingWord = wordRatings.find((w: any) => w.word === line.hebrew);
    if (existingWord) {
      toast.info("Already in backpack!");
      return;
    }
    await createWordMutation.mutateAsync({
      word: line.hebrew,
      translation: line.english,
      phonetic: line.transliteration,
      category: "wordbank",
      times_practiced: 1,
      mastered: false,
    });
    toast.success(`Added "${line.transliteration}" to backpack! 🎒`);
  };

  // Extract YouTube ID from URL
  const extractYouTubeId = (url: string) => {
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([^&?]+)/);
    return match ? match[1] : null;
  };

  const getWordRating = (hebrew: any) => {
    const found = wordRatings.find((w: any) => w.word === hebrew);
    return found?.times_practiced || 0;
  };

  const handleRate = async (word: any, rating: number) => {
    const existingWord = wordRatings.find((w: any) => w.word === word.hebrew);

    if (existingWord) {
      await updateWordMutation.mutateAsync({
        id: existingWord.id,
        data: {
          times_practiced: rating,
          mastered: rating >= 5,
        }
      });
    } else {
      await createWordMutation.mutateAsync({
        word: word.hebrew,
        translation: word.meaning,
        phonetic: word.transliteration,
        category: "wordbank",
        times_practiced: rating,
        mastered: rating >= 5,
      });
    }

    if (rating >= 5) {
      toast.success("Added to Fluent! ⭐");
    }
  };

  const finishVideo = () => {
    if (selectedVideo) {
      updateCoinsMutation.mutate({ coins: (userCoins?.coins || 0) + selectedVideo.coins });
      toast.success(`+${selectedVideo.coins} coins earned! 🪙`);
    }
    setSelectedVideo(null);
    setShowExercises(false);
    setCurrentExercise(0);
    setExerciseAnswers({});
    setExerciseResults(null);
  };

  const addToBackpack = async (item: any) => {
    const existingWord = wordRatings.find((w: any) => w.word === item.hebrew);
    if (existingWord) {
      toast.info("Already in backpack!");
      return;
    }
    await createWordMutation.mutateAsync({
      word: item.hebrew,
      translation: item.english || item.meaning,
      phonetic: item.transliteration,
      category: "wordbank",
      times_practiced: 1,
      mastered: false,
    });
    toast.success(`Added "${item.transliteration}" to backpack! 🎒`);
  };

  const checkExercise = (exerciseIdx: number, answer: any) => {
    const exercise = selectedVideo?.exercises?.[exerciseIdx];
    if (!exercise) return;

    let isCorrect = false;
    if (exercise.type === "multiple_choice") {
      isCorrect = answer === exercise.correct;
    } else if (exercise.type === "fill_blank") {
      isCorrect = answer.toLowerCase().trim() === exercise.answer.toLowerCase();
    } else if (exercise.type === "translate") {
      isCorrect = answer.toLowerCase().trim().includes(exercise.answer.toLowerCase().substring(0, 10));
    }

    setExerciseAnswers((prev: any) => ({ ...prev, [exerciseIdx]: { answer, isCorrect } }));
  };

  const finishExercises = () => {
    const correct = Object.values(exerciseAnswers).filter((a: any) => a.isCorrect).length;
    const total = selectedVideo?.exercises?.length || 0;
    setExerciseResults({ correct, total });
    if (correct === total) {
      updateCoinsMutation.mutate({ coins: (userCoins?.coins || 0) + 25 });
      toast.success("Perfect score! +25 bonus coins! 🎉");
    } else if (correct > 0) {
      updateCoinsMutation.mutate({ coins: (userCoins?.coins || 0) + (correct * 5) });
      toast.success(`+${correct * 5} coins for ${correct}/${total} correct!`);
    }
  };

  const fluentWords = wordRatings.filter((w: any) => w.times_practiced >= 5);
  const learningWords = wordRatings.filter((w: any) => w.times_practiced > 0 && w.times_practiced < 5);

  const generateFullTranscript = async (video: any) => {
    if (fullTranscripts[video.id]) return;

    setLoadingTranscript(video.id);
    try {
      const data = await transcribeMediaSource(youtubeSource(video.youtubeId), {
        language: video.language || userProfile?.language || 'hebrew',
      });
      const rawTranscript = data?.transcript;

      if (!rawTranscript || rawTranscript.length === 0) {
        toast.error(data?.error || "No captions available for this video");
        // Set empty array so we show the "no transcript" message instead of re-loading
        setFullTranscripts((prev: any) => ({ ...prev, [video.id]: [] }));
        setLoadingTranscript(null);
        return;
      }

      // Store raw segments with timestamps directly
      setFullTranscripts((prev: any) => ({ ...prev, [video.id]: rawTranscript }));
    } catch (e) {
      toast.error("Failed to fetch transcript");
    }
    setLoadingTranscript(null);
  };

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(160deg, #f0ece4 0%, #e8e4d8 50%, #eae6da 100%)' }}>
      <div className="max-w-4xl mx-auto px-4 py-6">
        {managingUserEmail && currentUser?.role === 'admin' && (
          <p className="text-amber-400 text-sm font-medium mb-4">
            👤 Managing videos for: {managingUserEmail}
          </p>
        )}

        {/* Tab Switcher */}
        {!selectedVideo && (
          <div className="flex gap-2 mb-6 p-1 rounded-xl" style={{ background: '#ffffff18', border: '1px solid #ffffff20' }}>
            <button
              onClick={() => setActiveTab("videos")}
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all"
              style={activeTab === "videos" ? { background: '#5a6b5a', color: '#f5f0e8' } : { color: '#6b7c5a' }}
            >
              📺 Videos
            </button>
            <button
              onClick={() => setActiveTab("songs")}
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all"
              style={activeTab === "songs" ? { background: '#5a6b5a', color: '#f5f0e8' } : { color: '#6b7c5a' }}
            >
              🎵 Songs
            </button>
            <button
              onClick={() => setActiveTab("grammar")}
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all"
              style={activeTab === "grammar" ? { background: '#5a6b5a', color: '#f5f0e8' } : { color: '#6b7c5a' }}
            >
              📖 Grammar
            </button>
            <button
              onClick={() => setActiveTab("corevocab")}
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all"
              style={activeTab === "corevocab" ? { background: '#5a6b5a', color: '#f5f0e8' } : { color: '#6b7c5a' }}
            >
              📚 Core Vocab
            </button>
          </div>
        )}

        {/* Video Player */}
        {selectedVideo ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 overflow-hidden"
          >
            <div className="aspect-video bg-black">
              <iframe
                width="100%"
                height="100%"
                src={`https://www.youtube.com/embed/${selectedVideo.youtubeId}?autoplay=1`}
                title={selectedVideo.title}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>

            <div className="p-6">
              {!showExercises ? (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-white font-bold text-lg">📝 Vocabulary - Tap + to add to backpack</h3>
                    <p className="text-white/60 text-sm">5 = Fluent ⭐</p>
                  </div>

                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {selectedVideo.transcript.map((item: any, idx: number) => {
                        // Get edited version if it exists
                        const editedItem = videoEdits[`${selectedVideo.id}-${idx}`] || item;
                        const currentRating = getWordRating(editedItem.hebrew);
                        const inBackpack = wordRatings.find((w: any) => w.word === editedItem.hebrew);

                        const updateTranscriptLine = (field: string, newValue: any) => {
                          setVideoEdits((prev: any) => ({
                            ...prev,
                            [`${selectedVideo.id}-${idx}`]: {
                              ...editedItem,
                              [field]: newValue
                            }
                          }));
                          toast.success("Updated!");
                        };

                      return (
                        <motion.div
                          key={idx}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          className={`border rounded-xl p-4 ${
                            currentRating >= 5
                              ? "bg-green-500/10 border-green-500/30"
                              : "bg-white/5 border-white/10"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <span className="text-white/40 text-xs w-12">{item.time}</span>
                              <div>
                                <EditableWord
                                  text={editedItem.transliteration}
                                  onSave={(newValue: any) => updateTranscriptLine('transliteration', newValue)}
                                  className="text-white/90 text-lg leading-tight block"
                                  editable={true}
                                />
                                <EditableWord
                                  text={editedItem.english}
                                  onSave={(newValue: any) => updateTranscriptLine('english', newValue)}
                                  className="text-white/70 text-base leading-tight block"
                                  editable={true}
                                />
                                <div className="flex items-center gap-2">
                                  <EditableWord
                                    text={editedItem.hebrew}
                                    onSave={(newValue: any) => updateTranscriptLine('hebrew', newValue)}
                                    className="text-cyan-400 text-2xl font-bold leading-tight"
                                    editable={true}
                                  />
                                  {currentRating >= 5 && <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {!inBackpack && (
                                <button
                                  onClick={() => addToBackpack(editedItem)}
                                  className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 flex items-center justify-center transition-all"
                                  title="Add to backpack"
                                >
                                  <Plus className="w-4 h-4" />
                                </button>
                              )}
                              <div className="flex gap-1">
                                {[1, 2, 3, 4, 5].map(num => (
                                  <button
                                    key={num}
                                    onClick={() => handleRate(editedItem, num)}
                                    className={`w-8 h-8 rounded-lg text-sm font-bold transition-all hover:scale-110 ${
                                      currentRating >= num
                                        ? num === 5
                                          ? "bg-green-500 text-white"
                                          : "bg-cyan-500 text-white"
                                        : "bg-white/10 text-white/50 hover:bg-white/20"
                                    }`}
                                  >
                                    {num}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>

                  <div className="flex gap-3 mt-6">
                    {selectedVideo.exercises && selectedVideo.exercises.length > 0 && (
                      <Button
                        onClick={() => setShowExercises(true)}
                        className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold py-6 text-lg"
                      >
                        <BookOpen className="w-5 h-5 mr-2" />
                        Take Quiz ({selectedVideo.exercises.length} questions)
                      </Button>
                    )}
                    <Button
                      onClick={finishVideo}
                      className="flex-1 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-bold py-6 text-lg"
                    >
                      Done (+{selectedVideo.coins} coins) ✓
                    </Button>
                  </div>
                </>
              ) : (
                <div>
                  {!exerciseResults ? (
                    <>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-white font-bold text-lg">📝 Exercise {currentExercise + 1}/{selectedVideo.exercises.length}</h3>
                        <button onClick={() => setShowExercises(false)} className="text-white/60 hover:text-white">
                          ✕
                        </button>
                      </div>

                      {(() => {
                        const exercise = selectedVideo.exercises[currentExercise];
                        const answered = exerciseAnswers[currentExercise];

                        return (
                          <motion.div
                            key={currentExercise}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="space-y-4"
                          >
                            <p className="text-white text-lg">{exercise.question}</p>

                            {exercise.type === "multiple_choice" && (
                              <div className="grid gap-2">
                                {exercise.options.map((option: any, optIdx: number) => (
                                  <button
                                    key={optIdx}
                                    onClick={() => !answered && checkExercise(currentExercise, optIdx)}
                                    disabled={!!answered}
                                    className={`w-full text-left p-4 rounded-xl border transition-all ${
                                      answered
                                        ? optIdx === exercise.correct
                                          ? "bg-green-500/20 border-green-500 text-green-400"
                                          : answered.answer === optIdx
                                            ? "bg-red-500/20 border-red-500 text-red-400"
                                            : "bg-white/5 border-white/10 text-white/40"
                                        : "bg-white/5 border-white/20 text-white hover:bg-white/10 hover:border-cyan-400/50"
                                    }`}
                                  >
                                    {option}
                                  </button>
                                ))}
                              </div>
                            )}

                            {exercise.type === "fill_blank" && (
                              <div className="space-y-3">
                                <p className="text-cyan-400" dir="rtl">{exercise.hebrew}</p>
                                <div className="flex gap-2">
                                  <Input
                                    value={fillBlankAnswer}
                                    onChange={(e) => setFillBlankAnswer(e.target.value)}
                                    placeholder="Your answer..."
                                    disabled={!!answered}
                                    className="bg-white/5 border-white/20 text-white"
                                  />
                                  {!answered && (
                                    <Button onClick={() => checkExercise(currentExercise, fillBlankAnswer)}>
                                      Check
                                    </Button>
                                  )}
                                </div>
                                {answered && (
                                  <p className={answered.isCorrect ? "text-green-400" : "text-red-400"}>
                                    {answered.isCorrect ? "Correct! ✓" : `Answer: ${exercise.answer}`}
                                  </p>
                                )}
                              </div>
                            )}

                            {exercise.type === "translate" && (
                              <div className="space-y-3">
                                <div className="flex gap-2">
                                  <Input
                                    value={translateAnswer}
                                    onChange={(e) => setTranslateAnswer(e.target.value)}
                                    placeholder="Type translation..."
                                    disabled={!!answered}
                                    className="bg-white/5 border-white/20 text-white"
                                  />
                                  {!answered && (
                                    <Button onClick={() => checkExercise(currentExercise, translateAnswer)}>
                                      Check
                                    </Button>
                                  )}
                                </div>
                                {answered && (
                                  <p className={answered.isCorrect ? "text-green-400" : "text-yellow-400"}>
                                    {answered.isCorrect ? "Correct! ✓" : `Expected: ${exercise.answer}`}
                                  </p>
                                )}
                              </div>
                            )}

                            <div className="flex gap-3 mt-6">
                              {currentExercise > 0 && (
                                <Button variant="outline" onClick={() => setCurrentExercise(prev => prev - 1)} className="border-white/20 text-white">
                                  ← Back
                                </Button>
                              )}
                              <div className="flex-1" />
                              {currentExercise < selectedVideo.exercises.length - 1 ? (
                                <Button onClick={() => { setCurrentExercise(prev => prev + 1); setFillBlankAnswer(""); setTranslateAnswer(""); }}>
                                  Next <ChevronRight className="w-4 h-4 ml-1" />
                                </Button>
                              ) : (
                                <Button onClick={finishExercises} className="bg-gradient-to-r from-green-500 to-emerald-500">
                                  Finish Quiz
                                </Button>
                              )}
                            </div>
                          </motion.div>
                        );
                      })()}
                    </>
                  ) : (
                    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-8">
                      <div className="text-6xl mb-4">{exerciseResults.correct === exerciseResults.total ? "🎉" : "👍"}</div>
                      <h3 className="text-2xl font-bold text-white mb-2">
                        {exerciseResults.correct}/{exerciseResults.total} Correct!
                      </h3>
                      <p className="text-white/60 mb-6">
                        {exerciseResults.correct === exerciseResults.total
                          ? "Perfect score! You earned 25 bonus coins!"
                          : `You earned ${exerciseResults.correct * 5} coins`}
                      </p>
                      <Button onClick={finishVideo} className="bg-gradient-to-r from-green-500 to-emerald-500">
                        Continue
                      </Button>
                    </motion.div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        ) : activeTab === "corevocab" ? (
          /* ===== CORE VOCAB TAB ===== */
          <CoreVocabTab onAddToBackpack={(word: any) => {
            const existing = wordRatings.find((w: any) => w.word === word.hebrew);
            if (existing) {
              toast.info("Already in backpack!");
              return;
            }
            createWordMutation.mutate({
              word: word.hebrew,
              translation: word.english,
              phonetic: word.transliteration,
              category: "wordbank",
              times_practiced: 1,
              mastered: false,
            });
            toast.success(`Added "${word.transliteration}" to backpack! 🎒`);
          }} />
        ) : activeTab === "grammar" ? (
          /* ===== GRAMMAR TAB ===== */
          <GrammarTab />
        ) : activeTab === "songs" ? (
          /* ===== SONGS TAB ===== */
          <div className="space-y-4">
            {currentUser?.role === 'admin' && (
              <div className="flex justify-end">
                <Button onClick={() => setAddingSong(!addingSong)} className="bg-green-500 hover:bg-green-600">
                  <Plus className="w-4 h-4 mr-2" /> Add Song
                </Button>
              </div>
            )}
            {addingSong && (
              <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-stone-200 p-6">
                <h3 className="font-bold mb-4" style={{ color: '#3a4a3a' }}>Add New Song</h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-stone-500 text-sm mb-2 block">YouTube URL</label>
                    <div className="flex gap-2">
                      <input value={newSongUrl} onChange={(e) => setNewSongUrl(e.target.value)} placeholder="Paste YouTube URL..." className="flex-1 px-3 py-2 rounded-lg bg-white border border-stone-200 text-stone-800 outline-none focus:border-stone-400" />
                      <Button onClick={handleAddSong} disabled={!newSongUrl.trim()}>Add Video</Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex-1 h-px bg-stone-200" />
                    <span className="text-stone-400 text-sm">OR</span>
                    <div className="flex-1 h-px bg-stone-200" />
                  </div>
                  <div>
                    <label className="text-stone-500 text-sm mb-2 block">Upload Audio File</label>
                    <label className="block">
                      <input type="file" accept="audio/*" onChange={handleAudioUpload} className="hidden" />
                      <Button variant="outline" className="w-full cursor-pointer" disabled={uploadingAudio}>
                        <Upload className="w-4 h-4 mr-2" />{uploadingAudio ? "Uploading..." : "Choose Audio File"}
                      </Button>
                    </label>
                  </div>
                  <Button onClick={() => setAddingSong(false)} variant="outline" className="w-full">Cancel</Button>
                </div>
              </div>
            )}
            {songs.length === 0 ? (
              <div className="text-center py-12">
                <Music className="w-16 h-16 text-stone-300 mx-auto mb-4" />
                <p style={{ color: '#6b7c5a' }}>No songs yet! Come back soon.</p>
              </div>
            ) : (
              <DragDropContext onDragEnd={handleSongsDragEnd}>
                <Droppable droppableId="songs">
                  {(provided) => (
                    <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-4">
                      {songs.map((song: any, index: number) => {
                        const isExpanded = expandedSongId === song.id;
                        const progress = songProgress.find((p: any) => p.song_id === song.id);
                        const isCompleted = progress?.completed || false;
                        const ytId = extractYouTubeId(song.youtube_url);
                        const hasVideo = !!song.youtube_url;
                        const hasAudio = !!song.audio_url;
                        return (
                          <Draggable key={song.id} draggableId={song.id} index={index} isDragDisabled={currentUser?.role !== 'admin'}>
                            {(provided, snapshot) => (
                              <div ref={provided.innerRef} {...provided.draggableProps} className={`bg-white/70 backdrop-blur-xl rounded-2xl border border-stone-200 overflow-hidden ${snapshot.isDragging ? 'shadow-2xl scale-105' : ''}`}>
                                <div className="flex gap-4 p-4">
                                  {currentUser?.role === 'admin' && (
                                    <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing flex items-center">
                                      <GripVertical className="w-5 h-5 text-stone-400" />
                                    </div>
                                  )}
                                  <div onClick={() => setExpandedSongId(isExpanded ? null : song.id)} className="flex-1 flex gap-4 cursor-pointer hover:opacity-80 transition-all rounded-lg">
                                    <div className="relative w-32 h-20 flex-shrink-0 rounded-xl overflow-hidden bg-black">
                                      {ytId ? (
                                        <img src={`https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`} alt={song.title} className="w-full h-full object-cover" onError={(e: any) => { e.target.src = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`; }} />
                                      ) : (
                                        <div className="w-full h-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center">
                                          <Music className="w-10 h-10 text-white" />
                                        </div>
                                      )}
                                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                                        <Music className="w-8 h-8 text-white" />
                                      </div>
                                    </div>
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2">
                                        {isCompleted && <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center"><Check className="w-3 h-3 text-white" /></div>}
                                        <h3 className="font-bold" style={{ color: '#3a4a3a' }}>{song.title}</h3>
                                      </div>
                                      <p className="text-stone-500 text-sm mt-1">Level {song.level} • {hasVideo ? '📺 Video' : '🎵 Audio'} • {song.transcript?.length || 0} words</p>
                                      {isCompleted && <span className="inline-block mt-1 px-2 py-0.5 bg-green-500/20 text-green-600 text-xs rounded-full">✓ Completed</span>}
                                    </div>
                                    <ChevronRight className={`w-5 h-5 text-stone-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                  </div>
                                  {currentUser?.role === 'admin' && (
                                    <button onClick={(e) => { e.stopPropagation(); deleteSongMutation.mutate(song.id); }} className="w-8 h-8 rounded bg-red-500/20 hover:bg-red-500/30 flex items-center justify-center">
                                      <Trash2 className="w-4 h-4 text-red-400" />
                                    </button>
                                  )}
                                </div>
                                {isExpanded && (
                                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="p-4 bg-stone-50/80 border-t border-stone-200 space-y-4">
                                    {hasVideo && ytId && (
                                      <div className="aspect-video bg-black rounded-xl overflow-hidden">
                                        <iframe id={`youtube-player-${song.id}`} width="100%" height="100%" src={`https://www.youtube.com/embed/${ytId}?enablejsapi=1`} title={song.title} frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                                      </div>
                                    )}
                                    {hasAudio && !hasVideo && (
                                      <div className="bg-white/60 rounded-xl p-4">
                                        <audio id={`audio-player-${song.id}`} controls className="w-full">
                                          <source src={song.audio_url} type="audio/mpeg" />
                                        </audio>
                                      </div>
                                    )}
                                    {song.transcript && song.transcript.length > 0 && song.transcript[0].start_ms !== undefined ? (
                                      <KaraokeTranscript
                                        lines={song.transcript.map((line: any, idx: number) => ({ id: `line_${idx}`, start_ms: line.start_ms || idx * 5000, end_ms: line.end_ms || (idx + 1) * 5000, transliteration: line.transliteration, english: line.english, hebrew: line.hebrew }))}
                                        audioRef={hasAudio && !hasVideo ? { current: document.getElementById(`audio-player-${song.id}`) } : null}
                                        videoRef={hasVideo ? { current: document.getElementById(`youtube-player-${song.id}`) } : null}
                                        onLineUpdate={(lineIndex: number, updatedLine: any) => {
                                          const newTranscript = [...song.transcript];
                                          newTranscript[lineIndex] = { ...song.transcript[lineIndex], ...updatedLine };
                                          updateSongMutation.mutate({ id: song.id, data: { transcript: newTranscript } });
                                        }}
                                        onAddToBackpack={(hebrew: any, transliteration: any, english: any) => addWordToBackpack({ hebrew, transliteration, english }, song.id, song.title)}
                                      />
                                    ) : (
                                      <VideoTranscript
                                        videoId={song.id}
                                        videoUrl={song.youtube_url || song.audio_url}
                                        onPauseVideo={() => { const iframe: any = document.getElementById(`youtube-player-${song.id}`); if (iframe?.contentWindow) iframe.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*'); }}
                                        onSeekVideo={(seconds: number) => { const iframe: any = document.getElementById(`youtube-player-${song.id}`); if (iframe?.contentWindow) { iframe.contentWindow.postMessage(`{"event":"command","func":"seekTo","args":[${seconds}, true]}`, '*'); iframe.contentWindow.postMessage('{"event":"command","func":"playVideo","args":""}', '*'); } }}
                                      />
                                    )}
                                  </motion.div>
                                )}
                              </div>
                            )}
                          </Draggable>
                        );
                      })}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            )}
          </div>
        ) : (
                <div className="space-y-4">
                  {/* Add Custom Video Section - hide in single video mode */}
                  {!singleVideoMode && (
                    <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/20 p-6">
                      <p className="mb-3 text-center" style={{ color: '#6b7c5a' }}>🎬 Add a YouTube video</p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={customVideoUrl}
                          onChange={(e) => setCustomVideoUrl(e.target.value)}
                          placeholder="Paste YouTube URL here..."
                          className="flex-1 px-4 py-3 rounded-lg bg-slate-800 border border-white/30 text-white placeholder:text-white/50 outline-none focus:border-cyan-400"
                        />
                        <button
                          onClick={() => {
                            const ytId = extractYouTubeId(customVideoUrl);
                            console.log('YouTube ID extracted:', ytId);
                            console.log('Full URL:', customVideoUrl);

                            if (!ytId) {
                              toast.error("Invalid YouTube URL - paste a link like: youtube.com/watch?v=...");
                              return;
                            }

                            createVideoMutation.mutate({
                              video_url: customVideoUrl,
                              title: `YouTube Video ${Date.now()}`,
                              youtube_video_id: ytId,
                              language: userProfile?.language || 'hebrew',
                              order: customVideos.length,
                              level: userProfile?.current_day || 1
                            });
                          }}
                          disabled={!customVideoUrl.trim() || createVideoMutation.isPending}
                          className="px-5 py-3 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {createVideoMutation.isPending ? 'Adding...' : 'Add'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Custom Videos - 3-per-row grid */}
                  {customVideos.length > 0 && !singleVideoMode && (
                    <div className="mb-6">
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-bold" style={{ color: '#3d4a2e', fontFamily: 'Cormorant Garamond, Georgia, serif' }}>Your Videos</h2>
                        <div className="flex gap-2 p-1 rounded-lg" style={{ background: '#ffffff18', border: '1px solid #ffffff20' }}>
                          <button onClick={() => setVideoTypeFilter('all')} className={`px-3 py-1.5 rounded text-sm font-semibold transition-all ${videoTypeFilter === 'all' ? 'bg-white/20' : 'text-white/60 hover:text-white/80'}`} style={{ color: videoTypeFilter === 'all' ? '#3d4a2e' : undefined }}>All</button>
                          <button onClick={() => setVideoTypeFilter('video')} className={`px-3 py-1.5 rounded text-sm font-semibold transition-all ${videoTypeFilter === 'video' ? 'bg-white/20' : 'text-white/60 hover:text-white/80'}`} style={{ color: videoTypeFilter === 'video' ? '#3d4a2e' : undefined }}>📹 Videos</button>
                          <button onClick={() => setVideoTypeFilter('audio')} className={`px-3 py-1.5 rounded text-sm font-semibold transition-all ${videoTypeFilter === 'audio' ? 'bg-white/20' : 'text-white/60 hover:text-white/80'}`} style={{ color: videoTypeFilter === 'audio' ? '#3d4a2e' : undefined }}>🎧 Audio Training</button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {customVideos.map((video: any) => {
                          const ytId = extractYouTubeId(video.video_url);
                          if (!ytId) return null;

                          // Determine media type
                          let mediaType = 'video';
                          if (video.video_url?.includes('.mp3') || video.video_url?.includes('audio')) {
                            mediaType = 'audio';
                          } else if (video.video_url?.includes('.wav') || video.video_url?.includes('.ogg')) {
                            mediaType = 'audio';
                          }

                          // Filter by selected type
                          if (videoTypeFilter !== 'all' && mediaType !== videoTypeFilter) return null;
                          if (videoTypeFilter === 'song') return null; // Songs are in different section

                          const isExpanded = expandedVideoId === `custom-${video.id}` || expandedVideoId == video.id;

                          return (
                            <motion.div
                              key={video.id}
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              onClick={() => setExpandedVideoId(isExpanded ? null : `custom-${video.id}`)}
                              className="bg-white/5 backdrop-blur-xl rounded-2xl border border-blue-500/30 overflow-hidden hover:border-blue-400/60 transition-all cursor-pointer"
                            >
                              {/* Thumbnail */}
                              <div className="w-full aspect-video bg-black relative">
                                <img
                                  src={`https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`}
                                  alt={video.title}
                                  className="w-full h-full object-cover"
                                  onError={(e: any) => { e.target.src = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`; }}
                                />
                                <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                                  <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                                    <Play className="w-6 h-6 text-white fill-white" />
                                  </div>
                                </div>
                              </div>

                              {/* Info */}
                              <div className="p-3">
                                <div className="flex items-start justify-between gap-2 mb-1">
                                  <h3 className="text-white font-bold text-sm flex-1 leading-tight">
                                    <EditableWord
                                      text={video.title}
                                      onSave={(newTitle: any) => updateVideoMutation.mutate({ id: video.id, data: { title: newTitle } })}
                                      className="text-white font-bold"
                                    />
                                  </h3>
                                  <div className="flex gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                    {(currentUser?.role === 'admin' || coachAssignments.length > 0) && (
                                      <>
                                        <VideoAdminControls
                                          video={video}
                                          onUpdate={(data: any) => updateVideoMutation.mutate({ id: video.id, data })}
                                        />
                                        <button
                                          onClick={async (e) => {
                                            e.stopPropagation();
                                            if (window.confirm('Delete this video?')) {
                                              await deleteVideoMutation.mutateAsync({
                                                videoId: video.id,
                                                deleteData: { deleted_at: new Date().toISOString(), is_active: false }
                                              });
                                            }
                                          }}
                                          className="text-white/60 hover:text-red-400 transition-colors p-1"
                                          title="Delete video"
                                        >
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>
                                <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded">My Video</span>
                              </div>

                              {/* Expanded inline player */}
                              <AnimatePresence>
                                {isExpanded && (
                                  <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="border-t border-white/10 bg-black/40 p-3 space-y-3"
                                  >
                                    <div className="aspect-video bg-black rounded-xl overflow-hidden">
                                      <iframe
                                        id={`youtube-player-${video.id}`}
                                        width="100%"
                                        height="100%"
                                        src={`https://www.youtube.com/embed/${ytId}?enablejsapi=1`}
                                        title={video.title}
                                        frameBorder="0"
                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                        allowFullScreen
                                      />
                                    </div>
                                    <VideoTranscript
                                      videoId={video.id}
                                      videoUrl={video.video_url}
                                      iframeId={`youtube-player-${video.id}`}
                                      onPauseVideo={() => {
                                        const iframe: any = document.getElementById(`youtube-player-${video.id}`);
                                        if (iframe?.contentWindow) iframe.contentWindow.postMessage('{"event":"command","func":"pauseVideo","args":""}', '*');
                                      }}
                                      onSeekVideo={(seconds: number) => {
                                        const iframe: any = document.getElementById(`youtube-player-${video.id}`);
                                        if (iframe?.contentWindow) {
                                          iframe.contentWindow.postMessage(`{"event":"command","func":"seekTo","args":[${seconds}, true]}`, '*');
                                          iframe.contentWindow.postMessage('{"event":"command","func":"playVideo","args":""}', '*');
                                        }
                                      }}
                                    />
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>
                  )}

            {/* Recommended Videos Dropdown - Only show for Hebrew and not in single video mode */}
            {userProfile?.language === 'hebrew' && !singleVideoMode && (
              <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-white/10">
                  <h2 className="font-medium" style={{ color: '#3d4a2e', fontFamily: 'Cormorant Garamond, Georgia, serif' }}>Recommended Videos ({level1Videos.length})</h2>
                  <button
                    onClick={() => setRecommendedExpanded(!recommendedExpanded)}
                    className="text-white/60 hover:text-white transition-all"
                  >
                    <ChevronDown className={`w-5 h-5 transition-transform ${recommendedExpanded ? 'rotate-180' : ''}`} />
                  </button>
                </div>

                {recommendedExpanded && (
                  <div className="p-4 space-y-4">
                    <div className="flex gap-2 p-1 rounded-lg" style={{ background: '#ffffff18', border: '1px solid #ffffff20' }}>
                      <button onClick={() => setVideoTypeFilter('all')} className={`px-3 py-1.5 rounded text-sm font-semibold transition-all ${videoTypeFilter === 'all' ? 'bg-white/20' : 'text-white/60 hover:text-white/80'}`} style={{ color: videoTypeFilter === 'all' ? '#3d4a2e' : undefined }}>All</button>
                      <button onClick={() => setVideoTypeFilter('video')} className={`px-3 py-1.5 rounded text-sm font-semibold transition-all ${videoTypeFilter === 'video' ? 'bg-white/20' : 'text-white/60 hover:text-white/80'}`} style={{ color: videoTypeFilter === 'video' ? '#3d4a2e' : undefined }}>📹 Videos</button>
                      <button onClick={() => setVideoTypeFilter('audio')} className={`px-3 py-1.5 rounded text-sm font-semibold transition-all ${videoTypeFilter === 'audio' ? 'bg-white/20' : 'text-white/60 hover:text-white/80'}`} style={{ color: videoTypeFilter === 'audio' ? '#3d4a2e' : undefined }}>🎧 Audio Training</button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {level1Videos.map((video) => {
                        const isExpanded = expandedVideoId == video.id || expandedVideoId === video.id;
                        const hasTranscript = video.id in fullTranscripts;
                        const isLoading = loadingTranscript === video.id;
                        const showingVocab = showVocabForVideo === video.id;

                        return (
                          <motion.div
                            key={video.id}
                            id={`video-${video.id}`}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden hover:border-white/30 transition-all"
                          >
                            {/* Thumbnail */}
                            <div
                              className="w-full aspect-video bg-black relative cursor-pointer"
                              onClick={() => {
                                const newExpanded = expandedVideoId === video.id ? null : video.id;
                                setExpandedVideoId(newExpanded);
                                if (newExpanded !== video.id) setShowVocabForVideo(null);
                                if (newExpanded && !fullTranscripts[video.id] && loadingTranscript !== video.id) {
                                  generateFullTranscript(video);
                                }
                              }}
                            >
                              <img
                                src={video.thumbnail}
                                alt={video.title}
                                className="w-full h-full object-cover"
                                onError={(e: any) => { e.target.src = `https://via.placeholder.com/320x180/1e1b4b/ffffff?text=Video`; }}
                              />
                              <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                                <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                                  <Play className="w-6 h-6 text-white fill-white" />
                                </div>
                              </div>
                              <span className="absolute bottom-1 right-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">{video.duration}</span>
                            </div>

                            {/* Info */}
                            <div className="p-3">
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <h3 className="text-white font-bold text-sm flex-1 leading-tight">{video.title}</h3>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded">{video.category}</span>
                                <span className="text-xs text-white/50">{video.transcript.length} words</span>
                                <span className="text-xs text-yellow-400 font-bold">+{video.coins} 🪙</span>
                              </div>

                              {/* Action Buttons */}
                              <div className="flex gap-2 mt-3">
                                <button
                                  onClick={() => copyToMyVideosMutation.mutate(video)}
                                  disabled={copyToMyVideosMutation.isPending}
                                  className="flex-1 flex items-center justify-center gap-1 bg-cyan-500/20 border border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/30 py-1.5 rounded-lg text-xs font-bold transition-all"
                                >
                                  <Plus className="w-3 h-3" />
                                  Add
                                </button>
                                <button
                                  onClick={() => setShowVocabForVideo(showingVocab ? null : video.id)}
                                  className="flex-1 flex items-center justify-center gap-1 bg-amber-500/20 border border-amber-500/50 text-amber-400 hover:bg-amber-500/30 py-1.5 rounded-lg text-xs font-bold transition-all"
                                >
                                  <BookOpen className="w-3 h-3" />
                                  Vocab
                                </button>
                              </div>
                            </div>

                            {/* Expanded content */}
                            <AnimatePresence>
                              {isExpanded && (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: "auto" }}
                                  exit={{ opacity: 0, height: 0 }}
                                  className="border-t border-white/10 bg-black/40 p-3 space-y-3"
                                >
                                  <div className="aspect-video bg-black rounded-xl overflow-hidden">
                                    <iframe
                                      width="100%"
                                      height="100%"
                                      src={`https://www.youtube.com/embed/${video.youtubeId}`}
                                      title={video.title}
                                      frameBorder="0"
                                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                      allowFullScreen
                                    />
                                  </div>

                                  {isLoading && (
                                    <div className="flex items-center justify-center gap-2 py-3 text-white/60">
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                      <span className="text-sm">Generating transcript...</span>
                                    </div>
                                  )}

                                  {hasTranscript && fullTranscripts[video.id].length === 0 && (
                                    <div className="bg-white/5 rounded-xl p-3 text-center">
                                      <p className="text-white/50 text-xs">No captions available for this video</p>
                                    </div>
                                  )}

                                  {hasTranscript && fullTranscripts[video.id].length > 0 && (
                                    <div className="space-y-1 max-h-64 overflow-y-auto bg-white/5 rounded-xl p-2">
                                      <p className="text-white/50 text-xs font-medium mb-1">📝 Transcript</p>
                                      {fullTranscripts[video.id].map((line: any, idx: number) => {
                                        const mins = Math.floor((line.start || 0) / 60);
                                        const secs = Math.floor((line.start || 0) % 60).toString().padStart(2, '0');
                                        const timestamp = `${mins}:${secs}`;
                                        return (
                                          <div
                                            key={idx}
                                            className="flex gap-2 items-start rounded-lg p-1.5 bg-white/5 border border-transparent text-xs"
                                          >
                                            <span className="text-amber-400/70 font-mono flex-shrink-0 mt-0.5">{timestamp}</span>
                                            <p className="text-white/80" dir="rtl">{line.text}</p>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </motion.div>
                              )}
                            </AnimatePresence>

                            {/* Vocab words */}
                            <AnimatePresence>
                              {showingVocab && (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: "auto" }}
                                  exit={{ opacity: 0, height: 0 }}
                                  className="border-t border-white/10 bg-black/40 p-3 space-y-1 max-h-56 overflow-y-auto"
                                >
                                  {video.transcript.map((item: any, idx: number) => {
                                    const inBackpack = wordRatings.find((w: any) => w.word === item.hebrew);
                                    return (
                                      <div key={idx} className={`flex items-center justify-between p-2 rounded-lg text-xs ${inBackpack ? "bg-green-500/10 border border-green-500/30" : "bg-white/5 border border-white/10"}`}>
                                        <div>
                                          <span className="text-cyan-400 font-bold text-base" dir="rtl">{item.hebrew}</span>
                                          <p className="text-white/60">{item.transliteration} — {item.meaning}</p>
                                        </div>
                                        <button
                                          onClick={() => addToBackpack(item)}
                                          disabled={!!inBackpack}
                                          className={`px-2 py-1 rounded-lg text-xs transition-all ${inBackpack ? "bg-green-500/20 text-green-400 cursor-not-allowed" : "bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30"}`}
                                        >
                                          {inBackpack ? "✓" : "+ Add"}
                                        </button>
                                      </div>
                                    );
                                  })}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                )}
                </div>
                )}
                         </div>
                         )}

                         {/* Backpack Dialog */}
      <Dialog open={backpackOpen} onOpenChange={setBackpackOpen}>
        <DialogContent className="bg-slate-900 border-white/20 text-white max-w-md max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Backpack className="w-6 h-6 text-amber-400" />
              My Backpack
            </DialogTitle>
          </DialogHeader>

          {/* Tabs */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setShowFluent(true)}
              className={`flex-1 py-2 rounded-lg font-medium transition-all ${
                showFluent ? "bg-green-500/20 text-green-400 border border-green-500/50" : "bg-white/5 text-white/60"
              }`}
            >
              ⭐ Fluent ({fluentWords.length})
            </button>
            <button
              onClick={() => setShowFluent(false)}
              className={`flex-1 py-2 rounded-lg font-medium transition-all ${
                !showFluent ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/50" : "bg-white/5 text-white/60"
              }`}
            >
              📚 Learning ({learningWords.length})
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2">
            {(showFluent ? fluentWords : learningWords).length === 0 ? (
              <div className="text-center py-8">
                <p className="text-white/60">
                  {showFluent ? "No fluent words yet!" : "No words in progress!"}
                </p>
                <p className="text-white/40 text-sm mt-2">
                  {showFluent ? "Rate words 5/5 to add them here." : "Start rating words to track progress."}
                </p>
              </div>
            ) : (
              (showFluent ? fluentWords : learningWords).map((word: any) => (
                <div
                  key={word.id}
                  className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-cyan-400 font-bold text-lg" dir="rtl">{word.word}</span>
                      {word.times_practiced >= 5 && <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />}
                    </div>
                    <p className="text-white/60 text-sm">{word.phonetic} - {word.translation}</p>
                  </div>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map(num => (
                      <div
                        key={num}
                        className={`w-4 h-4 rounded-full ${
                          word.times_practiced >= num ? "bg-cyan-500" : "bg-white/20"
                        }`}
                      />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

        {/* Translator Widget */}
        <TranslatorWidget />
      </div>
    </div>
  );
}
