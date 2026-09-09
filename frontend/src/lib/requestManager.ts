type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

type RequestOptions = {
  ttlMs?: number;
  timeoutMs?: number;
  force?: boolean;
  signal?: AbortSignal;
};

const cache = new Map<string, CacheEntry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

function getCached<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry.value as T;
}

function withTimeout(signal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  }
  const timeout = window.setTimeout(() => controller.abort(new DOMException("Request timed out", "TimeoutError")), timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => {
      window.clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    },
  };
}

export async function requestJson<T>(key: string, url: string, options: RequestOptions = {}): Promise<T> {
  const ttlMs = options.ttlMs ?? 5_000;
  const timeoutMs = options.timeoutMs ?? 12_000;

  if (!options.force) {
    const cached = getCached<T>(key);
    if (cached !== undefined) return cached;
  }

  const existing = inflight.get(key);
  if (existing && !options.force) return existing as Promise<T>;

  const request = (async () => {
    const timeout = withTimeout(options.signal, timeoutMs);
    try {
      const response = await fetch(url, {
        credentials: "include",
        cache: "no-store",
        signal: timeout.signal,
      });
      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
      const value = (await response.json()) as T;
      cache.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    } finally {
      timeout.cleanup();
    }
  })();

  inflight.set(key, request);
  try {
    return await request;
  } finally {
    if (inflight.get(key) === request) inflight.delete(key);
  }
}

export function invalidateRequestCache(prefix?: string) {
  if (!prefix) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}
