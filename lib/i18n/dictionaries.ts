// UI (interface) language dictionaries for the student portal.
//
// IMPORTANT: this is the *interface* language (the language the menus/buttons are
// in), which is SEPARATE from the *learning* language (userProfile.language, what
// the student is studying). A student can learn Hebrew while reading a Spanish UI.
//
// PILOT SCOPE: sidebar navigation + the Dashboard. Add more namespaces/pages as
// the rollout continues. Missing keys fall back to English (see UILanguage.tsx).

export type UILang = "en" | "es";

export const UI_LANGUAGES: { id: UILang; label: string; emoji: string }[] = [
  { id: "en", label: "English", emoji: "🇺🇸" },
  { id: "es", label: "Español", emoji: "🇪🇸" },
];

export const DICT = {
  en: {
    nav: {
      dashboard: "Dashboard",
      schedule: "Schedule",
      lessons: "Lessons",
      practice: "Practice",
      backpack: "Backpack",
      journal: "Journal",
      library: "Library",
      progress: "Progress",
      settings: "Settings",
      signOut: "Sign out",
    },
    dashboard: {
      hiThere: "Hi there!",
      hiName: "Hi, {name}!",
      dayOf: "Day {n} of 100",
      streak: "{n} day streak",
      continue: "Continue",
      session: "Session {n}",
    },
    ui: {
      interface: "Interface language",
    },
  },
  es: {
    nav: {
      dashboard: "Inicio",
      schedule: "Agenda",
      lessons: "Lecciones",
      practice: "Práctica",
      backpack: "Mochila",
      journal: "Diario",
      library: "Biblioteca",
      progress: "Progreso",
      settings: "Ajustes",
      signOut: "Cerrar sesión",
    },
    dashboard: {
      hiThere: "¡Hola!",
      hiName: "¡Hola, {name}!",
      dayOf: "Día {n} de 100",
      streak: "racha de {n} días",
      continue: "Continuar",
      session: "Sesión {n}",
    },
    ui: {
      interface: "Idioma de la interfaz",
    },
  },
} as const;
