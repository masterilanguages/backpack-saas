// Single source of truth for the mnemonic image ART STYLE.
//
// Every image-generation path (auto-suggest, the pencil/custom-mnemonic input,
// the paint/regenerate button, etc.) MUST build its prompt through
// mnemonicImagePrompt() so all generated cards share one consistent look.
//
// IMPORTANT — FLUX.1-schnell has NO negative-prompt support (the Cloudflare API
// only accepts prompt/steps/seed). Diffusion text encoders largely IGNORE
// negations like "NOT a medieval painting" and instead key on the NOUNS that are
// present — so naming a failure mode (medieval, painting, photo, realistic)
// actually pulls the image TOWARD it. That is why a "NOT medieval" clause was
// producing medieval-looking results. This prompt is therefore written almost
// entirely in the POSITIVE: we only describe the look we WANT (3D Pixar cartoon)
// and never name the styles we want to avoid. Order also matters — LEAD with the
// style so it anchors the whole image, then the scene, then reinforce the style.
// (The only retained negation is a short "no text" note: stray lettering must be
// suppressed and that word rarely backfires the way style-nouns do.)

// Leading style anchor — describes the MEDIUM before anything else.
export const MNEMONIC_IMAGE_STYLE_LEAD =
  "A 3D Pixar/Disney-style animated cartoon render with a clean modern CGI " +
  "look: cute stylized characters and objects with big expressive eyes, glossy " +
  "vibrant colors, smooth rounded shapes, soft cinematic lighting, playful and " +
  "whimsical.";

// Trailing reinforcement — repeats the medium, stated positively.
export const MNEMONIC_IMAGE_STYLE_TAIL =
  "The ENTIRE image stays in this one consistent, brightly colored 3D Pixar " +
  "animation style on a plain solid white background — a clean, purely-visual " +
  "cartoon illustration, with no text or lettering anywhere.";

// Back-compat single-string style (kept in case anything imports it).
export const MNEMONIC_IMAGE_STYLE =
  `${MNEMONIC_IMAGE_STYLE_LEAD} ${MNEMONIC_IMAGE_STYLE_TAIL}`;

// Build a full GenerateImage prompt: style FIRST, then the scene, then the
// reinforcing constraints. Pass only the scene-specific part (what to depict).
export function mnemonicImagePrompt(scene: string): string {
  return `${MNEMONIC_IMAGE_STYLE_LEAD} Scene to depict: ${String(scene || "").trim()}. ${MNEMONIC_IMAGE_STYLE_TAIL}`;
}
