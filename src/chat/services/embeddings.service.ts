import { Injectable, Logger } from '@nestjs/common';

export type EmbeddingVector = number[];

@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);

  private static extractorPromise: Promise<
    ((text: string, options?: Record<string, unknown>) => Promise<any>) | null
  > | null = null;

  /**
   * Returns an embedding vector for the input text, or null if embeddings are disabled.
   * This service is best-effort; it should not break message processing.
   */
  async embed(text: string): Promise<EmbeddingVector | null> {
    const input = (text ?? '').toString().trim();
    if (!input) return null;

    try {
      const extractor = await this.getOrCreateExtractor();
      if (!extractor) return null;

      // `feature-extraction` pipeline; we request pooled + normalized vector (MiniLM: 384 dims).
      const out = await extractor(input, { pooling: 'mean', normalize: true });

      const vec = this.coerceVector(out);
      return vec && vec.length > 0 ? vec : null;
    } catch (e) {
      this.logger.warn(
        `Embeddings error: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    }
  }

  private async getOrCreateExtractor(): Promise<
    ((text: string, options?: Record<string, unknown>) => Promise<any>) | null
  > {
    if (EmbeddingsService.extractorPromise) {
      return EmbeddingsService.extractorPromise;
    }

    EmbeddingsService.extractorPromise = (async () => {
      try {
        // @xenova/transformers is ESM; dynamic import keeps CommonJS builds working.
        const mod = (await import('@xenova/transformers')) as {
          pipeline: (
            task: string,
            model: string,
            options?: Record<string, unknown>,
          ) => Promise<any>;
        };

        const extractor = await mod.pipeline(
          'feature-extraction',
          'Xenova/all-MiniLM-L6-v2',
        );
        return extractor as (text: string, options?: Record<string, unknown>) => Promise<any>;
      } catch (e) {
        this.logger.warn(
          `Embeddings model load failed: ${e instanceof Error ? e.message : String(e)}`,
        );
        return null;
      }
    })();

    return EmbeddingsService.extractorPromise;
  }

  private coerceVector(out: any): EmbeddingVector | null {
    // Common: Tensor with `data` (Float32Array/number[]) and `dims`.
    const data = out?.data;
    if (data && typeof data === 'object') {
      const arr = Array.from(data as ArrayLike<number>);
      if (arr.length > 0 && arr.every((n) => typeof n === 'number')) {
        return arr;
      }
    }

    // Sometimes: nested arrays (e.g. [ [ ... ] ]). Flatten one level.
    if (Array.isArray(out)) {
      const flat =
        out.length === 1 && Array.isArray(out[0]) ? (out[0] as unknown[]) : out;
      const vec = (flat as unknown[]).map((n) => Number(n));
      return vec.length > 0 && vec.every((n) => Number.isFinite(n)) ? vec : null;
    }

    // Some builds return tensor-like object with `tolist()`.
    if (typeof out?.tolist === 'function') {
      try {
        const v = out.tolist();
        if (Array.isArray(v)) {
          const flat =
            v.length === 1 && Array.isArray(v[0]) ? (v[0] as unknown[]) : v;
          const vec = (flat as unknown[]).map((n) => Number(n));
          return vec.length > 0 && vec.every((n) => Number.isFinite(n))
            ? vec
            : null;
        }
      } catch {
        // ignore
      }
    }

    return null;
  }
}

