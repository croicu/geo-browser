import type { StorageService } from "../../src/contracts";

export class StubStorage implements StorageService {
    private readonly _store = new Map<string, string>();

    getItem(key: string): string | null {
        return this._store.get(key) ?? null;
    }

    setItem(key: string, value: string): void {
        this._store.set(key, value);
    }

    removeItem(key: string): void {
        this._store.delete(key);
    }

    clear(): void {
        this._store.clear();
    }
}
