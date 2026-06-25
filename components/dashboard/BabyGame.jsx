"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Droplets, Cookie, Moon, Bath, Gamepad2, Heart, Tv, Volume2, Sparkles, Check, X, Backpack, Star, Loader2, Plus, CheckCircle, Wand2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { base44 as base44Client } from "@/api/base44Client";
const base44 = base44Client;
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import ClickableWord from "@/components/learning/ClickableWord";
import EditableWord from "@/components/learning/EditableWord";
import { createPageUrl } from "@/lib/router-compat";

// 100 basic Hebrew words organized by category (needs)
const wordBank = [
  // Water/Drinks (20)
  { hebrew: "מים", transliteration: "Mayim", meaning: "Water", category: "drinks", icon: "💧" },
  { hebrew: "חלב", transliteration: "Chalav", meaning: "Milk", category: "drinks", icon: "🥛" },
  { hebrew: "מיץ", transliteration: "Mitz", meaning: "Juice", category: "drinks", icon: "🧃" },
  { hebrew: "תה", transliteration: "Teh", meaning: "Tea", category: "drinks", icon: "🍵" },
  { hebrew: "קפה", transliteration: "Kafeh", meaning: "Coffee", category: "drinks", icon: "☕" },
  { hebrew: "בקבוק", transliteration: "Bakbuk", meaning: "Bottle", category: "drinks", icon: "🍼" },
  { hebrew: "כוס", transliteration: "Kos", meaning: "Cup", category: "drinks", icon: "🥤" },
  { hebrew: "קר", transliteration: "Kar", meaning: "Cold", category: "drinks", icon: "🧊" },
  { hebrew: "חם", transliteration: "Cham", meaning: "Hot", category: "drinks", icon: "🔥" },
  { hebrew: "צמא", transliteration: "Tzameh", meaning: "Thirsty", category: "drinks", icon: "😫" },

  // Food (20)
  { hebrew: "אוכל", transliteration: "Ochel", meaning: "Food", category: "food", icon: "🍽️" },
  { hebrew: "לחם", transliteration: "Lechem", meaning: "Bread", category: "food", icon: "🍞" },
  { hebrew: "ביצה", transliteration: "Beitzah", meaning: "Egg", category: "food", icon: "🥚" },
  { hebrew: "גבינה", transliteration: "Gvinah", meaning: "Cheese", category: "food", icon: "🧀" },
  { hebrew: "תפוח", transliteration: "Tapuach", meaning: "Apple", category: "food", icon: "🍎" },
  { hebrew: "בננה", transliteration: "Bananah", meaning: "Banana", category: "food", icon: "🍌" },
  { hebrew: "עוגה", transliteration: "Ugah", meaning: "Cake", category: "food", icon: "🍰" },
  { hebrew: "עוגייה", transliteration: "Ugiyah", meaning: "Cookie", category: "food", icon: "🍪" },
  { hebrew: "רעב", transliteration: "Ra'ev", meaning: "Hungry", category: "food", icon: "😋" },
  { hebrew: "טעים", transliteration: "Ta'im", meaning: "Delicious", category: "food", icon: "😋" },
  { hebrew: "ירקות", transliteration: "Yerakot", meaning: "Vegetables", category: "food", icon: "🥗" },
  { hebrew: "פירות", transliteration: "Perot", meaning: "Fruits", category: "food", icon: "🍇" },
  { hebrew: "בשר", transliteration: "Basar", meaning: "Meat", category: "food", icon: "🥩" },
  { hebrew: "דג", transliteration: "Dag", meaning: "Fish", category: "food", icon: "🐟" },
  { hebrew: "אורז", transliteration: "Orez", meaning: "Rice", category: "food", icon: "🍚" },
  { hebrew: "לאכול", transliteration: "Le'echol", meaning: "To eat", category: "food", icon: "🍴" },
  { hebrew: "מתוק", transliteration: "Matok", meaning: "Sweet", category: "food", icon: "🍬" },
  { hebrew: "מלוח", transliteration: "Maluach", meaning: "Salty", category: "food", icon: "🧂" },
  { hebrew: "חריף", transliteration: "Charif", meaning: "Spicy", category: "food", icon: "🌶️" },
  { hebrew: "קינוח", transliteration: "Kinuach", meaning: "Dessert", category: "food", icon: "🍨" },

  // Sleep (20)
  { hebrew: "לישון", transliteration: "Lishon", meaning: "To sleep", category: "sleep", icon: "😴" },
  { hebrew: "עייף", transliteration: "Ayef", meaning: "Tired", category: "sleep", icon: "🥱" },
  { hebrew: "מיטה", transliteration: "Mitah", meaning: "Bed", category: "sleep", icon: "🛏️" },
  { hebrew: "כרית", transliteration: "Karit", meaning: "Pillow", category: "sleep", icon: "🛋️" },
  { hebrew: "שמיכה", transliteration: "Smichah", meaning: "Blanket", category: "sleep", icon: "🛏️" },
  { hebrew: "חלום", transliteration: "Chalom", meaning: "Dream", category: "sleep", icon: "💭" },
  { hebrew: "לילה", transliteration: "Layla", meaning: "Night", category: "sleep", icon: "🌙" },
  { hebrew: "בוקר", transliteration: "Boker", meaning: "Morning", category: "sleep", icon: "🌅" },
  { hebrew: "לקום", transliteration: "Lakum", meaning: "To wake up", category: "sleep", icon: "⏰" },
  { hebrew: "פיג'מה", transliteration: "Pijamah", meaning: "Pajamas", category: "sleep", icon: "👕" },
  { hebrew: "שקט", transliteration: "Sheket", meaning: "Quiet", category: "sleep", icon: "🤫" },
  { hebrew: "ער", transliteration: "Er", meaning: "Awake", category: "sleep", icon: "👁️" },
  { hebrew: "לנוח", transliteration: "Lanuach", meaning: "To rest", category: "sleep", icon: "💤" },
  { hebrew: "נמנם", transliteration: "Nimnem", meaning: "Drowsy", category: "sleep", icon: "😪" },
  { hebrew: "שעון", transliteration: "Sha'on", meaning: "Clock", category: "sleep", icon: "🕐" },
  { hebrew: "כוכבים", transliteration: "Kochavim", meaning: "Stars", category: "sleep", icon: "⭐" },
  { hebrew: "ירח", transliteration: "Yareach", meaning: "Moon", category: "sleep", icon: "🌙" },
  { hebrew: "סיפור", transliteration: "Sipur", meaning: "Story", category: "sleep", icon: "📖" },
  { hebrew: "שיר ערש", transliteration: "Shir Eres", meaning: "Lullaby", category: "sleep", icon: "🎵" },
  { hebrew: "לילה טוב", transliteration: "Layla Tov", meaning: "Good night", category: "sleep", icon: "🌙" },

  // Bathroom (20)
  { hebrew: "שירותים", transliteration: "Sherutim", meaning: "Bathroom", category: "bathroom", icon: "🚽" },
  { hebrew: "פיפי", transliteration: "Pipi", meaning: "Pee", category: "bathroom", icon: "💦" },
  { hebrew: "קקי", transliteration: "Kaki", meaning: "Poop", category: "bathroom", icon: "💩" },
  { hebrew: "חיתול", transliteration: "Chitul", meaning: "Diaper", category: "bathroom", icon: "🧒" },
  { hebrew: "סבון", transliteration: "Sabon", meaning: "Soap", category: "bathroom", icon: "🧼" },
  { hebrew: "מגבת", transliteration: "Magevet", meaning: "Towel", category: "bathroom", icon: "🛁" },
  { hebrew: "מברשת שיניים", transliteration: "Mivreshet Shinayim", meaning: "Toothbrush", category: "bathroom", icon: "🪥" },
  { hebrew: "אמבטיה", transliteration: "Ambatyah", meaning: "Bath", category: "bathroom", icon: "🛁" },
  { hebrew: "נקי", transliteration: "Naki", meaning: "Clean", category: "bathroom", icon: "✨" },
  { hebrew: "מלוכלך", transliteration: "Meluchlach", meaning: "Dirty", category: "bathroom", icon: "🤢" },
  { hebrew: "לשטוף", transliteration: "Lishtof", meaning: "To wash", category: "bathroom", icon: "🚿" },
  { hebrew: "מים חמים", transliteration: "Mayim Chamim", meaning: "Hot water", category: "bathroom", icon: "🔥" },
  { hebrew: "מים קרים", transliteration: "Mayim Karim", meaning: "Cold water", category: "bathroom", icon: "🧊" },
  { hebrew: "שמפו", transliteration: "Shampu", meaning: "Shampoo", category: "bathroom", icon: "🧴" },
  { hebrew: "מסרק", transliteration: "Masrek", meaning: "Comb", category: "bathroom", icon: "💇" },
  { hebrew: "מראה", transliteration: "Mar'ah", meaning: "Mirror", category: "bathroom", icon: "🪞" },
  { hebrew: "כיור", transliteration: "Kiyor", meaning: "Sink", category: "bathroom", icon: "🚰" },
  { hebrew: "ברז", transliteration: "Berez", meaning: "Faucet", category: "bathroom", icon: "🚿" },
  { hebrew: "משחת שיניים", transliteration: "Mishchat Shinayim", meaning: "Toothpaste", category: "bathroom", icon: "🦷" },
  { hebrew: "לנגב", transliteration: "Lenagev", meaning: "To dry", category: "bathroom", icon: "💨" },

  // Play (20)
  { hebrew: "לשחק", transliteration: "Lesachek", meaning: "To play", category: "play", icon: "🎮" },
  { hebrew: "צעצוע", transliteration: "Tza'atzu'a", meaning: "Toy", category: "play", icon: "🧸" },
  { hebrew: "כדור", transliteration: "Kadur", meaning: "Ball", category: "play", icon: "⚽" },
  { hebrew: "בובה", transliteration: "Bubah", meaning: "Doll", category: "play", icon: "🎎" },
  { hebrew: "משחק", transliteration: "Misachak", meaning: "Game", category: "play", icon: "🎲" },
  { hebrew: "ציור", transliteration: "Tziyur", meaning: "Drawing", category: "play", icon: "🎨" },
  { hebrew: "ספר", transliteration: "Sefer", meaning: "Book", category: "play", icon: "📚" },
  { hebrew: "שיר", transliteration: "Shir", meaning: "Song", category: "play", icon: "🎵" },
  { hebrew: "ריקוד", transliteration: "Rikud", meaning: "Dance", category: "play", icon: "💃" },
  { hebrew: "חבר", transliteration: "Chaver", meaning: "Friend", category: "play", icon: "👫" },
  { hebrew: "לרוץ", transliteration: "Larutz", meaning: "To run", category: "play", icon: "🏃" },
  { hebrew: "לקפוץ", transliteration: "Likpotz", meaning: "To jump", category: "play", icon: "🦘" },
  { hebrew: "לצחוק", transliteration: "Litschok", meaning: "To laugh", category: "play", icon: "😂" },
  { hebrew: "כיף", transliteration: "Kef", meaning: "Fun", category: "play", icon: "🎉" },
  { hebrew: "חוץ", transliteration: "Chutz", meaning: "Outside", category: "play", icon: "🌳" },
  { hebrew: "פנים", transliteration: "Pnim", meaning: "Inside", category: "play", icon: "🏠" },
  { hebrew: "גן", transliteration: "Gan", meaning: "Garden", category: "play", icon: "🌻" },
  { hebrew: "נדנדה", transliteration: "Nadneda", meaning: "Swing", category: "play", icon: "🎢" },
  { hebrew: "מגלשה", transliteration: "Maglasha", meaning: "Slide", category: "play", icon: "🛝" },
  { hebrew: "חול", transliteration: "Chol", meaning: "Sand", category: "play", icon: "🏖️" },
];

