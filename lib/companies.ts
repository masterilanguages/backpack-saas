import type { Company, CompanyId } from "./types";
import { masteriData } from "./mock/masteri";

export const COMPANIES: Record<CompanyId, Company> = {
  masteri: {
    id: "masteri",
    name: "Masteri Languages",
    tagline: "1-on-1 language coaching",
    industry: "Education",
    currency: "USD",
    color: "#0d9488",
    initials: "ML",
    labels: {
      leads: "Leads",
      clients: "Students",
      projects: "Lessons",
      tasks: "Homework & Tasks",
      team: "Coaches",
    },
    modules: [
      { id: "curriculum", label: "Curriculum" },
      { id: "vocabulary", label: "Vocabulary" },
      { id: "mnemonics", label: "Mnemonics" },
      { id: "progress", label: "Progress" },
      { id: "landing-page", label: "Website" },
    ],
    clientMetaColumns: [
      { key: "language", header: "Language" },
      { key: "level", header: "Level" },
    ],
    data: masteriData,
  },
};

export const COMPANY_LIST: Company[] = Object.values(COMPANIES);

export function getCompany(companyId: string): Company | undefined {
  return COMPANIES[companyId as CompanyId];
}

export function isCompanyId(id: string): id is CompanyId {
  return id in COMPANIES;
}
