import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetSupabaseClientForTests,
  getSupabaseClient,
  getSupabaseConfigStatus,
  isSupabaseConfigured,
} from "../supabase";

afterEach(() => {
  vi.unstubAllEnvs();
  __resetSupabaseClientForTests();
});

describe("Supabase config detection (backend not yet created)", () => {
  it("reports unconfigured when both env vars are missing", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    const status = getSupabaseConfigStatus();
    expect(status.configured).toBe(false);
    expect(status.missing).toEqual([
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ]);
    expect(isSupabaseConfigured()).toBe(false);
  });

  it("reports unconfigured when only one var is set", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    expect(getSupabaseConfigStatus()).toEqual({
      configured: false,
      missing: ["NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    });
  });

  it("rejects a non-URL value for the Supabase URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "not-a-url");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "fake-anon-key");
    expect(isSupabaseConfigured()).toBe(false);
    expect(getSupabaseConfigStatus().missing).toContain(
      "NEXT_PUBLIC_SUPABASE_URL",
    );
  });

  it("returns a null client (never throws) when unconfigured", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    expect(() => getSupabaseClient()).not.toThrow();
    expect(getSupabaseClient()).toBeNull();
  });

  it("returns a client when both env vars are set", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "fake-anon-key");
    expect(isSupabaseConfigured()).toBe(true);
    expect(getSupabaseConfigStatus()).toEqual({ configured: true, missing: [] });
    const client = getSupabaseClient();
    expect(client).not.toBeNull();
    // Same env → same cached instance.
    expect(getSupabaseClient()).toBe(client);
  });
});