const categoryInfo = {
  drinks: { label: "Water", color: "from-blue-400 to-cyan-400", icon: "💧", needText: "אני רוצה לשתות" },
  food: { label: "Food", color: "from-amber-400 to-orange-400", icon: "🍽️", needText: "אני רעב" },
  sleep: { label: "Sleep", color: "from-indigo-400 to-purple-400", icon: "😴", needText: "אני עייף" },
  bathroom: { label: "Bathroom", color: "from-teal-400 to-emerald-400", icon: "🚽", needText: "אני צריך שירותים" },
  play: { label: "Play", color: "from-pink-400 to-rose-400", icon: "🎮", needText: "אני רוצה לשחק" },
};

const needPhrases = {
  drinks: { hebrew: "אני רוצה לשתות", transliteration: "Ani rotzeh lishtot", meaning: "I want to drink" },
  food: { hebrew: "אני רעב", transliteration: "Ani ra'ev", meaning: "I am hungry" },
  sleep: { hebrew: "אני עייף", transliteration: "Ani ayef", meaning: "I am tired" },
  bathroom: { hebrew: "אני צריך שירותים", transliteration: "Ani tzarich sherutim", meaning: "I need bathroom" },
  play: { hebrew: "אני רוצה לשחק", transliteration: "Ani rotzeh lesachek", meaning: "I want to play" },
};

