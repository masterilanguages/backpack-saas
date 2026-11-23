// Student-facing language calls (transliteration, translation, journal lessons)
// use the quality model. The deployment default is the fallback so a model
// outage still returns something. See QUALITY_MODEL in lib/chapterPrompts.
import { base44 } from "@/api/base44Client";
import { QUALITY_MODEL } from "@/lib/chapterPrompts";

export async function invokeQuality(args: Record<string, unknown>) {
  const { model: _ignored, ...rest } = args;
  try {
    return await base44.integrations.Core.InvokeLLM({ ...args, model: (args.model as string) || QUALITY_MODEL });
  } catch {
    return await base44.integrations.Core.InvokeLLM(rest);
  }
}
