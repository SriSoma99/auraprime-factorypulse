// Gemini adapter for the NarrationModel port (ADR-038). The key travels in a header, never in the URL.
import type { Config } from "@fp/config";
import type { NarrationModel, NarrationOutput, NarrationPrompt } from "./types.js";

export class GeminiNarration implements NarrationModel {
  readonly provider = "gemini" as const;
  readonly modelId: string;

  constructor(private readonly cfg: Config["model"]["gemini"], private readonly apiKey: string) {
    this.modelId = cfg.model_id;
  }

  async narrate(p: NarrationPrompt): Promise<NarrationOutput> {
    const res = await fetch(`${this.cfg.base_url}/models/${encodeURIComponent(this.cfg.model_id)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": this.apiKey },
      signal: AbortSignal.timeout(p.timeoutMs),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: p.system }] },
        contents: [{ role: "user", parts: [{ text: p.user }] }],
        generationConfig: { temperature: this.cfg.temperature, maxOutputTokens: p.maxOutputTokens },
      }),
    });
    if (!res.ok) throw new Error(`provider responded ${res.status}`);
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
    };
    const text = (data.candidates?.[0]?.content?.parts ?? []).map(x => x.text ?? "").join("").trim();
    // Field names from the Gemini generateContent response (verify); thinking tokens are billed as output.
    const u = data.usageMetadata;
    const usage = u?.promptTokenCount !== undefined && u.candidatesTokenCount !== undefined
      ? { inputTokens: u.promptTokenCount, outputTokens: u.candidatesTokenCount + (u.thoughtsTokenCount ?? 0) } : undefined;
    return { text, modelId: this.cfg.model_id, usage };
  }
}
