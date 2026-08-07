// invoke-llm — replaces Base44's integrations.Core.InvokeLLM, backed by Claude.
//
// Accepts the same shape the frontend passed to InvokeLLM:
//   { prompt, response_json_schema?, add_context_from_internet?, file_urls?, system?, model?, max_tokens? }
// Returns:
//   - with response_json_schema: the parsed object (callers read its fields directly)
//   - without:                   { response: "<text>" }
import Anthropic from "npm:@anthropic-ai/sdk";
import { handleCors, json } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";

// High-volume translation/transliteration/mnemonics default to a cheap, fast model.
// Override per deployment with the LLM_MODEL secret (e.g. claude-opus-4-8 for max quality).
const MODEL_DEFAULT = Deno.env.get("LLM_MODEL") || "claude-haiku-4-5";

Deno.serve(async (req) => {
  const pre = handleCors(req);
  if (pre) return pre;

  const auth = await requireUser(req);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "ANTHROPIC_API_KEY is not set" }, 500);
    const client = new Anthropic({ apiKey });

    const body = await req.json().catch(() => ({}));
    const {
      prompt,
      response_json_schema,
      add_context_from_internet,
      file_urls,
      system,
      model,
      max_tokens,
    } = body || {};

    if (!prompt) return json({ error: "Missing 'prompt'" }, 400);

    const chosenModel = model || MODEL_DEFAULT;
    const maxTokens = max_tokens || 4096;

    // Optionally enrich the prompt with fresh web context (works with or without a schema).
    let webContext = "";
    if (add_context_from_internet) {
      webContext = await gatherWebContext(client, chosenModel, prompt);
    }

    const promptText = webContext
      ? `${prompt}\n\n<web_context>\n${webContext}\n</web_context>`
      : prompt;

    const userContent: any[] = [{ type: "text", text: promptText }];
    if (Array.isArray(file_urls)) {
      for (const url of file_urls) {
        userContent.push({ type: "image", source: { type: "url", url } });
      }
    }

    const params: any = {
      model: chosenModel,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: userContent }],
    };
    if (system) params.system = system;

    if (response_json_schema) {
      // Structured output via a forced tool call — lenient and model-agnostic
      // (no strict additionalProperties requirements, matching Base44 behaviour).
      params.tools = [
        {
          name: "format_response",
          description: "Return the answer using exactly this structure.",
          input_schema: response_json_schema,
        },
      ];
      params.tool_choice = { type: "tool", name: "format_response" };
      const resp: any = await client.messages.create(params);
      const toolUse = resp.content.find((b: any) => b.type === "tool_use");
      if (toolUse) return json(toolUse.input);
      const text = resp.content
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("");
      return json({ response: text });
    }

    const resp: any = await client.messages.create(params);
    const text = resp.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("");
    return json({ response: text });
  } catch (err: any) {
    return json({ error: err?.message || String(err) }, 500);
  }
});

// Best-effort web research pass. Degrades to "" if the model/tool can't search.
async function gatherWebContext(
  client: any,
  model: string,
  prompt: string,
): Promise<string> {
  try {
    let messages: any[] = [
      {
        role: "user",
        content:
          "Research the following and return a concise, factual summary of relevant, up-to-date information. Do not answer the task directly — only gather facts.\n\n" +
          prompt,
      },
    ];
    let out = "";
    for (let i = 0; i < 4; i++) {
      const resp: any = await client.messages.create({
        model,
        max_tokens: 2048,
        messages,
        tools: [{ type: "web_search_20260209", name: "web_search" }],
      });
      out = resp.content
        .filter((b: any) => b.type === "text")
        .map((b: any) => b.text)
        .join("");
      if (resp.stop_reason === "pause_turn") {
        messages = [...messages, { role: "assistant", content: resp.content }];
        continue;
      }
      break;
    }
    return out;
  } catch (_e) {
    return "";
  }
}
