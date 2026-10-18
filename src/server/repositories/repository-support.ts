import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabase, getSupabaseAdmin } from "@/lib/supabase";
import { executeWithRepositoryFallback } from "@/server/repositories/repository-fallback";
import type { Database } from "@/types/database.types";

const loggedWarnings = new Set<string>();
let fallbackVersion = 0;

const warnOnce = (scope: string, reason: string) => {
  const key = `${scope}:${reason}`;
  if (loggedWarnings.has(key)) return;

  loggedWarnings.add(key);
  console.warn(`[Thread data] ${scope}: ${reason}`);
};

export const getRepositoryFallbackVersion = () => fallbackVersion;

export class RepositoryError extends Error {
  constructor(
    public readonly scope: string,
    message: string,
  ) {
    super(message);
    this.name = "RepositoryError";
  }
}

export const requireSuccessfulQuery = (
  scope: string,
  error: { message: string } | null,
) => {
  if (error) throw new RepositoryError(scope, error.message);
};

/**
 * Uses seeded data only when Supabase credentials are absent.
 * When Supabase is configured, remote failures propagate — seed data is never
 * substituted for a failed live request.
 */
export async function withRepositoryFallback<T>(input: {
  scope: string;
  remote: (client: SupabaseClient<Database>) => Promise<T>;
  fallback: () => Promise<T> | T;
}): Promise<T> {
  const supabase = getSupabaseAdmin() ?? getSupabase();

  return executeWithRepositoryFallback({
    scope: input.scope,
    client: supabase,
    remote: (client) => input.remote(client as SupabaseClient<Database>),
    fallback: input.fallback,
    onDemoFallback: (scope, reason) => {
      fallbackVersion += 1;
      warnOnce(scope, reason);
    },
  });
}
