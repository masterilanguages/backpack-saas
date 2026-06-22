import type { Tone } from "./types";

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function formatCurrency(amount: number, currency: "USD" | "ILS" = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Maps every status string used in mock data to a badge tone. */
const STATUS_TONES: Record<string, Tone> = {
  // leads
  New: "blue",
  Contacted: "purple",
  Qualified: "orange",
  "Proposal Sent": "yellow",
  Won: "green",
  Lost: "red",
  // clients / subscriptions
  Active: "green",
  Paused: "yellow",
  Churned: "red",
  Trial: "blue",
  "Past Due": "orange",
  Cancelled: "red",
  // tasks
  "To Do": "gray",
  "In Progress": "blue",
  Done: "green",
  Blocked: "red",
  // priority
  Low: "gray",
  Medium: "yellow",
  High: "red",
  // payments / finances
  Paid: "green",
  "Deposit Paid": "blue",
  Pending: "yellow",
  Overdue: "red",
  Income: "green",
  Expense: "gray",
  // projects / events
  Confirmed: "green",
  "In Planning": "yellow",
  Completed: "green",
  Discovery: "purple",
  Review: "yellow",
  Delivered: "green",
  "On Hold": "orange",
  // lessons
  Scheduled: "blue",
  "No-Show": "red",
  // campaigns
  Live: "green",
  Ended: "gray",
  // curriculum
  Published: "green",
  Draft: "yellow",
  // team
  Freelance: "blue",
  Inactive: "gray",
};

export function statusTone(status: string): Tone {
  return STATUS_TONES[status] ?? "gray";
}
