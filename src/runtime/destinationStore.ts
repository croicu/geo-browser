import type { DestinationPoint, DestinationStore, StorageService } from "../contracts";
import { getLogger } from "../services";

const STORAGE_KEY = "geo-browser.destination";

// Pure client runtime — no geo-builder/gateway variant. See tasks/destination_marker.md.
export class LocalStorageDestinationStore implements DestinationStore {
    private readonly _storage: StorageService;

    constructor(storage: StorageService) {
        this._storage = storage;
    }

    get(): DestinationPoint | null {
        const raw = this._storage.getItem(STORAGE_KEY);
        if (!raw) return null;
        try {
            return JSON.parse(raw) as DestinationPoint;
        } catch {
            getLogger().warning("destination_store.get.parse_error");
            return null;
        }
    }

    set(point: DestinationPoint): void {
        const log = getLogger();
        try {
            this._storage.setItem(STORAGE_KEY, JSON.stringify(point));
            log.info("destination_store.set", { lat: point.lat, lng: point.lng });
        } catch (err) {
            log.error("destination_store.set.error", err);
        }
    }

    clear(): void {
        getLogger().info("destination_store.clear");
        this._storage.removeItem(STORAGE_KEY);
    }
}
