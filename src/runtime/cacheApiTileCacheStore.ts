import type { TileCacheStore } from "../contracts";

// One named Cache API cache per area -- lets "clear cache" mean "clear this area's tiles"
// rather than wiping everything ever recorded, and keeps each area's storage independently
// inspectable in devtools. Recording itself still isn't bbox-bound (it follows the live
// viewport), but which cache it writes into now is: whichever area is current when a tile is
// fetched. Area IDs in this catalog are simple slugs (e.g. "debug", "napoli"), safe to use
// directly in a cache name.
export class CacheApiTileCacheStore implements TileCacheStore {
    private readonly _cacheName: string;

    constructor(areaId: string) {
        this._cacheName = `geo-browser.tiles.${areaId}`;
    }

    async match(url: string): Promise<Response | undefined> {
        const cache = await caches.open(this._cacheName);
        const response = await cache.match(url);
        return response ?? undefined;
    }

    async put(url: string, response: Response): Promise<void> {
        const cache = await caches.open(this._cacheName);
        await cache.put(url, response);
    }

    async delete(url: string): Promise<boolean> {
        const cache = await caches.open(this._cacheName);
        return cache.delete(url);
    }

    // Deletes the whole named cache outright -- caches.open() transparently recreates it empty
    // on the next match()/put(), so no re-init step is needed here.
    async clear(): Promise<void> {
        await caches.delete(this._cacheName);
    }
}
