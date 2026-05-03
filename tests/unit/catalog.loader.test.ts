import { describe, expect, it, vi, afterEach } from "vitest";
import { resolveCatalogUrl } from "../../src/catalog/loader";
import { setLogger } from "../../src/services";
import type { Logger } from "../../src/protocols";

function createMockLogger(): Logger {
  return {
    diagnostic: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  };
}

const TEST_HEAD_URL = "/test/catalog.head.json";
const TEST_FALLBACK_URL = "/test/catalog.json";

describe("catalog loader", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns catalogUrl from catalog.head.json", async () => {
    const logger = createMockLogger();
    setLogger(logger);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          version: 1,
          catalogUrl: "/catalogs/catalog.2026-05-02.json",
        }),
      })
    );

    const url = await resolveCatalogUrl({
        headUrl: TEST_HEAD_URL,
        fallbackUrl: TEST_FALLBACK_URL,
    });

    expect(url).toBe("/catalogs/catalog.2026-05-02.json");
    expect(fetch).toHaveBeenCalledWith(TEST_HEAD_URL, {
      cache: "no-store",
    });
    expect(logger.warning).not.toHaveBeenCalled();
  });

  it("falls back to bootstrap catalog when head fetch fails", async () => {
    const logger = createMockLogger();
    setLogger(logger);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network failure"))
    );

    const url = await resolveCatalogUrl({
        headUrl: TEST_HEAD_URL,
        fallbackUrl: TEST_FALLBACK_URL,
    });

    expect(url).toBe(TEST_FALLBACK_URL);
    expect(logger.warning).toHaveBeenCalledOnce();
  });

  it("falls back to bootstrap catalog when head response is not ok", async () => {
    const logger = createMockLogger();
    setLogger(logger);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      })
    );

    const url = await resolveCatalogUrl({
        headUrl: TEST_HEAD_URL,
        fallbackUrl: TEST_FALLBACK_URL,
    });

    expect(url).toBe(TEST_FALLBACK_URL);
    expect(logger.warning).toHaveBeenCalledOnce();
  });

  it("falls back to bootstrap catalog when head payload is invalid", async () => {
    const logger = createMockLogger();
    setLogger(logger);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          version: 1,
          catalogUrl: "",
        }),
      })
    );

    const url = await resolveCatalogUrl({
        headUrl: TEST_HEAD_URL,
        fallbackUrl: TEST_FALLBACK_URL,
    });

    expect(url).toBe(TEST_FALLBACK_URL);
    expect(logger.warning).toHaveBeenCalledOnce();
  });
});