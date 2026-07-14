/**
 * @title Hugging Face inference client
 * @notice Shared LLM completion layer for compiler, detector, and eval harness.
 * @dev Uses @huggingface/inference chatCompletion with low temperature for structured JSON outputs.
 * @custom:env HUGGINGFACE_API_KEY (required), HF_MODEL (optional override)
 */
import { InferenceClient } from "@huggingface/inference";

/** @dev Default instruct model when HF_MODEL is unset. */
export const DEFAULT_MODEL = "meta-llama/Llama-3.3-70B-Instruct";

/** @dev Models supported for eval comparison runs. */
export const CANDIDATE_MODELS = [
  "meta-llama/Llama-3.3-70B-Instruct",
  "meta-llama/Meta-Llama-3.1-8B-Instruct",
  "Qwen/Qwen2.5-7B-Instruct",
  "mistralai/Mistral-7B-Instruct-v0.3",
] as const;

let client: InferenceClient | null = null;

/** @dev Lazy singleton InferenceClient; throws if HUGGINGFACE_API_KEY missing. */
function getClient(): InferenceClient {
  const apiKey = process.env.HUGGINGFACE_API_KEY;
  if (!apiKey) {
    throw new Error("HUGGINGFACE_API_KEY is not set in .env");
  }
  if (!client) {
    client = new InferenceClient(apiKey);
  }
  return client;
}

/**
 * @notice Resolve the active model id from env or default.
 * @return Model string passed to chatCompletion.
 */
export function getModel(): string {
  return process.env.HF_MODEL ?? DEFAULT_MODEL;
}

/**
 * @notice Run a chat completion and parse the assistant message as JSON.
 * @dev temperature 0.1, max_tokens 1200. Use Zod schemas on `parsed` at call sites.
 * @param systemPrompt System role instructions (compiler/detect/vagueness prompts).
 * @param userPrompt User role content (watch text, candidate source, etc.).
 * @param model Optional model override.
 * @return Raw text, parsed JSON, and model id.
 */
export async function completeJson<T>(
  systemPrompt: string,
  userPrompt: string,
  model = getModel(),
): Promise<{ raw: string; parsed: T; model: string }> {
  const response = await getClient().chatCompletion({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    max_tokens: 1200,
    temperature: 0.1,
  });

  const raw = response.choices[0]?.message?.content ?? "";
  const parsed = parseJsonFromModel<T>(raw);
  return { raw, parsed, model };
}

/**
 * @notice Extract JSON from model output, including fenced ```json blocks.
 * @dev Falls back to first `{...}` substring if direct parse fails.
 * @param text Raw assistant message.
 * @return Parsed value cast to T (caller should validate with Zod).
 */
export function parseJsonFromModel<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? text.trim();

  try {
    return JSON.parse(candidate) as T;
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(candidate.slice(start, end + 1)) as T;
    }
    throw new Error(`Model did not return valid JSON:\n${text}`);
  }
}
