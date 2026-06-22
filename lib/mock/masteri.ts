import type {
  CompanyData,
  CurriculumUnit,
  MasteriLesson,
  Mnemonic,
  StudentProgress,
  VocabularyItem,
} from "../types";

export const masteriLessons: MasteriLesson[] = [
  { id: "LS-901", student: "Sarah Klein", coach: "Yael Mor", language: "Hebrew", level: "B1", date: "2026-06-15", time: "17:00", topic: "Past tense — binyan Pa'al review", status: "Scheduled" },
  { id: "LS-902", student: "James Carter", coach: "Yael Mor", language: "Hebrew", level: "A2", date: "2026-06-15", time: "19:00", topic: "Market vocabulary + roleplay", status: "Scheduled" },
  { id: "LS-903", student: "Lucia Romano", coach: "Daniel Peres", language: "Spanish", level: "B2", date: "2026-06-16", time: "16:00", topic: "Subjunctive triggers", status: "Scheduled" },
  { id: "LS-904", student: "Sarah Klein", coach: "Yael Mor", language: "Hebrew", level: "B1", date: "2026-06-10", time: "17:00", topic: "Construct state (smichut)", status: "Completed" },
  { id: "LS-905", student: "Tom Becker", coach: "Anna Weiss", language: "German", level: "A1", date: "2026-06-11", time: "18:00", topic: "Dative case introduction", status: "Completed" },
  { id: "LS-906", student: "Emily Zhao", coach: "Daniel Peres", language: "Spanish", level: "A2", date: "2026-06-11", time: "20:00", topic: "Preterite vs imperfect", status: "No-Show" },
  { id: "LS-907", student: "Rachel Adams", coach: "Yael Mor", language: "Hebrew", level: "A1", date: "2026-06-12", time: "16:00", topic: "Alphabet review + reading drills", status: "Completed" },
  { id: "LS-908", student: "Tom Becker", coach: "Anna Weiss", language: "German", level: "A1", date: "2026-06-18", time: "18:00", topic: "Modal verbs", status: "Scheduled" },
];

export const masteriCurriculum: CurriculumUnit[] = [
  { id: "CU-01", language: "Hebrew", level: "A1", unit: "Unit 1 — Foundations", topics: "Alphabet, nikud, greetings, self-introduction", lessonsCount: 10, status: "Published" },
  { id: "CU-02", language: "Hebrew", level: "A2", unit: "Unit 4 — Daily Life", topics: "Shopping, directions, present tense verbs", lessonsCount: 12, status: "Published" },
  { id: "CU-03", language: "Hebrew", level: "B1", unit: "Unit 7 — Storytelling", topics: "Past tense binyanim, time expressions, smichut", lessonsCount: 14, status: "Published" },
  { id: "CU-04", language: "Spanish", level: "A2", unit: "Unit 3 — Travel", topics: "Preterite, transport, hotel dialogues", lessonsCount: 10, status: "Published" },
  { id: "CU-05", language: "Spanish", level: "B2", unit: "Unit 8 — Opinions", topics: "Subjunctive, debate phrases, formal writing", lessonsCount: 12, status: "Draft" },
  { id: "CU-06", language: "German", level: "A1", unit: "Unit 2 — People & Things", topics: "Articles, cases, plurals, modal verbs", lessonsCount: 11, status: "Published" },
];

