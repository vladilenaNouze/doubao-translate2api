import { setTimeout as delay } from "node:timers/promises";
import type { Config } from "../config/env.js";
import { DoubaoClient } from "../doubao/client.js";
import { Semaphore } from "./concurrency.js";
import { ServiceError } from "./errors.js";
import { MODEL_ENGINE_MAP } from "./models.js";
import { buildBatches, segmentText } from "./segmenter.js";
import type { TranslationRequest, TranslationResult } from "./translation-request.js";
import { AccountPool, isAccountFailure } from "../admin/accounts.js";
import type { CookieProvider } from "../auth/cookie-store.js";

export class Translator {
  readonly semaphore: Semaphore;
  constructor(private config: Config, readonly client: DoubaoClient, private pool?: AccountPool) {
    this.semaphore = new Semaphore(config.DOUBAO_MAX_CONCURRENCY, config.DOUBAO_QUEUE_MAX, config.DOUBAO_QUEUE_TIMEOUT_MS);
  }
  async translate(req: TranslationRequest, signal: AbortSignal): Promise<TranslationResult> {
    const start = performance.now();
    const segments = segmentText(req.rawText);
    const batches = buildBatches(segments.map(x => x.text));
    const output = segments.map(x => x.text);
    const detected = new Set<string>();
    let lease = this.pool ? await this.pool.choose() : undefined;
    const tried = new Set<string>(lease ? [lease.id] : []);
    let outputBytes = 0;
    for (const batch of batches) {
      let retries = 0;
      for (;;) {
        const release = await this.semaphore.acquire(signal);
        let retry = false;
        let switched = false;
        try {
          const result = await this.client.translate({
            texts: batch.texts, targetLang: req.targetLang, scene: req.scene, engine: MODEL_ENGINE_MAP[req.model],
          }, signal, lease?.provider);
          outputBytes += result.texts.reduce((sum, text) => sum + Buffer.byteLength(text), 0);
          if (outputBytes > 8 * 1024 * 1024)
            throw new ServiceError("upstream_stream_error", 502, "Translated output exceeds size limit.");
          batch.indexes.forEach((index, i) => { output[index] = result.texts[i]!; });
          result.detectedLanguages.forEach(x => detected.add(x));
          if (lease) await this.pool!.succeeded(lease.id, lease.revision);
        } catch (error) {
          if (signal.aborted) throw error;
          if (lease && isAccountFailure(error)) {
            await this.pool!.failed(lease.id, error, lease.revision);
            if (await this.pool!.allowsFailover()) {
              try {
                lease = await this.pool!.choose(tried); tried.add(lease.id);
                switched = true; retry = true;
              } catch (selectionError) {
                if (!(selectionError instanceof ServiceError) || selectionError.code !== "no_available_cookie") throw selectionError;
              }
            }
          }
          if (!retry) {
            if (!(error instanceof ServiceError) || !error.retryable || retries >= this.config.DOUBAO_MAX_RETRIES) throw error;
            retry = true;
          }
        } finally { release(); }
        if (!retry) break;
        if (!switched) await delay(Math.min(250 * 3 ** retries++, 5000) + Math.random() * 100, undefined, { signal });
      }
    }
    return {
      model: req.model, text: segments.map((x, i) => output[i] + x.separator).join(""),
      detectedLanguages: [...detected], upstreamBatchCount: batches.length, elapsedMs: performance.now() - start,
    };
  }
  async authStatus(signal: AbortSignal, provider?: CookieProvider) {
    const release = await this.semaphore.acquire(signal);
    try {
      if (provider) return await this.client.authStatus(signal, provider);
      if (this.pool) {
        const { activeId } = await this.pool.list();
        return await this.client.authStatus(signal, () => this.pool!.getCookie(activeId));
      }
      return await this.client.authStatus(signal);
    } finally { release(); }
  }
}
