/** One line for a toast when mnemonic image generation fails. */
export function mnemonicImageErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const msg = raw.replace(/^Edge Function returned a non-2xx status code\.?\s*/i, "").trim();
  if (!msg || /^(functionshttperror|edge function returned)/i.test(msg)) {
    return "Couldn't create the mnemonic image. The image service failed — check the provider key and try again.";
  }
  return msg.length > 280 ? `${msg.slice(0, 277)}…` : msg;
}