export const masteriVocabulary: VocabularyItem[] = [
  { id: "V-01", word: "שולחן (shulchan)", translation: "table", language: "Hebrew", deck: "Home & Objects", mastery: 92 },
  { id: "V-02", word: "לִקְנוֹת (liknot)", translation: "to buy", language: "Hebrew", deck: "Verbs A2", mastery: 78 },
  { id: "V-03", word: "אֶתְמוֹל (etmol)", translation: "yesterday", language: "Hebrew", deck: "Time Words", mastery: 85 },
  { id: "V-04", word: "aunque", translation: "although", language: "Spanish", deck: "Connectors B2", mastery: 64 },
  { id: "V-05", word: "el ayuntamiento", translation: "city hall", language: "Spanish", deck: "City & Travel", mastery: 47 },
  { id: "V-06", word: "die Verabredung", translation: "appointment", language: "German", deck: "Daily Life A1", mastery: 55 },
  { id: "V-07", word: "מַדְרֵגוֹת (madregot)", translation: "stairs", language: "Hebrew", deck: "Home & Objects", mastery: 71 },
  { id: "V-08", word: "sin embargo", translation: "however", language: "Spanish", deck: "Connectors B2", mastery: 82 },
];

export const masteriMnemonics: Mnemonic[] = [
  { id: "M-01", word: "שולחן (shulchan)", language: "Hebrew", mnemonic: "A SHOal of fish having LUNCH on a table.", createdBy: "Yael Mor" },
  { id: "M-02", word: "לִקְנוֹת (liknot)", language: "Hebrew", mnemonic: "You LIKe to NOTe down everything you buy.", createdBy: "Sarah Klein" },
  { id: "M-03", word: "die Verabredung", language: "German", mnemonic: "You VERify A RED DUNGeon before the appointment.", createdBy: "Anna Weiss" },
  { id: "M-04", word: "aunque", language: "Spanish", mnemonic: "AUNty KEeps arguing — although she's usually right.", createdBy: "Daniel Peres" },
  { id: "M-05", word: "מַדְרֵגוֹת (madregot)", language: "Hebrew", mnemonic: "MAD REGGAE played on every stair step.", createdBy: "James Carter" },
];

export const masteriProgress: StudentProgress[] = [
  { id: "P-01", student: "Louis Berlin", language: "Hebrew", level: "B1", lessonsDone: 34, lessonsTotal: 48, vocabMastered: 612, homeworkRate: 95, subscription: "Active" },
];

