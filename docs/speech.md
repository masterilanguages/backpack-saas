# Speech (platform)

Backpack schools share one speech layer. It is not tied to a single tenant.
Hebrew is the first language with a romanizer and a native voice; the same
API accepts every learning-language id (`hebrew`, `english`, `spanish`,
`french`, `portuguese`, `italian`). Adding a language is a row in
`lib/speech/voices.ts` plus, when the script needs it, a romanizer next to
`lib/speech/hebrewRomanization.ts`.

A tenant app can call the same shapes:

```
POST /api/speech/tts
{ "text": "שלום", "language": "hebrew", "locale": "he-IL" }
→ audio/mpeg
→ 503 { "fallback": true } when no provider key is set
```

```ts
import { transliterate } from "@/lib/speech";
transliterate(source, { language: "hebrew", guess });
```

```tsx
import SpeakButton from "@/components/speech/SpeakButton";
<SpeakButton text={hebrew} language="hebrew" />
```

`text` is the words to speak (Hebrew script), not the Latin line.

## Israeli Hebrew romanization

Vocalized text (nikud) is romanized in code, then cached, so it does not
change between requests. Unvocalized text still goes to the quality model
(`QUALITY_MODEL` in `lib/chapterPrompts.ts`, Claude Opus) because the vowels
are not in the spelling. The guess is normalized onto this standard and
cached under the Hebrew spelling (`backpack.speech.hebrewTranslit.v1`).

| Letter | Latin |
| --- | --- |
| ח, כ/ך without dagesh | ch |
| כּ | k |
| צ/ץ | tz |
| שׁ / שׂ | sh / s |
| ת | t |
| בּ and word-initial ב | b |
| ב after a vowel | v |
| וֹ / וּ / consonantal ו | o / u / v |
| א, ע | silent at the edge of a word; `'` between vowels (`le'ehov`, `sha'a`, `me'a`, `tzva'im`) |
| final ה | silent (`toda`) |

No hyphens. No Ashkenazi or Biblical forms (`oy`, `shabbos`, `th`, `sav`).
One Latin word per Hebrew word; prefixes ו ה ב כ ל מ ש join the word.
`shabbat` keeps the conventional double b. Stress is not written; the listen
button carries it.

The prompt that used to teach `הערת … = heart et halev` and `צבעים = tzvaim`
now teaches `he'arta et halev beyam shel tzva'im`.

## Voices

Default Hebrew voice is Azure neural **he-IL-HilaNeural** (Israeli Hebrew).
Male alternative: set `AZURE_SPEECH_VOICE=he-IL-AvriNeural`.

Provider order, first configured key wins:

1. **Azure** — `AZURE_SPEECH_KEY`. Region `AZURE_SPEECH_REGION` (default `eastus`). Optional `AZURE_SPEECH_VOICE` overrides the Hebrew voice only.
2. **Google Cloud TTS** — `GOOGLE_TTS_API_KEY`. Hebrew voice `he-IL-Wavenet-A`. Optional `GOOGLE_TTS_VOICE` overrides Hebrew.
3. **ElevenLabs** — `ELEVENLABS_API_KEY` (already used for transcription). Model `eleven_multilingual_v2` (`ELEVENLABS_TTS_MODEL`). Voice id `ELEVENLABS_TTS_VOICE_ID` (default Rachel, `21m00Tcm4TlvDq8ikWAM`) with `language_code=he`. This is a multilingual fallback, not a dedicated Israeli voice. Prefer Azure for Hebrew.

Generated mp3 is cached on disk under the system temp directory (`backpack-speech`), keyed by provider, voice and text.

If none of the keys are set, `POST /api/speech/tts` returns 503 and the button uses the browser `speechSynthesis` voice for `he-IL`. The button shows a spinner while audio loads, a pulse while it plays, and a crossed speaker if both the server and the browser fail. Click again to stop.

## Nikkud

While a Hebrew transliteration view is open, `NikudToggle` (`components/speech/NikudToggle.tsx`) adds or removes vowel points on the Hebrew line. The choice is stored in `localStorage` under `backpack.speech.showNikud` (`1` on, `0` off). Until the learner taps it, Hebrew stays as it was stored.

Points are placed from the transliteration (`vocalizeHebrew` in `lib/speech`) so they match that reading, then checked by romanizing them back. A line that does not line up is sent to the quality model; the pointed text is cached (`backpack.speech.nikud.v1`) and rejected if the letters changed. Turning nikkud off strips Unicode U+0591–U+05C7.
