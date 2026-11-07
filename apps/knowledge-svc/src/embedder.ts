// Deterministic 384-dimensional embedding provider for pgvector (RAG-2, RAG-9).
// Generates L2-normalized 384-dim dense vectors from text using subword feature hashing.

export const EMBEDDING_MODEL_ID = "fp-minilm-384";
export const EMBEDDING_MODEL_VERSION = "v1";
export const EMBEDDING_DIMENSION = 384;

// 32-bit FNV-1a hash
function fnv1a(str: string, seed = 0x811c9dc5): number {
  let h = seed;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class LocalEmbedder {
  public readonly modelId = EMBEDDING_MODEL_ID;
  public readonly modelVersion = EMBEDDING_MODEL_VERSION;
  public readonly dimension = EMBEDDING_DIMENSION;

  /**
   * Validate that an incoming model_id and model_version match this embedder (RAG-9).
   * Throws if mismatch occurs to prevent silent wrong results.
   */
  public checkCompatibility(modelId: string, modelVersion: string): void {
    if (modelId !== this.modelId || modelVersion !== this.modelVersion) {
      throw new Error(
        `Embedding model mismatch (RAG-9): required ${this.modelId}:${this.modelVersion}, got ${modelId}:${modelVersion}`
      );
    }
  }

  /**
   * Generate an L2-normalized 384-dimensional dense vector for the given text.
   */
  public embedText(text: string): number[] {
    const vec = new Float64Array(this.dimension);
    const tokens = this.tokenize(text);

    if (tokens.length === 0) {
      // Return a balanced zero-centered default vector
      vec[0] = 1.0;
      return Array.from(vec);
    }

    for (const token of tokens) {
      // Primary bucket
      const h1 = fnv1a(token);
      const bucket1 = h1 % this.dimension;
      const sign1 = (h1 & 0x80000000) === 0 ? 1.0 : -1.0;
      vec[bucket1] = (vec[bucket1] ?? 0) + sign1;

      // Secondary bi-gram hash
      const h2 = fnv1a(token, 0x9e3779b9);
      const bucket2 = h2 % this.dimension;
      const sign2 = (h2 & 0x80000000) === 0 ? 1.0 : -1.0;
      vec[bucket2] = (vec[bucket2] ?? 0) + sign2 * 0.5;

      // 3-gram character shingles for fuzzy typo/stem overlap
      if (token.length >= 3) {
        for (let i = 0; i <= token.length - 3; i++) {
          const shingle = token.slice(i, i + 3);
          const hs = fnv1a(shingle, 0x85ebca6b);
          const b = hs % this.dimension;
          const s = (hs & 0x80000000) === 0 ? 0.3 : -0.3;
          vec[b] = (vec[b] ?? 0) + s;
        }
      }
    }

    // L2 normalize
    let sumSq = 0;
    for (let i = 0; i < this.dimension; i++) {
      sumSq += vec[i]! * vec[i]!;
    }
    const norm = Math.sqrt(sumSq) || 1.0;

    const result: number[] = new Array(this.dimension);
    for (let i = 0; i < this.dimension; i++) {
      result[i] = Number((vec[i]! / norm).toFixed(6));
    }

    return result;
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s_-]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1);
  }
}
