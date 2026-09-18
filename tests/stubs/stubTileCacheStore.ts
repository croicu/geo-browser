import type { TileCacheStore } from "../../src/contracts";

// In-memory stand-in for the Cache API -- keyed by URL, same contract as
// runtime/cacheApiTileCacheStore.ts's real implementation.
export class StubTileCacheStore implements TileCacheStore {
    private readonly _store = new Map<string, Response>();

    async match(url: string): Promise<Response | undefined> {
        return this._store.get(url);
    }

    async put(url: string, response: Response): Promise<void> {
        this._store.set(url, response);
    }

    async delete(url: string): Promise<boolean> {
        return this._store.delete(url);
    }

    async clear(): Promise<void> {
        this._store.clear();
    }

    get size(): number {
        return this._store.size;
    }

    has(url: string): boolean {
        return this._store.has(url);
    }
}
