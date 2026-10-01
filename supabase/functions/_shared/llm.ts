// Ask Claude for a JSON object matching a schema, from inside an edge function.
// Same approach as invoke-llm: a "format_response" tool carries the schema.
// The newest models (Sonnet 5.5, Opus 5.5, Fable 5.1) reject a forced
// tool_choice, so they get it on "auto" plus an explicit instruction, and a
// JSON object written as text is accepted as a fallback.
import Anthropic from "npm:@anthropic-ai/sdk";

const DEFAULT_MODEL = Deno.env.get("LLM_MODEL") || "claude-haiku-4-5";

export async function askJson(
  prompt: string,
  schema: Record<string, unknown>,
  opts: { model?: string; maxTokens?: number } = {},
): Promise<any> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  const client = new Anthropic({ apiKey });
  const model = opts.model || DEFAULT_MODEL;
  const noForcedTool = /sonnet-5-5|opus-5-5|fable-5-1|mythos-5-1/.test(model);

  const params: any = {
    model,
    max_tokens: noForcedTool ? Math.max(opts.maxTokens || 0, 16000) : opts.maxTokens || 4096,
    messages: [{
      role: "user",
      content: noForcedTool ? `${prompt}\n\nGive your answer by calling the format_response tool.` : prompt,
    }],
    tools: [{ name: "format_response", description: "Return the answer using exactly this structure.", input_schema: schema }],
    tool_choice: noForcedTool ? { type: "auto" } : { type: "tool", name: "format_response" },
  };
  if (noForcedTool) params.output_config = { effort: "medium" };

  const resp: any = await client.messages.create(params);
  const toolUse = resp.content.find((b: any) => b.type === "tool_use");
  if (toolUse) return toolUse.input;
  const text = resp.content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("");
  const m = text.match(/\{[\s\S]*\}/);
  if (m) return JSON.parse(m[0]);
  throw new Error("The model returned no JSON");
}

/** The quality model first; the default model if it errors. */
export async function askJsonQuality(prompt: string, schema: Record<string, unknown>, model: string, maxTokens?: number) {
  try {
    return await askJson(prompt, schema, { model, maxTokens });
  } catch (e) {
    console.warn("[llm] quality model failed, using the default", e);
    return await askJson(prompt, schema, { maxTokens });
  }
}
