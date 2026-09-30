import { base44 } from "@/api/base44Client";

export interface LetrasLyricsResult {
  source_url: string;
  lines: string[];
  text: string;
}

/** Imports the original lyric lines for a user-selected Letras.com song page. */
export async function fetchLetrasLyrics(url: string): Promise<LetrasLyricsResult> {
  const result = await base44.functions.invoke("fetchLetrasLyrics", { url });
  if (result?.error) throw new Error(result.error.message || "Could not import lyrics.");
  if (result?.data?.error) throw new Error(result.data.error);
  return result?.data as LetrasLyricsResult;
}
