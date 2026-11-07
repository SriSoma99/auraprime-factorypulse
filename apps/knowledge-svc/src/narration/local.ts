// Deterministic cited template (ADR-038 `local` adapter): no network, no key, the same answer for the same chunks.
import type { RetrievedChunk } from "../types.js";

export const LOCAL_MODEL_ID = "local-cited-template";

export function localAnswer(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) {
    return "The approved documents do not answer this. A field inspection is recommended, or add the missing document for review.";
  }
  const [top, second] = chunks;
  return [
    `From the approved documents [${top!.citation_id} · ${top!.section}]:`,
    `"${top!.content.trim()}"`,
    second ? `Also relevant [${second.citation_id} · ${second.section}]:\n"${second.content.trim()}"` : "",
    "Follow the site lockout procedure before servicing, and check live readings against the equipment registry limits.",
  ].filter(Boolean).join("\n\n");
}