export default function BabyGame({ avatarName, onCorrect, onWatchTV }) {
  const queryClient = useQueryClient();
  const [gamePhase, setGamePhase] = useState("intro"); // intro, instructions, rating, picking, wordgame
  const [currentWord, setCurrentWord] = useState(null);
  const [showTranslation, setShowTranslation] = useState(false);
  const [wrongChoices, setWrongChoices] = useState([]);
  const [correctChoice, setCorrectChoice] = useState(null);
  const [generatedSentences, setGeneratedSentences] = useState(null);
  const [loadingSentences, setLoadingSentences] = useState(false);
  const [backpackOpen, setBackpackOpen] = useState(false);
  const [sentenceChecks, setSentenceChecks] = useState({});
  const [pendingRating, setPendingRating] = useState(null); // When 1-4 is rated, wait for image pick
  const [showMnemonicPhase, setShowMnemonicPhase] = useState(false); // After correct pick, show mnemonics
  const [mnemonicSuggestions, setMnemonicSuggestions] = useState(null);
  const [loadingMnemonics, setLoadingMnemonics] = useState(false);
  const [customMnemonic, setCustomMnemonic] = useState("");
  const [generatingImage, setGeneratingImage] = useState(false);
  const [generatedMnemonicImage, setGeneratedMnemonicImage] = useState(null);
const [lastImagePrompt, setLastImagePrompt] = useState("");
const [imageApproved, setImageApproved] = useState(false);
  const [postPickSentences, setPostPickSentences] = useState(null);
  const [loadingPostPickSentences, setLoadingPostPickSentences] = useState(false);
  const [newWordsQueue, setNewWordsQueue] = useState([]); // Words added from sentences
  const [activeNewWord, setActiveNewWord] = useState(null); // Currently rating a new word
  const [newWordMnemonics, setNewWordMnemonics] = useState(null);
  const [loadingNewWordMnemonics, setLoadingNewWordMnemonics] = useState(false);
  const [newWordImage, setNewWordImage] = useState(null);
  const [generatingNewWordImage, setGeneratingNewWordImage] = useState(false);
  const [newWordImageApproved, setNewWordImageApproved] = useState(false);
  const [newWordCustomMnemonic, setNewWordCustomMnemonic] = useState("");
  const [lastNewWordImagePrompt, setLastNewWordImagePrompt] = useState("");

  // Current user (for own-vocab scoping)
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const user = await base44.auth.me();
        setCurrentUser(user);
      } catch (e) {}
    };
    fetchUser();
  }, []);

  // Fetch word ratings from database
  const { data: wordRatings = [] } = useQuery({
    queryKey: ['wordRatings', currentUser?.email],
    queryFn: () => base44.entities.Word.filter({ category: "wordbank", created_by: currentUser.email }),
    enabled: !!currentUser?.email,
  });

  const createWordMutation = useMutation({
    mutationFn: (word) => base44.entities.Word.create(word),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['wordRatings'] }),
  });

  const updateWordMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Word.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['wordRatings'] }),
  });

  // Get rating for a word
  const getWordRating = (hebrew) => {
    const found = wordRatings.find(w => w.word === hebrew);
    return found?.times_practiced || 0;
  };

  // Count words by rating
  const getRatingCounts = () => {
    const counts = { fluent: 0, learning: 0, unrated: 0, total: wordBank.length };
    wordBank.forEach(word => {
      const rating = getWordRating(word.hebrew);
      if (rating >= 5) counts.fluent++;
      else if (rating > 0) counts.learning++;
      else counts.unrated++;
    });
    return counts;
  };

  const counts = getRatingCounts();
  const totalRated = counts.fluent + counts.learning;
  const canWatchTV = totalRated >= 100;
  const canPlayWordGame = totalRated >= 100;

  // Get next unrated word
  const getNextWord = () => {
    const unratedWords = wordBank.filter(w => getWordRating(w.hebrew) === 0);
    if (unratedWords.length > 0) {
      return unratedWords[Math.floor(Math.random() * unratedWords.length)];
    }
    const learningWords = wordBank.filter(w => {
      const rating = getWordRating(w.hebrew);
      return rating > 0 && rating < 5;
    });
    if (learningWords.length > 0) {
      return learningWords[Math.floor(Math.random() * learningWords.length)];
    }
    return wordBank[Math.floor(Math.random() * wordBank.length)];
  };

  // Generate wrong choices with unique icons
  const generateChoices = (correctWord) => {
    const usedIcons = new Set([correctWord.icon]);
    const otherWords = wordBank.filter(w => w.hebrew !== correctWord.hebrew && !usedIcons.has(w.icon));
    const uniqueChoices = [];

    // Get 4 words with unique icons
    for (const word of otherWords.sort(() => Math.random() - 0.5)) {
      if (!usedIcons.has(word.icon)) {
        usedIcons.add(word.icon);
        uniqueChoices.push(word);
        if (uniqueChoices.length >= 4) break;
      }
    }

    const allChoices = [...uniqueChoices.slice(0, 4), correctWord].sort(() => Math.random() - 0.5);
    return allChoices;
  };

  const [choices, setChoices] = useState([]);

  useEffect(() => {
    if (gamePhase === "needs" && !currentWord) {
      const nextWord = getNextWord();
      setCurrentWord(nextWord);
      setChoices(generateChoices(nextWord));
      setShowTranslation(false);
      setWrongChoices([]);
    }
  }, [gamePhase, wordRatings]);

  const playAudio = (text) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'he-IL';
    speechSynthesis.speak(utterance);
  };

  const handleChoiceClick = async (choice) => {
    if (choice.hebrew === currentWord.hebrew) {
      // Correct!
      setCorrectChoice(choice.hebrew);

      // Save word as practiced
      const existingWord = wordRatings.find(w => w.word === currentWord.hebrew);
      if (existingWord) {
        await updateWordMutation.mutateAsync({
          id: existingWord.id,
          data: { times_practiced: Math.min((existingWord.times_practiced || 0) + 1, 5), mastered: false }
        });
      }

      onCorrect && onCorrect(currentWord);

      // Next word after delay
      setTimeout(() => {
        goToNextWord();
      }, 800);
    } else {
      // Wrong
      setWrongChoices([...wrongChoices, choice.hebrew]);
    }
  };

  const goToNextWord = () => {
    const nextWord = getNextWord();
    setCurrentWord(nextWord);
    setChoices(generateChoices(nextWord));
    setShowTranslation(false);
    setWrongChoices([]);
    setCorrectChoice(null);
    setPendingRating(null);
    setShowMnemonicPhase(false);
    setMnemonicSuggestions(null);
    setPostPickSentences(null);
    setCustomMnemonic("");
    setGeneratedMnemonicImage(null);
    setImageApproved(false);
    setGamePhase("rating");
  };

  const handleRate = async (rating) => {
    const existingWord = wordRatings.find(w => w.word === currentWord.hebrew);

    if (existingWord) {
      await updateWordMutation.mutateAsync({
        id: existingWord.id,
        data: { times_practiced: rating, mastered: rating >= 5 }
      });
    } else {
      await createWordMutation.mutateAsync({
        word: currentWord.hebrew,
        translation: currentWord.meaning,
        phonetic: currentWord.transliteration,
        category: "wordbank",
        times_practiced: rating,
        mastered: rating >= 5,
      });
    }

    if (rating >= 5) {
      // Fluent - go to next word immediately
      toast.success("Added to Fluent! ⭐");
      onCorrect && onCorrect(currentWord);
      goToNextWord();
    } else {
      // Rating 1-4: stay on same screen, let user pick image
      setPendingRating(rating);
    }
  };

  const handleImagePick = async (choice) => {
    if (choice.hebrew === currentWord.hebrew) {
      setCorrectChoice(choice.hebrew);
      toast.success("Correct! ✓");
      // Show mnemonic phase instead of moving to next word
      setShowMnemonicPhase(true);
      generateMnemonicsAndSentences(currentWord);
    } else {
      setWrongChoices([...wrongChoices, choice.hebrew]);
      toast.error(`That's ${choice.meaning}`);
    }
  };

  const generateMnemonicsAndSentences = async (word) => {
    setLoadingMnemonics(true);
    setLoadingPostPickSentences(true);

    // Generate mnemonics
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Create 3 very short mnemonic phrases (MAX 5 words each) to remember the Hebrew word "${word.transliteration}" which means "${word.meaning}".
        Use the SOUND of the word to create memorable associations with OBJECTS or THINGS in English (not people's names).
        For example: "Mayim" -> "My yam drinks water"
        Keep each phrase to 5 words or less. Only use common English objects, animals, or things - NO proper names.`,
        response_json_schema: {
          type: "object",
          properties: {
            suggestions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  phrase: { type: "string" },
                  imagePrompt: { type: "string" }
                }
              }
            }
          }
        }
      });
      setMnemonicSuggestions(result.suggestions);
    } catch (e) {
      console.error(e);
    }
    setLoadingMnemonics(false);

    // Generate sentences
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Create 3 simple sentences using the Hebrew word "${word.hebrew}" (${word.transliteration}) meaning "${word.meaning}".
        For each sentence provide the transliterated version (not Hebrew letters) and English translation.
        List each word separately with its meaning.`,
        response_json_schema: {
          type: "object",
          properties: {
            sentences: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  transliterated: { type: "string" },
                  english: { type: "string" },
                  words: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        word: { type: "string" },
                        meaning: { type: "string" }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      });
      setPostPickSentences(result.sentences);
    } catch (e) {
      console.error(e);
    }
    setLoadingPostPickSentences(false);
  };

  const generateMnemonicImage = async (prompt) => {
        setGeneratingImage(true);
        setLastImagePrompt(prompt);
        try {
          const result = await base44.integrations.Core.GenerateImage({
            prompt: `A colorful, memorable mnemonic illustration: ${prompt}.
            For learning Hebrew word "${currentWord.transliteration}" meaning "${currentWord.meaning}".
            Cartoon style, vibrant colors, educational, fun and memorable.`
          });
          setGeneratedMnemonicImage(result.url);

      // Save image to the word
      const existingWord = wordRatings.find(w => w.word === currentWord.hebrew);
      if (existingWord) {
        await updateWordMutation.mutateAsync({
          id: existingWord.id,
          data: { image_url: result.url }
        });
      }
      toast.success("Image saved!");
    } catch (e) {
      toast.error("Failed to generate image");
    }
    setGeneratingImage(false);
  };

  const finishMnemonicPhase = () => {
    setShowMnemonicPhase(false);
    setMnemonicSuggestions(null);
    setPostPickSentences(null);
    setCustomMnemonic("");
    setGeneratedMnemonicImage(null);
    setPendingRating(null);
    setCorrectChoice(null);
    setWrongChoices([]);
    setNewWordsQueue([]);
    setActiveNewWord(null);
    setNewWordMnemonics(null);
    setNewWordImage(null);
    goToNextWord();
  };

  const generateSentences = async (word) => {
    setLoadingSentences(true);
    setSentenceChecks({});
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Create 3 simple example sentences using the Hebrew word "${word.hebrew}" (${word.transliteration}) which means "${word.meaning}".
        Return ONLY the transliterated Hebrew (not Hebrew letters), with English translation.
        For each sentence, list ALL the words with their meanings.`,
        response_json_schema: {
          type: "object",
          properties: {
            sentences: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  transliterated: { type: "string" },
                  english: { type: "string" },
                  words: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        word: { type: "string" },
                        meaning: { type: "string" }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      });
      setGeneratedSentences(result.sentences);
    } catch (e) {
      console.error(e);
    }
    setLoadingSentences(false);
  };

  const addWordToBackpack = async (word, meaning) => {
    const exists = wordRatings.find(w => w.phonetic?.toLowerCase() === word.toLowerCase());
    if (exists) {
      toast.info("Already in backpack!");
      return;
    }
    // Add to new words queue instead of directly saving
    const alreadyQueued = newWordsQueue.find(w => w.word.toLowerCase() === word.toLowerCase());
    if (alreadyQueued) {
      toast.info("Already added!");
      return;
    }
    setNewWordsQueue(prev => [...prev, { word, meaning }]);
    toast.success(`"${word}" added to New Words! 📝`);
  };

  const handleNewWordRate = async (rating) => {
    if (!activeNewWord) return;

    await createWordMutation.mutateAsync({
      word: activeNewWord.word,
      translation: activeNewWord.meaning,
      phonetic: activeNewWord.word,
      category: "wordbank",
      times_practiced: rating,
      mastered: rating >= 5,
    });

    if (rating >= 5) {
      toast.success("Added to Fluent! ⭐");
      finishNewWord();
    } else {
      // Generate mnemonics for this word
      generateNewWordMnemonics(activeNewWord);
    }
  };

  const generateNewWordMnemonics = async (wordObj) => {
    setLoadingNewWordMnemonics(true);
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Create 3 very short mnemonic phrases (MAX 5 words each) to remember the word "${wordObj.word}" which means "${wordObj.meaning}".
        Use the SOUND of the word to create memorable associations with OBJECTS or THINGS in English (not people's names).
        Keep each phrase to 5 words or less. Only use common English objects, animals, or things - NO proper names.`,
        response_json_schema: {
          type: "object",
          properties: {
            suggestions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  phrase: { type: "string" },
                  imagePrompt: { type: "string" }
                }
              }
            }
          }
        }
      });
      setNewWordMnemonics(result.suggestions);
    } catch (e) {
      console.error(e);
    }
    setLoadingNewWordMnemonics(false);
  };

  const generateNewWordImage = async (prompt) => {
    setGeneratingNewWordImage(true);
    setLastNewWordImagePrompt(prompt);
    try {
      const result = await base44.integrations.Core.GenerateImage({
        prompt: `A colorful, memorable mnemonic illustration: ${prompt}.
        For learning the word "${activeNewWord.word}" meaning "${activeNewWord.meaning}".
        Cartoon style, vibrant colors, educational, fun and memorable.`
      });
      setNewWordImage(result.url);

      // Save image to the word
      const savedWord = wordRatings.find(w => w.phonetic?.toLowerCase() === activeNewWord.word.toLowerCase());
      if (savedWord) {
        await updateWordMutation.mutateAsync({
          id: savedWord.id,
          data: { image_url: result.url }
        });
      }
      toast.success("Image saved!");
    } catch (e) {
      toast.error("Failed to generate image");
    }
    setGeneratingNewWordImage(false);
  };

  const finishNewWord = () => {
    // Remove from queue and reset
    setNewWordsQueue(prev => prev.filter(w => w.word !== activeNewWord.word));
    setActiveNewWord(null);
    setNewWordMnemonics(null);
    setNewWordImage(null);
    setNewWordImageApproved(false);
    setNewWordCustomMnemonic("");
    setLastNewWordImagePrompt("");
  };

  const moveToNextWord = () => {
    setGeneratedSentences(null);
    setSentenceChecks({});
    const nextWord = getNextWord();
    setCurrentWord(nextWord);
    setShowTranslation(false);
  };

  const needPhrase = currentWord ? needPhrases[currentWord.category] : null;

  // INTRO SCREEN - Just the question
  if (gamePhase === "intro") {
    return (
      <div className="text-center py-12">
        <motion.span
          className="text-8xl mb-6 block"
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          👶
        </motion.span>
        <h2 className="text-3xl font-bold text-white mb-3">
          Hi! I'm {avatarName}!
        </h2>
        <p className="text-white/80 text-xl mb-8">
          Will you be my babysitter and learn Hebrew with me? 🍼
        </p>
        <Button
          onClick={() => setGamePhase("instructions")}
          className="bg-gradient-to-r from-cyan-500 to-purple-500 text-white font-bold py-4 px-12 text-xl rounded-xl"
        >
          Yes! 🎉
        </Button>
      </div>
    );
  }

  // INSTRUCTIONS SCREEN
  if (gamePhase === "instructions") {
    return (
      <div className="text-center py-12">
        <span className="text-6xl mb-6 block">👶</span>
        <p className="text-white text-xl mb-8">
          I'll ask for things (water, food, sleep, play, bathroom) - choose the right picture!
        </p>
        <Button
          onClick={() => {
            const nextWord = getNextWord();
            setCurrentWord(nextWord);
            setChoices(generateChoices(nextWord));
            setGamePhase("rating");
          }}
          className="bg-gradient-to-r from-cyan-500 to-purple-500 text-white font-bold py-4 px-12 text-xl rounded-xl"
        >
          OK, Let's Go! 🚀
        </Button>
      </div>
    );
  }

  // Fallback / WORD GAME PHASE (after 100 words)
  if (gamePhase === "wordgame" || gamePhase === "needs") {
    return (
      <div className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">🎮 Word Game with {avatarName}</h2>
          <Button variant="ghost" onClick={() => setGamePhase("needs")} className="text-white/60">
            Back to Needs
          </Button>
        </div>

        {!currentWord && (
          <div className="text-center py-8">
            <p className="text-white/60">Loading word...</p>
          </div>
        )}

        {currentWord && !generatedSentences && !loadingSentences && (
          <div className="text-center mb-6">
            <div className="bg-white/10 rounded-2xl p-6 mb-4">
              <p className="text-4xl font-bold text-cyan-400 mb-2" dir="rtl">{currentWord.hebrew}</p>
              <p className="text-xl text-white/80">{currentWord.transliteration}</p>
              <button
                onClick={() => setShowTranslation(!showTranslation)}
                className="text-white/40 text-sm mt-2"
              >
                {showTranslation ? (
                  <span className="text-green-400">= <EditableWord
                    text={currentWord.meaning}
                    editable={false}
                    onSave={() => {}}
                    className="text-green-400"
                  /></span>
                ) : "(tap for meaning)"}
              </button>
            </div>

            <p className="text-white/60 mb-3">Rate your knowledge:</p>
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map((num) => (
                <motion.button
                  key={num}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleRate(num)}
                  className={`w-14 h-14 rounded-xl font-bold text-lg ${
                    num === 5 ? "bg-gradient-to-r from-green-500 to-emerald-500 text-white"
                    : num >= 4 ? "bg-gradient-to-r from-blue-500 to-cyan-500 text-white"
                    : num >= 3 ? "bg-gradient-to-r from-yellow-500 to-amber-500 text-white"
                    : "bg-white/20 text-white/80"
                  }`}
                >
                  {num}{num === 5 && <span className="block text-xs">⭐</span>}
                </motion.button>
              ))}
            </div>
          </div>
        )}

        {loadingSentences && (
          <div className="text-center py-8">
            <Loader2 className="w-8 h-8 text-cyan-400 animate-spin mx-auto mb-2" />
            <p className="text-white/60">Generating sentences...</p>
          </div>
        )}

        {generatedSentences && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <h4 className="text-white/80 mb-3">📝 Check if you know all words (click unknowns to add):</h4>
            {generatedSentences.map((sentence, idx) => (
              <div key={idx} className="bg-white/5 rounded-xl p-4 mb-3">
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => setSentenceChecks({...sentenceChecks, [idx]: !sentenceChecks[idx]})}
                    className={`mt-1 w-6 h-6 rounded border-2 flex items-center justify-center transition-all ${
                      sentenceChecks[idx] ? "bg-green-500 border-green-500" : "border-white/30"
                    }`}
                  >
                    {sentenceChecks[idx] && <Check className="w-4 h-4 text-white" />}
                  </button>
                  <div className="flex-1">
                    <div className="flex flex-wrap gap-1 mb-1">
                      {sentence.transliterated.split(' ').map((word, widx) => {
                        const wordInfo = sentence.words?.find(w =>
                          w.word.toLowerCase() === word.toLowerCase().replace(/[.,!?]/g, '')
                        );
                        return (
                          <span key={widx} className="inline-flex">
                            <EditableWord
                              text={word}
                              editable={false}
                              onSave={() => {}}
                              className={`px-1 rounded cursor-pointer ${
                                wordInfo ? "text-cyan-400 hover:bg-cyan-500/20 underline decoration-dotted" : "text-white/80"
                              }`}
                              onClick={() => wordInfo && addWordToBackpack(wordInfo.word, wordInfo.meaning)}
                            />
                          </span>
                        );
                      })}
                    </div>
                    <p className="text-white/50 text-sm">
                      <EditableWord
                        text={sentence.english}
                        editable={false}
                        onSave={() => {}}
                        className="text-white/50 text-sm"
                      />
                    </p>
                  </div>
                </div>
              </div>
            ))}
            <Button onClick={moveToNextWord} className="w-full mt-4 bg-gradient-to-r from-cyan-500 to-purple-500">
              Next Word →
            </Button>
          </motion.div>
        )}
      </div>
    );
  }

  // MNEMONIC PHASE - After correct pick, show mnemonics and sentences
  if (gamePhase === "rating" && showMnemonicPhase && currentWord) {
    return (
      <div className="p-4 max-h-[80vh] overflow-y-auto">
        {/* Word with meaning */}
        <div className="text-center mb-6 bg-green-500/10 border border-green-500/30 rounded-xl p-4">
          <span className="text-4xl mb-2 block">✓</span>
          <p className="text-2xl font-bold text-yellow-400">
            <EditableWord
              text={currentWord.transliteration}
              editable={false}
              onSave={() => {}}
              className="text-2xl font-bold text-yellow-400"
            />
          </p>
          <p className="text-xl text-green-400">
            = <EditableWord
              text={currentWord.meaning}
              editable={false}
              onSave={() => {}}
              className="text-xl text-green-400"
            />
          </p>
        </div>

        {/* Mnemonic Ideas */}
        <div className="mb-6">
          <h4 className="text-white font-semibold mb-3">💡 This word sounds like...</h4>

          {/* Custom mnemonic input - ON TOP */}
          <div className="mb-3 bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/30 rounded-xl p-3">
            <p className="text-white/60 text-sm mb-2">Describe your own:</p>
            <div className="flex gap-2">
              <Textarea
                value={customMnemonic}
                onChange={(e) => setCustomMnemonic(e.target.value)}
                placeholder="e.g., A cow saying 'moo' while drinking water..."
                className="bg-white/5 border-white/20 text-white text-sm resize-none h-16"
              />
              <Button
                onClick={() => generateMnemonicImage(customMnemonic)}
                disabled={!customMnemonic.trim() || generatingImage}
                className="bg-gradient-to-r from-purple-500 to-pink-500 h-auto"
              >
                {generatingImage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              </Button>
            </div>
          </div>

          {/* Generated Image - smaller */}
          {generatedMnemonicImage && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mb-3 flex justify-center"
            >
              <div className="relative inline-block">
                <img src={generatedMnemonicImage} alt="Mnemonic" className="w-48 rounded-xl border border-white/20 mx-auto" />
                <button
                  onClick={() => generateMnemonicImage(lastImagePrompt || customMnemonic || mnemonicSuggestions?.[0]?.imagePrompt || currentWord.meaning)}
                  disabled={generatingImage}
                  className="absolute bottom-2 left-2 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center"
                >
                  {generatingImage ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <span className="text-lg">🔄</span>}
                </button>
                <button
                  onClick={() => {
                    setImageApproved(true);
                    toast.success("Image saved! ✓");
                  }}
                  className={`absolute bottom-2 right-2 w-8 h-8 rounded-full flex items-center justify-center ${
                    imageApproved ? "bg-green-500" : "bg-white/20 hover:bg-white/30"
                  }`}
                >
                  <Check className={`w-4 h-4 ${imageApproved ? "text-white" : "text-white/60"}`} />
                </button>
              </div>
            </motion.div>
          )}

          {/* AI Suggestions */}
          {loadingMnemonics ? (
                                      <div className="flex items-center gap-2 text-white/60">
                                        <Loader2 className="w-4 h-4 animate-spin" /> Generating ideas...
                                      </div>
                                    ) : mnemonicSuggestions ? (
                                      <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex flex-wrap items-center gap-2">
                                        {mnemonicSuggestions.map((s, i) => (
                                          <motion.button
                                            key={i}
                                            initial={{ opacity: 0, scale: 0.9 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            transition={{ delay: i * 0.1 }}
                                            onClick={() => generateMnemonicImage(s.imagePrompt)}
                                            disabled={generatingImage}
                                            className="bg-purple-500/20 hover:bg-purple-500/40 border border-purple-500/50 rounded-lg px-3 py-1.5 text-purple-300 text-sm transition-all"
                                          >
                                            {s.phrase}
                                          </motion.button>
                                        ))}
                                        <button
                                          onClick={() => generateMnemonicsAndSentences(currentWord)}
                                          disabled={loadingMnemonics}
                                          className="bg-white/10 hover:bg-white/20 rounded-lg px-2 py-1.5 text-white/60 text-sm transition-all"
                                        >
                                          🔄
                                        </button>
                                      </div>
                                    ) : null}
        </div>

        {/* Sentences */}
        <div className="mb-6">
          <h4 className="text-white font-semibold mb-3">📝 Example Sentences <span className="text-white/40 text-sm">(tap words to add)</span></h4>
          {loadingPostPickSentences ? (
            <div className="flex items-center gap-2 text-white/60">
              <Loader2 className="w-4 h-4 animate-spin" /> Generating sentences...
            </div>
          ) : postPickSentences ? (
            <div className="space-y-3">
              {postPickSentences.map((sentence, idx) => (
                <div key={idx} className="bg-white/5 border border-white/10 rounded-xl p-3">
                  <div className="flex flex-wrap gap-1 mb-1">
                    {sentence.transliterated.split(' ').map((word, widx) => {
                      const wordInfo = sentence.words?.find(w =>
                        w.word.toLowerCase() === word.toLowerCase().replace(/[.,!?]/g, '')
                      );
                      const isQueued = newWordsQueue.find(w => w.word.toLowerCase() === wordInfo?.word?.toLowerCase());
                      return (
                        <span key={widx} className="inline-flex">
                          <EditableWord
                            text={word}
                            editable={false}
                            onSave={() => {}}
                            className={`px-1 rounded cursor-pointer ${
                              isQueued
                                ? "text-green-400 bg-green-500/20"
                                : wordInfo
                                ? "text-cyan-400 hover:bg-cyan-500/20 underline decoration-dotted"
                                : "text-white/80"
                            }`}
                            onClick={() => wordInfo && addWordToBackpack(wordInfo.word, wordInfo.meaning)}
                          />
                        </span>
                      );
                    })}
                  </div>
                  <p className="text-white/50 text-sm">
                     <EditableWord
                       text={sentence.english}
                       editable={false}
                       onSave={() => {}}
                       className="text-white/50 text-sm"
                     />
                   </p>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* New Words Queue */}
        {newWordsQueue.length > 0 && !activeNewWord && (
          <div className="mb-6 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
            <h4 className="text-amber-400 font-semibold mb-3">📝 New Words ({newWordsQueue.length})</h4>
            <div className="flex flex-wrap gap-2">
              {newWordsQueue.map((w, i) => (
                <button
                  key={i}
                  onClick={() => setActiveNewWord(w)}
                  className="bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 rounded-lg px-3 py-2 text-amber-300 transition-all"
                >
                  {w.word} <span className="text-amber-400/60 text-sm">({w.meaning})</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Active New Word - Rating & Mnemonic */}
        {activeNewWord && (
          <div className="mb-6 bg-purple-500/10 border border-purple-500/30 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-purple-400 font-semibold">Rate: {activeNewWord.word}</h4>
              <button onClick={() => setActiveNewWord(null)} className="text-white/40 hover:text-white">✕</button>
            </div>
            <p className="text-white/60 text-sm mb-3">= <EditableWord
              text={activeNewWord.meaning}
              editable={false}
              onSave={() => {}}
              className="text-white/60 text-sm"
            /></p>

            {/* Rating */}
            <div className="flex gap-2 mb-4">
              {[1, 2, 3, 4, 5].map((num) => (
                <motion.button
                  key={num}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleNewWordRate(num)}
                  className={`w-10 h-10 rounded-lg font-bold text-sm ${
                    num === 5 ? "bg-gradient-to-r from-green-500 to-emerald-500 text-white"
                    : "bg-white/20 text-white/80 hover:bg-white/30"
                  }`}
                >
                  {num}{num === 5 && "⭐"}
                </motion.button>
              ))}
            </div>

            {/* Mnemonics for new word */}
            {loadingNewWordMnemonics && (
              <div className="flex items-center gap-2 text-white/60">
                <Loader2 className="w-4 h-4 animate-spin" /> Generating ideas...
              </div>
            )}

            {newWordMnemonics && (
              <>
                {/* Custom input */}
                <div className="mb-3 flex gap-2">
                  <Textarea
                    value={newWordCustomMnemonic}
                    onChange={(e) => setNewWordCustomMnemonic(e.target.value)}
                    placeholder="Your own mnemonic..."
                    className="bg-white/5 border-white/20 text-white text-sm resize-none h-12 flex-1"
                  />
                  <Button
                    onClick={() => generateNewWordImage(newWordCustomMnemonic)}
                    disabled={!newWordCustomMnemonic.trim() || generatingNewWordImage}
                    className="bg-gradient-to-r from-purple-500 to-pink-500"
                  >
                    {generatingNewWordImage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                  </Button>
                </div>

                {/* Suggestions */}
                <div className="flex flex-wrap gap-2 mb-3">
                  {newWordMnemonics.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => generateNewWordImage(s.imagePrompt)}
                      disabled={generatingNewWordImage}
                      className="bg-purple-500/20 hover:bg-purple-500/40 border border-purple-500/50 rounded-lg px-3 py-1.5 text-purple-300 text-sm transition-all"
                    >
                      {s.phrase}
                    </button>
                  ))}
                  <button
                    onClick={() => generateNewWordMnemonics(activeNewWord)}
                    disabled={loadingNewWordMnemonics}
                    className="bg-white/10 hover:bg-white/20 rounded-lg px-2 py-1.5 text-white/60 text-sm transition-all"
                  >
                    🔄
                  </button>
                </div>

                {/* Generated Image */}
                {newWordImage && (
                  <div className="flex justify-center mb-3">
                    <div className="relative inline-block">
                      <img src={newWordImage} alt="Mnemonic" className="w-40 rounded-xl border border-white/20" />
                      <button
                        onClick={() => generateNewWordImage(lastNewWordImagePrompt || newWordCustomMnemonic || newWordMnemonics?.[0]?.imagePrompt)}
                        disabled={generatingNewWordImage}
                        className="absolute bottom-2 left-2 w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center"
                      >
                        {generatingNewWordImage ? <Loader2 className="w-3 h-3 text-white animate-spin" /> : <span className="text-sm">🔄</span>}
                      </button>
                      <button
                        onClick={() => {
                          setNewWordImageApproved(true);
                          toast.success("Image saved! ✓");
                        }}
                        className={`absolute bottom-2 right-2 w-7 h-7 rounded-full flex items-center justify-center ${
                          newWordImageApproved ? "bg-green-500" : "bg-white/20 hover:bg-white/30"
                        }`}
                      >
                        <Check className={`w-3 h-3 ${newWordImageApproved ? "text-white" : "text-white/60"}`} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Done button */}
                <Button onClick={finishNewWord} className="w-full bg-gradient-to-r from-green-500 to-emerald-500">
                  Done with this word ✓
                </Button>
              </>
            )}
          </div>
        )}

        {/* Next Button */}
        <Button
          onClick={finishMnemonicPhase}
          disabled={newWordsQueue.length > 0}
          className={`w-full py-6 text-lg font-bold ${
            newWordsQueue.length > 0
              ? "bg-white/10 text-white/40"
              : "bg-gradient-to-r from-cyan-500 to-purple-500"
          }`}
        >
          {newWordsQueue.length > 0 ? `Rate ${newWordsQueue.length} new word${newWordsQueue.length > 1 ? 's' : ''} first` : "Next Word →"}
        </Button>
      </div>
    );
  }

  // RATING PHASE - Rate 1-5 with pictures below
  if (gamePhase === "rating" && currentWord) {
    return (
      <div className="p-4">
        {/* Compact Progress */}
        <div className="flex items-center justify-between mb-4 text-xs">
          <span className="text-white/60">{totalRated}/100</span>
          <div className="flex-1 mx-3 h-2 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-cyan-500 to-purple-500" style={{ width: `${Math.min((totalRated / 100) * 100, 100)}%` }} />
          </div>
          <span className="text-green-400">⭐{counts.fluent}</span>
          <button onClick={() => setBackpackOpen(true)} className="ml-2 text-xl">🎒</button>
        </div>

        {/* Word with inline rating */}
        <div className="text-center mb-6">
          <span className="text-5xl mb-3 block">👶</span>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <p className="text-2xl font-bold text-yellow-400">
              <EditableWord
                text={currentWord.transliteration}
                editable={false}
                onSave={() => {}}
                className="text-2xl font-bold text-yellow-400"
              />
            </p>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((num) => (
                <motion.button
                  key={num}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleRate(num)}
                  disabled={false}
                  className={`w-8 h-8 rounded-lg font-bold text-sm transition-all ${
                    pendingRating === num
                      ? "bg-cyan-500 text-white ring-2 ring-cyan-300"
                      : "bg-white/20 text-white/80 hover:bg-white/30"
                  }`}
                >
                  {num}
                </motion.button>
              ))}
            </div>
          </div>
        </div>

        {/* Picture choices - clickable after rating 1-4 */}
        <div className="grid grid-cols-5 gap-2">
          {choices.map((choice) => {
            const isWrong = wrongChoices.includes(choice.hebrew);
            const isCorrect = correctChoice === choice.hebrew;
            return (
              <motion.button
                key={choice.hebrew}
                whileHover={{ scale: pendingRating && !isWrong && !isCorrect ? 1.05 : 1 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => pendingRating && !isWrong && !correctChoice && handleImagePick(choice)}
                disabled={!pendingRating || isWrong || !!correctChoice}
                className={`p-3 rounded-xl border-2 transition-all relative ${
                  isCorrect
                    ? "bg-green-500/30 border-green-500"
                    : isWrong
                    ? "bg-red-500/30 border-red-500"
                    : pendingRating
                    ? "bg-white/5 border-cyan-400/50 cursor-pointer hover:border-cyan-400"
                    : "bg-white/5 border-white/10"
                }`}
              >
                <span className="text-3xl block">{choice.icon}</span>
                {isCorrect && <Check className="absolute top-1 right-1 w-4 h-4 text-green-400" />}
                {isWrong && <X className="absolute top-1 right-1 w-4 h-4 text-red-400" />}
              </motion.button>
            );
          })}
        </div>

        {/* Instructions */}
        <p className="text-center text-white/60 text-sm mt-4">
          {pendingRating
            ? "Now choose the correct image! 👆"
            : "Rate 1-5 how well you know this word. Then choose the correct image."}
        </p>

        {/* Backpack Dialog */}
        <Dialog open={backpackOpen} onOpenChange={setBackpackOpen}>
          <DialogContent className="bg-slate-900 border-white/20 text-white max-w-md max-h-[80vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>🎒 My Backpack</DialogTitle>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto space-y-4">
              {/* Fluent Folder */}
              <div>
                <h4 className="text-sm font-semibold text-green-400 mb-2 flex items-center gap-2">
                  <span>⭐ Fluent</span>
                  <span className="bg-green-500/20 px-2 py-0.5 rounded-full text-xs">{counts.fluent}</span>
                </h4>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {wordRatings.filter(w => w.times_practiced >= 5).length === 0 ? (
                    <p className="text-white/40 text-sm">No fluent words yet</p>
                  ) : wordRatings.filter(w => w.times_practiced >= 5).map((word) => (
                   <div key={word.id} className="bg-green-500/10 rounded-lg px-3 py-2 flex items-center justify-between">
                     <span className="text-cyan-400">{word.phonetic || word.word}</span>
                     <span className="text-white/60 text-sm">
                       <EditableWord
                         text={word.translation}
                         editable={false}
                         onSave={() => {}}
                         className="text-white/60 text-sm"
                       />
                     </span>
                   </div>
                  ))}
                </div>
              </div>

              {/* Learning Folder */}
              <div>
                <h4 className="text-sm font-semibold text-yellow-400 mb-2 flex items-center gap-2">
                  <span>📚 Learning</span>
                  <span className="bg-yellow-500/20 px-2 py-0.5 rounded-full text-xs">{counts.learning}</span>
                </h4>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {wordRatings.filter(w => w.times_practiced > 0 && w.times_practiced < 5).length === 0 ? (
                    <p className="text-white/40 text-sm">No words in progress</p>
                  ) : wordRatings.filter(w => w.times_practiced > 0 && w.times_practiced < 5).map((word) => (
                   <div key={word.id} className="bg-yellow-500/10 rounded-lg px-3 py-2 flex items-center justify-between">
                     <span className="text-cyan-400">{word.phonetic || word.word}</span>
                     <span className="text-white/60 text-sm">
                       <EditableWord
                         text={word.translation}
                         editable={false}
                         onSave={() => {}}
                         className="text-white/60 text-sm"
                       />
                     </span>
                   </div>
                  ))}
                </div>
              </div>

              {/* Unlocked Rewards */}
              <div className="border-t border-white/10 pt-4">
                <h4 className="text-sm font-semibold text-purple-400 mb-2">🎁 Rewards</h4>
                {canWatchTV ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      onClick={() => { setBackpackOpen(false); onWatchTV(); }}
                      className="bg-gradient-to-r from-purple-500 to-pink-500"
                    >
                      <Tv className="w-4 h-4 mr-1" /> Hebrew TV
                    </Button>
                    <Button
                      onClick={() => { setBackpackOpen(false); setGamePhase("wordgame"); }}
                      className="bg-gradient-to-r from-green-500 to-emerald-500"
                    >
                      <Gamepad2 className="w-4 h-4 mr-1" /> Flashcards
                    </Button>
                  </div>
                ) : (
                  <p className="text-white/40 text-sm">Rate {100 - totalRated} more words to unlock TV & games!</p>
                )}
              </div>

              {/* Quick Links */}
              <div className="border-t border-white/10 pt-4">
                <h4 className="text-sm font-semibold text-white/60 mb-2">📍 Quick Links</h4>
                <div className="grid grid-cols-4 gap-2">
                  <a href={createPageUrl("Practice")} className="py-2 bg-white/5 rounded-lg text-cyan-400 text-center text-sm hover:bg-white/10">📚 Words</a>
                  <a href={createPageUrl("Videos")} className="py-2 bg-white/5 rounded-lg text-purple-400 text-center text-sm hover:bg-white/10">📺 Videos</a>
                  <a href={createPageUrl("Progress")} className="py-2 bg-white/5 rounded-lg text-blue-400 text-center text-sm hover:bg-white/10">📖 Lessons</a>
                  <a href={createPageUrl("Store")} className="py-2 bg-white/5 rounded-lg text-yellow-400 text-center text-sm hover:bg-white/10">🏪 Store</a>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // PICKING PHASE - Choose correct picture
  if (gamePhase === "picking" && currentWord) {
    return (
      <div className="p-4">
        {/* Progress */}
        <div className="flex items-center justify-between mb-4 text-xs">
          <span className="text-white/60">{totalRated}/100</span>
          <div className="flex-1 mx-3 h-2 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-cyan-500 to-purple-500" style={{ width: `${Math.min((totalRated / 100) * 100, 100)}%` }} />
          </div>
          <span className="text-green-400">⭐{counts.fluent}</span>
        </div>

        {/* Baby asking */}
        <div className="text-center mb-4">
          <span className="text-4xl">👶</span>
          <p className="text-xl font-bold text-yellow-400 mt-2">{currentWord.transliteration}</p>
          <p className="text-white/50 text-sm">Choose the correct picture!</p>
        </div>

        {/* Picture Choices */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          {choices.map((choice) => {
            const isWrong = wrongChoices.includes(choice.hebrew);
            const isCorrect = correctChoice === choice.hebrew;
            return (
              <motion.button
                key={choice.hebrew}
                whileHover={{ scale: (isWrong || isCorrect) ? 1 : 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => !isWrong && !correctChoice && handleChoiceClick(choice)}
                disabled={isWrong || !!correctChoice}
                className={`relative p-3 rounded-xl border-2 transition-all ${
                  isCorrect
                    ? "bg-green-500/30 border-green-500"
                    : isWrong
                    ? "bg-red-500/30 border-red-500"
                    : "bg-white/5 border-white/20 hover:border-cyan-400/50"
                }`}
              >
                <span className="text-4xl block">{choice.icon}</span>
                {isCorrect && <Check className="absolute top-1 right-1 w-5 h-5 text-green-400" />}
                {isWrong && <X className="absolute top-1 right-1 w-5 h-5 text-red-400" />}
              </motion.button>
            );
          })}
        </div>

        {/* Quick Links */}
        <div className="flex gap-2 text-xs">
          <a href={createPageUrl("Practice")} className="flex-1 py-2 bg-white/5 rounded-lg text-cyan-400 text-center">📚</a>
          <a href={createPageUrl("Videos")} className="flex-1 py-2 bg-white/5 rounded-lg text-purple-400 text-center">📺</a>
          <a href={createPageUrl("Progress")} className="flex-1 py-2 bg-white/5 rounded-lg text-blue-400 text-center">📖</a>
          <a href={createPageUrl("Store")} className="flex-1 py-2 bg-white/5 rounded-lg text-yellow-400 text-center">🏪</a>
          <button onClick={() => setBackpackOpen(true)} className="flex-1 py-2 bg-white/5 rounded-lg text-amber-400 text-center">🎒</button>
        </div>
      </div>
    );
  }

  // Default fallback
  return null;
}
