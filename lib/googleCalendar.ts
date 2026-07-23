// Lightweight Google Calendar integration: build a "render an event" URL that
// opens Google Calendar's event editor with everything pre-filled. No OAuth, no
// stored tokens, no API — the user just clicks, reviews, and saves into their
// own calendar. See https://calendar.google.com/calendar/render?action=TEMPLATE
//
// If the session has no date/time, we still return a valid link (Google opens
// the editor on the current day and the user picks a time).

export interface GCalLink {
  label?: string | null;
  url?: string | null;
}

export interface GCalSession {
  title?: string | null;
  notes?: string | null;
  links?: GCalLink[] | null;
  scheduledAt?: string | null; // ISO timestamp
  durationMinutes?: number | null;
}

/** Format a Date as Google's compact UTC stamp: YYYYMMDDTHHMMSSZ. */
function toGCalUTC(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Compose the event description from notes + any links. */
function buildDetails(session: GCalSession): string {
  const parts: string[] = [];
  if (session.notes?.trim()) parts.push(session.notes.trim());
  const links = (session.links ?? []).filter((l) => l?.url?.trim());
  if (links.length > 0) {
    parts.push(
      "Links:\n" +
        links.map((l) => `• ${l.label?.trim() || l.url}: ${l.url}`).join("\n")
    );
  }
  return parts.join("\n\n");
}

/**
 * Build an "Add to Google Calendar" URL for a session.
 * Returns null only if there is nothing worth adding (no title at all).
 */
export function buildGoogleCalendarUrl(session: GCalSession): string | null {
  const title = session.title?.trim() || "Coaching session";

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
  });

  const details = buildDetails(session);
  if (details) params.set("details", details);

  if (session.scheduledAt) {
    const start = new Date(session.scheduledAt);
    if (!Number.isNaN(start.getTime())) {
      const minutes = session.durationMinutes && session.durationMinutes > 0 ? session.durationMinutes : 60;
      const end = new Date(start.getTime() + minutes * 60_000);
      params.set("dates", `${toGCalUTC(start)}/${toGCalUTC(end)}`);
    }
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Value for a datetime-local <input> (YYYY-MM-DDTHH:mm) in LOCAL time, from a
 * stored ISO timestamp. Returns "" when there is no date.
 */
export function isoToLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Inverse of isoToLocalInput: datetime-local value -> ISO string (or null). */
export function localInputToIso(value?: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
