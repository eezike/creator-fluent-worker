export type RetryOptions = {
  maxRetries: number;
  baseDelayMs: number;
  isRetryable?: (err: any) => boolean;
};

/**
 * Sleep for a fixed duration.
 */
export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Detect Google/Gmail rate limit responses.
 */
export function isRateLimitError(err: any) {
  const code = err?.code ?? err?.status;
  const message = err?.message ?? err?.cause?.message;
  return code === 429 || message?.includes("Too many concurrent requests");
}

/**
 * Execute an async function with exponential backoff.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  options: RetryOptions
): Promise<T> {
  const { maxRetries, baseDelayMs, isRetryable } = options;
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      attempt += 1;
      if (!isRetryable?.(err) || attempt > maxRetries) {
        throw err;
      }
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      console.warn(
        `${label} hit rate limit, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`
      );
      await sleep(delay);
    }
  }
}
