type CacheEntry = { expiresAt: number; value: unknown };

const responseCache = new Map<string, CacheEntry>();
const inFlightRequests = new Map<string, Promise<unknown>>();

/** Browser-memory cache for repeated client requests. Use user-scoped keys. */
export async function fetchCached<T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs = 15_000,
): Promise<T> {
  const cached = responseCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value as T;
  if (cached) responseCache.delete(key);

  const pending = inFlightRequests.get(key);
  if (pending) return pending as Promise<T>;

  const request = loader()
    .then((value) => {
      responseCache.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    })
    .finally(() => {
      inFlightRequests.delete(key);
    });

  inFlightRequests.set(key, request);
  return request;
}

export function invalidateCached(prefix: string): void {
  for (const key of responseCache.keys()) {
    if (key.startsWith(prefix)) responseCache.delete(key);
  }
}
