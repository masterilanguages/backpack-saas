const LYRICS_CONTAINER = /<div\b[^>]*\bclass\s*=\s*(["'])[^"']*\blyric-original\b[^"']*\1[^>]*>([\s\S]*?)<\/div>/i;

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_match, code: string) => {
      const n = code.toLowerCase().startsWith("x") ? parseInt(code.slice(1), 16) : parseInt(code, 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : "";
    });
}

/** Extracts only the visible original-lyrics lines from a Letras.com page. */
export function extractLetrasLyrics(html: string): string[] {
  const match = html.match(LYRICS_CONTAINER);
  if (!match) return [];

  return decodeHtml(match[2])
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n")
    .replace(/<p\b[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .filter(Boolean);
}

export function isLetrasUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "letras.com" || url.hostname === "www.letras.com");
  } catch {
    return false;
  }
}
