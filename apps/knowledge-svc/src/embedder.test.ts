// Unit tests for LocalEmbedder (RAG-2, RAG-9).
import { describe, it, expect } from "vitest";
import { LocalEmbedder, EMBEDDING_DIMENSION, EMBEDDING_MODEL_ID, EMBEDDING_MODEL_VERSION } from "./embedder.js";

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
  }
  return dot;
}

describe("LocalEmbedder", () => {
  const embedder = new LocalEmbedder();

  it("produces an L2-normalized vector of 384 dimensions", () => {
    const vec = embedder.embedText("Weld Cell 4 coolant loop flow inspection procedure");
    expect(vec.length).toBe(EMBEDDING_DIMENSION);

    const normSq = vec.reduce((acc, v) => acc + v * v, 0);
    expect(normSq).toBeCloseTo(1.0, 3);
  });

  it("yields high cosine similarity for semantically overlapping phrases", () => {
    const v1 = embedder.embedText("Weld Cell 4 coolant loop flow strainer check");
    const v2 = embedder.embedText("coolant flow strainer inspection procedure for Weld Cell 4");
    const sim = cosineSimilarity(v1, v2);

    expect(sim).toBeGreaterThan(0.6);
  });

  it("yields low cosine similarity for unrelated domains", () => {
    const vCoolant = embedder.embedText("Weld Cell 4 coolant flow rate and temperature");
    const vPaint = embedder.embedText("Paint booth 2 humidity capacitive sensor percentage");
    const sim = cosineSimilarity(vCoolant, vPaint);

    expect(sim).toBeLessThan(0.3);
  });

  it("enforces RAG-9 model version compatibility", () => {
    expect(() => embedder.checkCompatibility(EMBEDDING_MODEL_ID, EMBEDDING_MODEL_VERSION)).not.toThrow();

    expect(() => embedder.checkCompatibility("openai-ada", "v2")).toThrow(/Embedding model mismatch/);
    expect(() => embedder.checkCompatibility(EMBEDDING_MODEL_ID, "v2")).toThrow(/Embedding model mismatch/);
  });
});
