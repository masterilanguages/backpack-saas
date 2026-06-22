export type LandingFeature = {
  title: string;
  description: string;
};

export type LandingPageContent = {
  eyebrow: string;
  headline: string;
  subheadline: string;
  primaryCtaText: string;
  primaryCtaHref: string;
  secondaryCtaText: string;
  secondaryCtaHref: string;
  features: LandingFeature[];
  accentColor: string;
};

export const LANDING_PAGE_STORAGE_KEY = "website-content:masteri";

export const DEFAULT_LANDING_PAGE: LandingPageContent = {
  eyebrow: "Masteri Languages",
  headline: "Speak with confidence — one coach, one plan",
  subheadline:
    "Personal 1-on-1 language coaching in Hebrew, Spanish, and German. Structured curriculum, real conversation.",
  primaryCtaText: "Book a trial lesson",
  primaryCtaHref: "mailto:hello@masteri.com",
  secondaryCtaText: "See how it works",
  secondaryCtaHref: "#method",
  features: [
    {
      title: "1-on-1 coaching",
      description: "Every lesson tailored to your level, goals, and schedule.",
    },
    {
      title: "Structured progress",
      description: "Curriculum, vocabulary decks, and homework you can actually finish.",
    },
    {
      title: "Real fluency",
      description: "Conversation-first method with mnemonics that stick.",
    },
  ],
  accentColor: "#0d9488",
};

export function loadLandingPage(): LandingPageContent {
  if (typeof window === "undefined") return DEFAULT_LANDING_PAGE;
  try {
    const raw = localStorage.getItem(LANDING_PAGE_STORAGE_KEY);
    if (!raw) return DEFAULT_LANDING_PAGE;
    return { ...DEFAULT_LANDING_PAGE, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_LANDING_PAGE;
  }
}

export function saveLandingPage(content: LandingPageContent) {
  localStorage.setItem(LANDING_PAGE_STORAGE_KEY, JSON.stringify(content));
}
