import { beforeEach, describe, expect, it, vi } from "vitest";
import { TileFetcher } from "../../../src/tiles/tileFetcher";
import { StubTileCacheStore } from "../../stubs/stubTileCacheStore";
import { setLogger } from "../../../src/services";
import { StubLogger } from "../../stubs/stubLogger";

const TILE_URL = "https://a.tile.openstreetmap.org/3/4/2.png";

describe("TileFetcher", () => {
    beforeEach(() => {
        setLogger(new StubLogger());
    });

    it("fetches live and returns a blob (cacheHit: false) on a cache miss", async () => {
        const store = new StubTileCacheStore();
        const fetchFn = vi.fn().mockResolvedValue(new Response(new Blob(["tile-bytes"]), { status: 200 }));
        const fetcher = new TileFetcher(store, fetchFn);

        const result = await fetcher.fetchTile(TILE_URL, false);

        expect(fetchFn).toHaveBeenCalledWith(TILE_URL);
        expect(result.blob).toBeInstanceOf(Blob);
        expect(result.cacheHit).toBe(false);
    });

    it("writes the response into the store when writeThrough is true", async () => {
        const store = new StubTileCacheStore();
        const fetchFn = vi.fn().mockResolvedValue(new Response(new Blob(["tile-bytes"]), { status: 200 }));
        const fetcher = new TileFetcher(store, fetchFn);

        await fetcher.fetchTile(TILE_URL, true);

        expect(store.has(TILE_URL)).toBe(true);
    });

    it("does not write into the store when writeThrough is false", async () => {
        const store = new StubTileCacheStore();
        const fetchFn = vi.fn().mockResolvedValue(new Response(new Blob(["tile-bytes"]), { status: 200 }));
        const fetcher = new TileFetcher(store, fetchFn);

        await fetcher.fetchTile(TILE_URL, false);

        expect(store.has(TILE_URL)).toBe(false);
    });

    it("serves from the cache (cacheHit: true) without calling fetch on a cache hit", async () => {
        const store = new StubTileCacheStore();
        await store.put(TILE_URL, new Response(new Blob(["cached-bytes"]), { status: 200 }));
        const fetchFn = vi.fn();
        const fetcher = new TileFetcher(store, fetchFn);

        const result = await fetcher.fetchTile(TILE_URL, true);

        expect(fetchFn).not.toHaveBeenCalled();
        expect(result.blob).toBeInstanceOf(Blob);
        expect(result.cacheHit).toBe(true);
    });

    it("throws and does not write to the store when the response is not ok", async () => {
        const store = new StubTileCacheStore();
        const fetchFn = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
        const fetcher = new TileFetcher(store, fetchFn);

        await expect(fetcher.fetchTile(TILE_URL, true)).rejects.toThrow();
        expect(store.has(TILE_URL)).toBe(false);
    });

    // getStats()/resetStats() replaced per-tile Logger.perf() calls -- those produced one log
    // line per tile with no way to get an overall sense of performance from them. Aggregate
    // stats let a caller doing many fetches over a bounded span log one summary instead. See
    // TileFetcher's doc comment on getStats().
    it("counts a cache hit and records its timing in getStats()", async () => {
        setLogger(new StubLogger());
        const store = new StubTileCacheStore();
        await store.put(TILE_URL, new Response(new Blob(["cached-bytes"]), { status: 200 }));
        const fetcher = new TileFetcher(store, vi.fn());

        await fetcher.fetchTile(TILE_URL, true);

        const stats = fetcher.getStats();
        expect(stats.count).toBe(1);
        expect(stats.cacheHits).toBe(1);
        expect(stats.liveFetches).toBe(0);
        expect(stats.totalSeconds).toBeGreaterThanOrEqual(0);
        expect(stats.minSeconds).toBe(stats.maxSeconds);
    });

    it("counts a live fetch and records its timing in getStats()", async () => {
        setLogger(new StubLogger());
        const store = new StubTileCacheStore();
        const fetchFn = vi.fn().mockResolvedValue(new Response(new Blob(["x"]), { status: 200 }));
        const fetcher = new TileFetcher(store, fetchFn);

        await fetcher.fetchTile(TILE_URL, false);

        const stats = fetcher.getStats();
        expect(stats.count).toBe(1);
        expect(stats.cacheHits).toBe(0);
        expect(stats.liveFetches).toBe(1);
    });

    it("does not record a stat when the fetch fails", async () => {
        setLogger(new StubLogger());
        const store = new StubTileCacheStore();
        const fetchFn = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
        const fetcher = new TileFetcher(store, fetchFn);

        await expect(fetcher.fetchTile(TILE_URL, true)).rejects.toThrow();

        expect(fetcher.getStats().count).toBe(0);
    });

    it("accumulates stats across multiple fetches", async () => {
        setLogger(new StubLogger());
        const store = new StubTileCacheStore();
        await store.put(TILE_URL, new Response(new Blob(["cached"]), { status: 200 }));
        const fetchFn = vi.fn().mockImplementation(async () => new Response(new Blob(["x"]), { status: 200 }));
        const fetcher = new TileFetcher(store, fetchFn);

        await fetcher.fetchTile(TILE_URL, true);
        await fetcher.fetchTile("https://a.tile.openstreetmap.org/3/5/2.png", true);
        await fetcher.fetchTile("https://a.tile.openstreetmap.org/3/6/2.png", true);

        const stats = fetcher.getStats();
        expect(stats.count).toBe(3);
        expect(stats.cacheHits).toBe(1);
        expect(stats.liveFetches).toBe(2);
    });

    it("resetStats() clears accumulated stats back to empty", async () => {
        setLogger(new StubLogger());
        const store = new StubTileCacheStore();
        const fetchFn = vi.fn().mockResolvedValue(new Response(new Blob(["x"]), { status: 200 }));
        const fetcher = new TileFetcher(store, fetchFn);
        await fetcher.fetchTile(TILE_URL, false);
        expect(fetcher.getStats().count).toBe(1);

        fetcher.resetStats();

        const stats = fetcher.getStats();
        expect(stats.count).toBe(0);
        expect(stats.cacheHits).toBe(0);
        expect(stats.liveFetches).toBe(0);
        expect(stats.totalSeconds).toBe(0);
        expect(stats.maxSeconds).toBe(0);
    });
});
