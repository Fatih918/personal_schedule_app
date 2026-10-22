type CacheEntry = { expiresAt: number; value: unknown };

const responseCache = new Map<string, CacheEntry>();
const inFlightRequests = new Map<string, Promise<unknown>>();
const generations = new Map<string, number>();
const knownKeys = new Set<string>();

/** Browser-memory cache for repeated client requests. Use user-scoped keys. */
export async function fetchCached<T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs = 15_000,
): Promise<T> {
  knownKeys.add(key);
  const cached = responseCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value as T;
  if (cached) responseCache.delete(key);

  const pending = inFlightRequests.get(key);
  if (pending) return pending as Promise<T>;

  const generation = generations.get(key) ?? 0;
  const request = loader()
    .then((value) => {
      // Do not let a request started before invalidation repopulate stale data.
      if ((generations.get(key) ?? 0) === generation) {
        responseCache.set(key, { value, expiresAt: Date.now() + ttlMs });
      }
      return value;
    })
    .finally(() => {
      if (inFlightRequests.get(key) === request) inFlightRequests.delete(key);
    });

  inFlightRequests.set(key, request);
  return request;
}

export function invalidateCached(prefix: string): void {
  for (const key of knownKeys) {
    if (!key.startsWith(prefix)) continue;
    responseCache.delete(key);
    generations.set(key, (generations.get(key) ?? 0) + 1);
    inFlightRequests.delete(key);
  }
}
