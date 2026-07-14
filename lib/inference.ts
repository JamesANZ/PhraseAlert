import { InferenceClient } from "@huggingface/inference";

export const DEFAULT_MODEL = "meta-llama/Llama-3.3-70B-Instruct";

export const CANDIDATE_MODELS = [
  "meta-llama/Llama-3.3-70B-Instruct",
  "meta-llama/Meta-Llama-3.1-8B-Instruct",
  "Qwen/Qwen2.5-7B-Instruct",
  "mistralai/Mistral-7B-Instruct-v0.3",
] as const;

let client: InferenceClient | null = null;

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

export function getModel(): string {
  return process.env.HF_MODEL ?? DEFAULT_MODEL;
}

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
