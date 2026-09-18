import type { TileCacheStore } from "../contracts";
import { fail } from "../errors";

export type FetchFn = (url: string) => Promise<Response>;

export interface TileFetchStats {
    count: number;
    cacheHits: number;
    liveFetches: number;
    totalSeconds: number;
    minSeconds: number;
    maxSeconds: number;
}

function emptyStats(): TileFetchStats {
    return { count: 0, cacheHits: 0, liveFetches: 0, totalSeconds: 0, minSeconds: Infinity, maxSeconds: 0 };
}

export interface TileFetchResult {
    blob: Blob;
    // Lets a caller react per-request (e.g. CachingTileLayer's debug-only cache-hit border) --
    // getStats() is cumulative and doesn't tell you about any one specific fetch.
    cacheHit: boolean;
}

// Cache-first tile fetch, used by leafletFactories.ts's CachingTileLayer for every OSM tile
// request while the current area is being recorded (geo-browser#103). No Leaflet import -- kept
// Leaflet-free so it's unit-testable with a stub. `fetch` is injected (defaulting to the global)
// rather than imported, per CLAUDE.md's DI convention -- tests pass a stub instead of a module
// mock.
//
// The default MUST be `(url) => fetch(url)`, never the bare `fetch` reference (`= fetch`) --
// real browsers spec `fetch` as a WebIDL operation branded to `Window`/`WorkerGlobalScope`, so
// calling it via a detached reference (`this._fetch(url)` where `_fetch` was assigned straight
// from the global) throws "Failed to execute 'fetch' on 'Window': Illegal invocation". happy-dom
// does not enforce this receiver check, so this specific regression is invisible to every test
// in this suite -- it only surfaces live, in a real browser. Confirmed live 2026-09-16.
export class TileFetcher {
    private readonly _store: TileCacheStore;
    private readonly _fetch: FetchFn;
    private _stats: TileFetchStats = emptyStats();

    constructor(store: TileCacheStore, fetchFn: FetchFn = (url) => fetch(url)) {
        this._store = store;
        this._fetch = fetchFn;
    }

    // Aggregate timing, not a log line per tile -- an earlier version logged a Logger.perf()
    // marker per call (cache_hit/live_fetch), but that produced hundreds/thousands of fragmented
    // lines with no way to actually get a sense of overall performance from them. A caller doing
    // many fetches over a bounded span should resetStats() at the start and log one summary from
    // getStats() at the end instead.
    getStats(): TileFetchStats {
        return { ...this._stats };
    }

    resetStats(): void {
        this._stats = emptyStats();
    }

    // Wipes this area's cached tiles (this TileFetcher's own store -- see TileCacheStore.clear()).
    async clearCache(): Promise<void> {
        await this._store.clear();
        this.resetStats();
    }

    // writeThrough controls whether a live (cache-miss) fetch gets written back into the cache --
    // false when the current area doesn't have caching enabled, per the "off by default" rule.
    async fetchTile(url: string, writeThrough: boolean): Promise<TileFetchResult> {
        const start = performance.now();

        const cached = await this._store.match(url);
        if (cached) {
            this.recordStat((performance.now() - start) / 1000, true);
            return { blob: await cached.blob(), cacheHit: true };
        }

        const response = await this._fetch(url);
        if (!response.ok) {
            fail("tile_fetcher.fetch_failed", `Failed to fetch tile: ${url}`, undefined, { status: response.status });
        }

        if (writeThrough) {
            await this._store.put(url, response.clone());
        }

        this.recordStat((performance.now() - start) / 1000, false);
        return { blob: await response.blob(), cacheHit: false };
    }

    private recordStat(elapsedSeconds: number, cacheHit: boolean): void {
        this._stats.count++;
        if (cacheHit) {
            this._stats.cacheHits++;
        } else {
            this._stats.liveFetches++;
        }
        this._stats.totalSeconds += elapsedSeconds;
        this._stats.minSeconds = Math.min(this._stats.minSeconds, elapsedSeconds);
        this._stats.maxSeconds = Math.max(this._stats.maxSeconds, elapsedSeconds);
    }
}
