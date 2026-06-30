// Single source of truth for the languages a student can learn.
// Used by the onboarding picker and the in-app LanguageSwitcher so the two
// never drift. Flip `active` as content for a language becomes available.
export type LearningLanguage = {
  id: string;
  name: string;
  emoji: string;
  active: boolean;
};

export const LEARNING_LANGUAGES: LearningLanguage[] = [
  { id: "hebrew", name: "Hebrew", emoji: "🇮🇱", active: true },
  { id: "english", name: "English", emoji: "🇺🇸", active: true },
  { id: "spanish", name: "Spanish", emoji: "🇪🇸", active: true },
  { id: "french", name: "French", emoji: "🇫🇷", active: false },
  { id: "portuguese", name: "Portuguese", emoji: "🇧🇷", active: false },
  { id: "italian", name: "Italian", emoji: "🇮🇹", active: false },
];

export function getLanguage(id?: string | null): LearningLanguage | undefined {
  if (!id) return undefined;
  return LEARNING_LANGUAGES.find((l) => l.id === id);
}
