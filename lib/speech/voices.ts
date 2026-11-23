// Platform voice registry. One row per learning-language id (lib/learningLanguages).
// Adding a language later is a new row: the listen API and SpeakButton pick it
// up without further UI changes. Hebrew is he-IL, modern Israeli.

export type VoiceProfile = {
  /** Learning-language id used across Backpack ("hebrew", "spanish", …). */
  language: string;
  /** BCP-47 locale the engines speak. */
  locale: string;
  /** Azure neural voice. Hebrew default is the native Israeli female voice. */
  azure: string;
  /** Google Cloud TTS voice (WaveNet where Neural2 has no Hebrew). */
  google: string;
  /** ElevenLabs `language_code` (ISO 639-1). */
  eleven: string;
};

export const VOICE_PROFILES: VoiceProfile[] = [
  { language: "hebrew", locale: "he-IL", azure: "he-IL-HilaNeural", google: "he-IL-Wavenet-A", eleven: "he" },
  { language: "english", locale: "en-US", azure: "en-US-JennyNeural", google: "en-US-Neural2-F", eleven: "en" },
  { language: "spanish", locale: "es-ES", azure: "es-ES-ElviraNeural", google: "es-ES-Neural2-A", eleven: "es" },
  { language: "french", locale: "fr-FR", azure: "fr-FR-DeniseNeural", google: "fr-FR-Neural2-A", eleven: "fr" },
  { language: "portuguese", locale: "pt-BR", azure: "pt-BR-FranciscaNeural", google: "pt-BR-Neural2-A", eleven: "pt" },
  { language: "italian", locale: "it-IT", azure: "it-IT-ElsaNeural", google: "it-IT-Neural2-A", eleven: "it" },
];

const ALIASES: Record<string, string> = {
  he: "hebrew", iw: "hebrew", heb: "hebrew", hebrew: "hebrew",
  en: "english", eng: "english", english: "english",
  es: "spanish", spa: "spanish", spanish: "spanish",
  fr: "french", fra: "french", french: "french",
  pt: "portuguese", por: "portuguese", portuguese: "portuguese",
  it: "italian", ita: "italian", italian: "italian",
};

/** Learning-language id, or "" when this platform build has no profile. */
export function canonicalLanguage(language?: string | null): string {
  const key = String(language || "").trim().toLowerCase().split(/[-_]/)[0];
  return ALIASES[key] || ALIASES[String(language || "").trim().toLowerCase()] || "";
}

export function voiceProfile(language?: string | null, locale?: string | null): VoiceProfile | null {
  const id = canonicalLanguage(language) || canonicalLanguage(locale);
  const row = VOICE_PROFILES.find((v) => v.language === id);
  if (!row) return null;
  if (locale && /^[a-z]{2}-[A-Z]{2}$/.test(locale)) return { ...row, locale };
  return row;
}

export function speechLocale(language?: string | null, locale?: string | null): string {
  return voiceProfile(language, locale)?.locale || "en-US";
}
