// Server-side neural TTS for every school. Provider order is quality for
// Hebrew first: Azure he-IL neural, then Google he-IL WaveNet, then ElevenLabs
// multilingual (already used in this repo for transcription). No key → null,
// and the browser falls back to speechSynthesis. See docs/speech.md.

import { createHash } from "crypto";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { voiceProfile, type VoiceProfile } from "./voices";

export type SynthResult = {
  audio: Uint8Array;
  contentType: string;
  provider: string;
  voice: string;
};

const CACHE_DIR = path.join(os.tmpdir(), "backpack-speech");

const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function hebrewOverride(name: string, fallback: string, language: string): string {
  if (language === "hebrew" && process.env[name]) return process.env[name] as string;
  return fallback;
}

async function readCache(file: string): Promise<Uint8Array | null> {
  try {
    const audio = await fs.readFile(file);
    return audio.length ? audio : null;
  } catch {
    return null;
  }
}

async function remember(file: string, audio: Uint8Array) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(file, audio);
}

async function fromProvider(
  id: string,
  voice: string,
  locale: string,
  text: string,
  load: () => Promise<Uint8Array | null>,
): Promise<SynthResult | null> {
  const key = createHash("sha256").update(`${id}|${voice}|${locale}|${text}`).digest("hex");
  const file = path.join(CACHE_DIR, `${key}.mp3`);
  const cached = await readCache(file);
  if (cached) return { audio: cached, contentType: "audio/mpeg", provider: id, voice };
  const audio = await load();
  if (!audio?.length) return null;
  await remember(file, audio);
  return { audio, contentType: "audio/mpeg", provider: id, voice };
}

async function azure(text: string, profile: VoiceProfile, voice: string): Promise<Uint8Array | null> {
  const key = process.env.AZURE_SPEECH_KEY;
  if (!key) return null;
  const region = process.env.AZURE_SPEECH_REGION || "eastus";
  const ssml = `<speak version="1.0" xml:lang="${profile.locale}"><voice name="${escapeXml(voice)}">${escapeXml(text)}</voice></speak>`;
  const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
      "User-Agent": "backpack-speech",
    },
    body: ssml,
  });
  if (!res.ok) throw new Error(`Azure speech ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function google(text: string, profile: VoiceProfile, voice: string): Promise<Uint8Array | null> {
  const key = process.env.GOOGLE_TTS_API_KEY;
  if (!key) return null;
  const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: profile.locale, name: voice },
      audioConfig: { audioEncoding: "MP3" },
    }),
  });
  if (!res.ok) throw new Error(`Google speech ${res.status}`);
  const data = await res.json();
  if (!data?.audioContent) return null;
  return Buffer.from(data.audioContent, "base64");
}

async function eleven(text: string, profile: VoiceProfile): Promise<Uint8Array | null> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return null;
  const voice = process.env.ELEVENLABS_TTS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";
  const model = process.env.ELEVENLABS_TTS_MODEL || "eleven_multilingual_v2";
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
    method: "POST",
    headers: {
      "xi-api-key": key,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({ text, model_id: model, language_code: profile.eleven }),
  });
  if (!res.ok) throw new Error(`ElevenLabs speech ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Neural audio for a learning language, or null when no provider key is set.
 * Cached on disk by provider + voice + text so repeated listens are stable.
 */
export async function synthesizeSpeech(
  text: string,
  language?: string | null,
  locale?: string | null,
): Promise<SynthResult | null> {
  const profile = voiceProfile(language, locale);
  if (!profile) return null;
  const clean = String(text || "").replace(/\s+/g, " ").trim().slice(0, 800);
  if (!clean) return null;

  const azureVoice = hebrewOverride("AZURE_SPEECH_VOICE", profile.azure, profile.language);
  const googleVoice = hebrewOverride("GOOGLE_TTS_VOICE", profile.google, profile.language);
  const elevenVoice = process.env.ELEVENLABS_TTS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";

  const run = async (id: string, voice: string, load: () => Promise<Uint8Array | null>) => {
    try {
      return await fromProvider(id, voice, profile.locale, clean, load);
    } catch (err) {
      console.warn(`[speech] ${id} failed`, err);
      return null;
    }
  };

  // Sequential: a configured provider that errors should not be cached,
  // and we should not call every vendor on the happy path.
  const azureHit = await run("azure", azureVoice, () => azure(clean, profile, azureVoice));
  if (azureHit) return azureHit;
  const googleHit = await run("google", googleVoice, () => google(clean, profile, googleVoice));
  if (googleHit) return googleHit;
  return run("elevenlabs", elevenVoice, () => eleven(clean, profile));
}
