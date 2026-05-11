import type { StorageService } from "../contracts";
import { fail } from "../errors";

export class StorageGuard implements StorageService {
    private _impl?: StorageService;
    private _locked = false;

    set(impl: StorageService): void {
        if (this._locked) {
            fail("storage_guard.locked", "StorageService is already in use and cannot be replaced.");
        }
        this._impl = impl;
    }

    get isLocked(): boolean {
        return this._locked;
    }

    unlock(): void {
        this._locked = false;
    }

    nuke(): void {
        this._impl?.clear();
    }

    getItem(key: string): string | null {
        this.lock();
        return this.impl.getItem(key);
    }

    setItem(key: string, value: string): void {
        this.lock();
        this.impl.setItem(key, value);
    }

    removeItem(key: string): void {
        this.lock();
        this.impl.removeItem(key);
    }

    clear(): void {
        this.nuke();
    }

    private lock(): void {
        this._locked = true;
    }

    private get impl(): StorageService {
        if (!this._impl) {
            fail("storage_guard.not_initialized", "StorageService has not been initialized. Call Context.setStorage() before first use.");
        }
        return this._impl;
    }
}
