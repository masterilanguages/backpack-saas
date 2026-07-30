// youtubeSearch — real YouTube Data API v3 search for the in-shell library
// publish flow. Returns videos ordered by view count with exact stats.
//
// Requires the YOUTUBE_API_KEY secret. When it is not set, responds with
// { error: "no_api_key" } and the frontend falls back to LLM search, so the
// feature degrades gracefully instead of breaking.
//
// Response: { data: { videos: [{ title, youtube_id, channel, views, duration }] } }
import { handleCors, json } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";

const LANGUAGE_CODE: Record<string, string> = {
  hebrew: "he",
  english: "en",
  spanish: "es",
  french: "fr",
  portuguese: "pt",
  italian: "it",
};

// ISO-8601 duration (PT1H2M3S) -> "1:02:03" / "6:05".
function formatDuration(iso: string): string {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || "");
  if (!m) return "";
  const h = parseInt(m[1] || "0");
  const min = parseInt(m[2] || "0");
  const s = parseInt(m[3] || "0");
  const two = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${two(min)}:${two(s)}` : `${min}:${two(s)}`;
}

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  const auth = await requireUser(req);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  try {
    const body = await req.json().catch(() => ({}));
    const query = String(body?.query || "").trim();
    const language = String(body?.language || "").toLowerCase();
    if (!query) return json({ data: { videos: [], error: "query is required" } }, 400);

    const key = Deno.env.get("YOUTUBE_API_KEY");
    if (!key) return json({ data: { videos: [], error: "no_api_key" } });

    const relevanceLanguage = LANGUAGE_CODE[language] || language || undefined;

    // 1) Search for candidate videos.
    const searchParams = new URLSearchParams({
      key,
      part: "snippet",
      type: "video",
      maxResults: "15",
      q: query,
    });
    if (relevanceLanguage) searchParams.set("relevanceLanguage", relevanceLanguage);
    const searchResp = await fetch(`https://www.googleapis.com/youtube/v3/search?${searchParams}`);
    const searchData: any = await searchResp.json();
    if (!searchResp.ok) {
      return json({ data: { videos: [], error: searchData?.error?.message || `YouTube API error ${searchResp.status}` } });
    }
    const items: any[] = searchData?.items || [];
    const ids = items.map((i) => i?.id?.videoId).filter(Boolean);
    if (ids.length === 0) return json({ data: { videos: [] } });

    // 2) Fetch exact view counts + durations for those ids.
    const videosParams = new URLSearchParams({
      key,
      part: "statistics,contentDetails,snippet",
      id: ids.join(","),
    });
    const videosResp = await fetch(`https://www.googleapis.com/youtube/v3/videos?${videosParams}`);
    const videosData: any = await videosResp.json();
    if (!videosResp.ok) {
      return json({ data: { videos: [], error: videosData?.error?.message || `YouTube API error ${videosResp.status}` } });
    }

    const videos = (videosData?.items || [])
      .map((v: any) => ({
        youtube_id: v.id,
        title: v?.snippet?.title || "",
        channel: v?.snippet?.channelTitle || "",
        views: parseInt(v?.statistics?.viewCount || "0") || 0,
        duration: formatDuration(v?.contentDetails?.duration || ""),
      }))
      .sort((a: any, b: any) => b.views - a.views)
      .slice(0, 10);

    return json({ data: { videos } });
  } catch (error: any) {
    return json({ data: { videos: [], error: error?.message || "Search failed" } });
  }
});
