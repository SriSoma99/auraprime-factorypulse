// Claude adapter for the NarrationModel port (ADR-038), through the official Anthropic TypeScript SDK.
import Anthropic from "@anthropic-ai/sdk";
import type { Config } from "@fp/config";
import type { NarrationModel, NarrationOutput, NarrationPrompt } from "./types.js";

export class AnthropicNarration implements NarrationModel {
  readonly provider = "anthropic" as const;
  readonly modelId: string;
  private readonly client: Anthropic;

  constructor(private readonly cfg: Config["model"]["anthropic"], apiKey: string, timeoutMs: number) {
    this.modelId = cfg.model_id;
    // Retries stay off: a slow provider falls back to the local template rather than holding the request (NFR-R6).
    this.client = new Anthropic({ apiKey, baseURL: cfg.base_url, timeout: timeoutMs, maxRetries: 0 });
  }

  async narrate(p: NarrationPrompt): Promise<NarrationOutput> {
    const response = await this.client.beta.messages.create({
      model: this.cfg.model_id,
      max_tokens: p.maxOutputTokens,
      system: p.system,
      messages: [{ role: "user", content: p.user }],
      output_config: { effort: this.cfg.effort },
      ...(this.cfg.server_side_fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    });
    if (response.stop_reason === "refusal") throw new Error("provider declined the request");
    const text = response.content.flatMap(b => (b.type === "text" ? [b.text] : [])).join("\n").trim();
    // response.model is the model that served the call, which may be a server-side fallback; it is priced as reported.
    return { text, modelId: response.model, usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens } };
  }
}