export const masteriData: CompanyData = {
  stats: [
    { label: "Active Students", value: "24", change: "+3 this month", trend: "up" },
    { label: "Lessons This Week", value: "31", change: "92% attendance", trend: "up" },
    { label: "MRR", value: "$4,860", change: "+6% vs May", trend: "up" },
    { label: "Past Due Subscriptions", value: "2", change: "follow-up needed", trend: "down" },
  ],
  leads: [
    { id: "L-401", name: "Hebrew for relocation", contact: "Michael Ross", email: "m.ross@outlook.com", source: "Google Ads", value: 1440, status: "Qualified", owner: "Yael", createdAt: "2026-06-05" },
    { id: "L-402", name: "Spanish conversation course", contact: "Priya Nair", email: "priya.nair@gmail.com", source: "Instagram", value: 960, status: "New", owner: "Daniel", createdAt: "2026-06-09" },
    { id: "L-403", name: "Corporate Hebrew (5 employees)", contact: "Laura Kim — Nexion HR", email: "laura@nexion.com", source: "Referral", value: 7200, status: "Proposal Sent", owner: "Mark", createdAt: "2026-06-02" },
    { id: "L-404", name: "German A1 intensive", contact: "Carlos Mendes", email: "carlosm@gmail.com", source: "Website", value: 1200, status: "Contacted", owner: "Anna", createdAt: "2026-06-08" },
    { id: "L-405", name: "Hebrew reading bootcamp", contact: "Deborah Stein", email: "dstein@yahoo.com", source: "Facebook Group", value: 540, status: "Won", owner: "Yael", createdAt: "2026-05-26" },
    { id: "L-406", name: "Teen Spanish tutoring", contact: "Robert Fox", email: "rfox@gmail.com", source: "Google Ads", value: 880, status: "Lost", owner: "Daniel", createdAt: "2026-05-18" },
  ],
  clients: [
    { id: "C-401", name: "Sarah Klein", contact: "Sarah Klein", email: "sarah.klein@gmail.com", phone: "+1 917-555-0143", since: "2025-09-12", totalValue: 3840, status: "Active", meta: { language: "Hebrew", level: "B1" } },
    { id: "C-402", name: "James Carter", contact: "James Carter", email: "jcarter@gmail.com", phone: "+44 7700 900123", since: "2026-01-20", totalValue: 1920, status: "Active", meta: { language: "Hebrew", level: "A2" } },
    { id: "C-403", name: "Lucia Romano", contact: "Lucia Romano", email: "lucia.romano@gmail.com", phone: "+39 333 555 0188", since: "2025-06-30", totalValue: 4500, status: "Active", meta: { language: "Spanish", level: "B2" } },
    { id: "C-404", name: "Tom Becker", contact: "Tom Becker", email: "tbecker@gmx.de", phone: "+49 151 5550 192", since: "2026-05-14", totalValue: 240, status: "Active", meta: { language: "German", level: "A1" } },
    { id: "C-405", name: "Emily Zhao", contact: "Emily Zhao", email: "emily.zhao@gmail.com", phone: "+1 415-555-0177", since: "2025-12-03", totalValue: 2160, status: "Paused", meta: { language: "Spanish", level: "A2" } },
    { id: "C-406", name: "Rachel Adams", contact: "Rachel Adams", email: "radams@gmail.com", phone: "+1 646-555-0102", since: "2026-04-28", totalValue: 720, status: "Active", meta: { language: "Hebrew", level: "A1" } },
  ],
  tasks: [
    { id: "T-401", title: "Grade Sarah's smichut worksheet", assignee: "Yael Mor", related: "Sarah Klein — Hebrew B1", dueDate: "2026-06-13", priority: "High", status: "In Progress" },
    { id: "T-402", title: "Prepare subjunctive drill deck", assignee: "Daniel Peres", related: "Lucia Romano — Spanish B2", dueDate: "2026-06-15", priority: "Medium", status: "To Do" },
    { id: "T-403", title: "Send Emily payment reminder", assignee: "Mark", related: "Billing", dueDate: "2026-06-12", priority: "High", status: "To Do" },
    { id: "T-404", title: "Record dative case explainer video", assignee: "Anna Weiss", related: "German A1 curriculum", dueDate: "2026-06-18", priority: "Medium", status: "In Progress" },
    { id: "T-405", title: "Review homework — market vocabulary", assignee: "Yael Mor", related: "James Carter — Hebrew A2", dueDate: "2026-06-11", priority: "Low", status: "Done" },
    { id: "T-406", title: "Finalize Spanish B2 Unit 8 curriculum", assignee: "Daniel Peres", related: "Curriculum", dueDate: "2026-06-25", priority: "Medium", status: "Blocked" },
  ],
  transactions: [
    { id: "F-601", date: "2026-06-10", description: "Sarah Klein — monthly subscription", category: "Subscriptions", type: "Income", amount: 320, status: "Paid" },
    { id: "F-602", date: "2026-06-10", description: "Lucia Romano — monthly subscription", category: "Subscriptions", type: "Income", amount: 360, status: "Paid" },
    { id: "F-603", date: "2026-06-09", description: "Emily Zhao — monthly subscription", category: "Subscriptions", type: "Income", amount: 320, status: "Overdue" },
    { id: "F-604", date: "2026-06-08", description: "Coach payout — Yael Mor (May)", category: "Coach Payouts", type: "Expense", amount: 1450, status: "Paid" },
    { id: "F-605", date: "2026-06-08", description: "Coach payout — Daniel Peres (May)", category: "Coach Payouts", type: "Expense", amount: 1180, status: "Paid" },
    { id: "F-606", date: "2026-06-07", description: "Google Ads — June budget", category: "Marketing", type: "Expense", amount: 600, status: "Paid" },
    { id: "F-607", date: "2026-06-05", description: "Tom Becker — trial conversion invoice", category: "Subscriptions", type: "Income", amount: 240, status: "Pending" },
    { id: "F-608", date: "2026-06-03", description: "Zoom + LMS tooling", category: "Software", type: "Expense", amount: 145, status: "Paid" },
  ],
  team: [
    { id: "TM-41", name: "Yael Mor", role: "Senior Hebrew Coach", email: "yael@masteri.io", phone: "052-440-1923", status: "Active", speciality: "Hebrew A1–C1, exam prep" },
    { id: "TM-42", name: "Daniel Peres", role: "Spanish Coach", email: "daniel@masteri.io", phone: "+34 612 555 044", status: "Active", speciality: "Spanish A1–B2, conversation" },
    { id: "TM-43", name: "Anna Weiss", role: "German Coach", email: "anna@masteri.io", phone: "+49 160 5550 233", status: "Freelance", speciality: "German A1–B1" },
    { id: "TM-44", name: "Noa Shani", role: "Curriculum Designer", email: "noa@masteri.io", phone: "054-119-8852", status: "Active", speciality: "Curriculum, mnemonics method" },
  ],
  notes: [
    { id: "N-41", title: "Mnemonics method results", body: "Students using mnemonic decks retain ~30% more vocabulary at 2-week review. Roll the method into all A1 curricula.", author: "Noa Shani", date: "2026-06-09", pinned: true },
    { id: "N-42", title: "Corporate lead — Nexion", body: "They want 5 employees at Hebrew A1, twice a week, starting July. Needs group pricing tier — draft proposal sent June 2.", author: "Mark", date: "2026-06-04", pinned: true },
    { id: "N-43", title: "Emily Zhao retention risk", body: "Missed 2 lessons and payment is past due. Daniel will offer a schedule change + 1 free catch-up lesson.", author: "Daniel Peres", date: "2026-06-11" },
    { id: "N-44", title: "Summer intensive idea", body: "4-week Hebrew reading bootcamp in August. Cap at 8 students, $540 each. Validate with waitlist email first.", author: "Yael Mor", date: "2026-06-06" },
  ],
  files: [
    { id: "FL-41", name: "Hebrew-B1-Unit7-Workbook.pdf", type: "PDF", size: "2.4 MB", owner: "Noa Shani", modified: "2026-06-09" },
    { id: "FL-42", name: "Smichut-Drills-Audio.mp3", type: "Audio", size: "18 MB", owner: "Yael Mor", modified: "2026-06-08" },
    { id: "FL-43", name: "Spanish-Subjunctive-Slides.pdf", type: "PDF", size: "5.6 MB", owner: "Daniel Peres", modified: "2026-06-07" },
    { id: "FL-44", name: "Student-Progress-Template.xlsx", type: "Sheet", size: "56 KB", owner: "Noa Shani", modified: "2026-06-01" },
    { id: "FL-45", name: "Dative-Case-Explainer.mp4", type: "Video", size: "230 MB", owner: "Anna Weiss", modified: "2026-05-30" },
    { id: "FL-46", name: "Nexion-Corporate-Proposal.pdf", type: "PDF", size: "890 KB", owner: "Mark", modified: "2026-06-02" },
  ],
  calendar: [
    { id: "CA-41", title: "Sarah Klein — Hebrew B1", date: "2026-06-15", time: "17:00", type: "Lesson" },
    { id: "CA-42", title: "James Carter — Hebrew A2", date: "2026-06-15", time: "19:00", type: "Lesson" },
    { id: "CA-43", title: "Lucia Romano — Spanish B2", date: "2026-06-16", time: "16:00", type: "Lesson" },
    { id: "CA-44", title: "Tom Becker — German A1", date: "2026-06-18", time: "18:00", type: "Lesson" },
    { id: "CA-45", title: "Coach sync — curriculum review", date: "2026-06-17", time: "11:00", type: "Meeting" },
    { id: "CA-46", title: "Nexion proposal follow-up call", date: "2026-06-16", time: "14:00", type: "Sales" },
  ],
};
