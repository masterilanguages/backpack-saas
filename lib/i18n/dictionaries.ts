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
      portal: "Student Portal",
      welcomeBack: "Welcome back, {name}.",
      welcomeBackNoName: "Welcome back.",
      leftOff: "Here's where you left off.",
      statStreak: "Streak",
      statStreakUnit: "days",
      statThisWeek: "This week",
      statThisWeekUnit: "hrs",
      statLevel: "Level",
      continueTitle: "Continue where you left off",
      lessonProgress: "Lesson {n} of {total} complete",
      continueLesson: "Continue lesson",
      upcoming: "Upcoming",
      noUpcoming: "No sessions booked yet.",
      bookSession: "Book a session",
    },
    ui: {
      interface: "Interface language",
    },
    settings: {
      title: "Settings",
      subtitle: "Manage your account and preferences.",
      interfaceLanguage: "Interface language",
      interfaceLanguageHint:
        "The language of the menus and buttons — separate from the language you're learning.",
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
      portal: "Portal del estudiante",
      welcomeBack: "Bienvenido de nuevo, {name}.",
      welcomeBackNoName: "Bienvenido de nuevo.",
      leftOff: "Aquí es donde lo dejaste.",
      statStreak: "Racha",
      statStreakUnit: "días",
      statThisWeek: "Esta semana",
      statThisWeekUnit: "hrs",
      statLevel: "Nivel",
      continueTitle: "Continúa donde lo dejaste",
      lessonProgress: "Lección {n} de {total} completada",
      continueLesson: "Continuar lección",
      upcoming: "Próximas",
      noUpcoming: "No hay sesiones reservadas.",
      bookSession: "Reservar una sesión",
    },
    ui: {
      interface: "Idioma de la interfaz",
    },
    settings: {
      title: "Ajustes",
      subtitle: "Administra tu cuenta y preferencias.",
      interfaceLanguage: "Idioma de la interfaz",
      interfaceLanguageHint:
        "El idioma de los menús y botones — distinto del idioma que estás aprendiendo.",
    },
  },
} as const;
