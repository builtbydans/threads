import { describe, expect, it, vi } from "vitest";

import { executeWithRepositoryFallback } from "@/server/repositories/repository-fallback";

type SourceResult = { source: "live" | "seed" };

describe("executeWithRepositoryFallback", () => {
  it("uses the remote result when Supabase is configured and succeeds", async () => {
    const remote = vi.fn(async (): Promise<SourceResult> => ({ source: "live" }));
    const fallback = vi.fn(async (): Promise<SourceResult> => ({ source: "seed" }));
    const onDemoFallback = vi.fn();

    const result = await executeWithRepositoryFallback({
      scope: "TestRepository.success",
      client: { id: "supabase" },
      remote,
      fallback,
      onDemoFallback,
    });

    expect(result).toEqual({ source: "live" });
    expect(remote).toHaveBeenCalledOnce();
    expect(fallback).not.toHaveBeenCalled();
    expect(onDemoFallback).not.toHaveBeenCalled();
  });

  it("propagates remote errors when Supabase is configured", async () => {
    const failure = new Error("connection refused");
    const remote = vi.fn(async (): Promise<SourceResult> => {
      throw failure;
    });
    const fallback = vi.fn(async (): Promise<SourceResult> => ({ source: "seed" }));
    const onDemoFallback = vi.fn();

    await expect(
      executeWithRepositoryFallback({
        scope: "TestRepository.failure",
        client: { id: "supabase" },
        remote,
        fallback,
        onDemoFallback,
      }),
    ).rejects.toThrow(failure);

    expect(fallback).not.toHaveBeenCalled();
    expect(onDemoFallback).not.toHaveBeenCalled();
  });

  it("uses demo fallback when Supabase is not configured", async () => {
    const remote = vi.fn(async (): Promise<SourceResult> => ({ source: "live" }));
    const fallback = vi.fn(async (): Promise<SourceResult> => ({ source: "seed" }));
    const onDemoFallback = vi.fn();

    const result = await executeWithRepositoryFallback({
      scope: "TestRepository.unconfigured",
      client: null,
      remote,
      fallback,
      onDemoFallback,
    });

    expect(result).toEqual({ source: "seed" });
    expect(remote).not.toHaveBeenCalled();
    expect(fallback).toHaveBeenCalledOnce();
    expect(onDemoFallback).toHaveBeenCalledWith(
      "TestRepository.unconfigured",
      "Supabase is not configured; using seeded fallback.",
    );
  });
});
