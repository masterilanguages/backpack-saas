import type { ReactNode } from "react";

export type CompanyId = "masteri";

export type Tone = "green" | "yellow" | "red" | "blue" | "purple" | "gray" | "orange";

export interface NavModule {
  id: string;
  label: string;
}

export interface CompanyLabels {
  leads: string;
  clients: string;
  projects: string;
  tasks: string;
  team: string;
}

export interface Lead {
  id: string;
  name: string;
  contact: string;
  email: string;
  source: string;
  value: number;
  status: "New" | "Contacted" | "Qualified" | "Proposal Sent" | "Won" | "Lost";
  owner: string;
  createdAt: string;
}

export interface Client {
  id: string;
  name: string;
  contact: string;
  email: string;
  phone: string;
  since: string;
  totalValue: number;
  status: "Active" | "Paused" | "Churned";
  /** Company-specific extras, e.g. language/level for Masteri students */
  meta?: Record<string, string>;
}

export interface Task {
  id: string;
  title: string;
  assignee: string;
  related: string;
  dueDate: string;
  priority: "Low" | "Medium" | "High";
  status: "To Do" | "In Progress" | "Done" | "Blocked";
}

export interface Transaction {
  id: string;
  date: string;
  description: string;
  category: string;
  type: "Income" | "Expense";
  amount: number;
  status: "Paid" | "Pending" | "Overdue";
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  status: "Active" | "Freelance" | "Inactive";
  /** e.g. languages taught, instruments played */
  speciality?: string;
}

export interface Note {
  id: string;
  title: string;
  body: string;
  author: string;
  date: string;
  pinned?: boolean;
}

export interface FileRecord {
  id: string;
  name: string;
  type: "PDF" | "Image" | "Doc" | "Sheet" | "Video" | "Audio" | "Archive";
  size: string;
  owner: string;
  modified: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time?: string;
  type: string;
}

export interface Stat {
  label: string;
  value: string;
  change?: string;
  trend?: "up" | "down" | "flat";
}

/* ---------- Company-specific record types ---------- */

// Avinu Events
export interface AvinuEvent {
  id: string;
  name: string;
  date: string;
  venue: string;
  client: string;
  packageSold: string;
  crew: string[]; // DJ / singer / musicians assigned
  equipment: { item: string; checked: boolean }[];
  paymentStatus: "Paid" | "Deposit Paid" | "Pending" | "Overdue";
  grossRevenue: number;
  producerCost: number;
  status: "Confirmed" | "In Planning" | "Completed" | "Cancelled";
  timeline: { time: string; activity: string }[];
}

export interface AvinuPackage {
  id: string;
  name: string;
  includes: string;
  price: number;
  timesSold: number;
}

// Masteri Languages
export interface MasteriLesson {
  id: string;
  student: string;
  coach: string;
  language: string;
  level: string;
  date: string;
  time: string;
  topic: string;
  status: "Scheduled" | "Completed" | "Cancelled" | "No-Show";
}

export interface CurriculumUnit {
  id: string;
  language: string;
  level: string;
  unit: string;
  topics: string;
  lessonsCount: number;
  status: "Published" | "Draft";
}

export interface VocabularyItem {
  id: string;
  word: string;
  translation: string;
  language: string;
  deck: string;
  mastery: number; // 0-100
}

export interface Mnemonic {
  id: string;
  word: string;
  language: string;
  mnemonic: string;
  createdBy: string;
}

export interface StudentProgress {
  id: string;
  student: string;
  language: string;
  level: string;
  lessonsDone: number;
  lessonsTotal: number;
  vocabMastered: number;
  homeworkRate: number; // percent submitted
  subscription: "Active" | "Trial" | "Past Due" | "Cancelled";
}

// Bayena
export interface BayenaProject {
  id: string;
  name: string;
  client: string;
  service: string;
  deadline: string;
  budget: number;
  status: "Discovery" | "In Progress" | "Review" | "Delivered" | "On Hold";
}

export interface Campaign {
  id: string;
  name: string;
  client: string;
  channel: string;
  budget: number;
  spend: number;
  leadsGenerated: number;
  status: "Live" | "Scheduled" | "Paused" | "Ended";
}

export interface BrandAsset {
  id: string;
  name: string;
  client: string;
  type: "Logo" | "Guideline" | "Template" | "Font" | "Illustration";
  version: string;
  updated: string;
}

export interface PipelineDeal {
  id: string;
  name: string;
  value: number;
  owner: string;
}

export interface PipelineStage {
  stage: string;
  deals: PipelineDeal[];
}

/* ---------- Company definition ---------- */

export interface CompanyData {
  leads: Lead[];
  clients: Client[];
  tasks: Task[];
  transactions: Transaction[];
  team: TeamMember[];
  notes: Note[];
  files: FileRecord[];
  calendar: CalendarEvent[];
  stats: Stat[];
}

export interface Company {
  id: CompanyId;
  name: string;
  tagline: string;
  industry: string;
  currency: "USD" | "ILS";
  color: string; // tailwind-friendly hex used for accents
  initials: string;
  labels: CompanyLabels;
  /** Extra company-specific modules shown in the sidebar */
  modules: NavModule[];
  /** Extra columns for the clients table, read from Client.meta */
  clientMetaColumns?: { key: string; header: string }[];
  data: CompanyData;
}

export type IconName =
  | "dashboard"
  | "building"
  | "leads"
  | "clients"
  | "projects"
  | "tasks"
  | "calendar"
  | "notes"
  | "files"
  | "team"
  | "finances"
  | "settings"
  | "module"
  | "email"
  | "student";

export interface ColumnDef<T> {
  key: string;
  header: string;
  className?: string;
  render?: (row: T) => ReactNode;
}
