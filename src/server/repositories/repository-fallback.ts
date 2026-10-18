/**
 * Shared repository fallback policy (no server-only import so unit tests can
 * exercise the decision tree without a Next.js runtime).
 *
 * - No client configured → permitted demo/seed fallback.
 * - Client configured and remote fails → propagate the error (never seed).
 */

export type RepositoryFallbackClient = object;

export async function executeWithRepositoryFallback<T>(input: {
  scope: string;
  client: RepositoryFallbackClient | null;
  remote: (client: RepositoryFallbackClient) => Promise<T>;
  fallback: () => Promise<T> | T;
  onDemoFallback?: (scope: string, reason: string) => void;
}): Promise<T> {
  if (!input.client) {
    input.onDemoFallback?.(
      input.scope,
      "Supabase is not configured; using seeded fallback.",
    );
    return input.fallback();
  }

  return input.remote(input.client);
}
