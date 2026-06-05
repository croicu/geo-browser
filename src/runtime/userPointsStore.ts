import type { GatewayService, StorageService, UserPointsStore } from "../contracts";
import { AddUserPoint, GetUserPoints, OK, RemoveUserPoint } from "../api";
import { getLogger } from "../services";

const EMPTY_COLLECTION = { type: "FeatureCollection", features: [] } as const;
const STORAGE_KEY_PREFIX = "geo-browser.userPoints.";

const POI_INTERNAL_KEYS = new Set(["weight", "hasDetails"]);

function stripInternalPoiFlags(props: Record<string, unknown> | undefined): Record<string, unknown> {
    if (!props) return {};
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(props)) {
        if (!POI_INTERNAL_KEYS.has(k)) result[k] = v;
    }
    return result;
}

export class LocalStorageUserPointsStore implements UserPointsStore {
    private readonly _storage: StorageService;

    constructor(storage: StorageService) {
        this._storage = storage;
    }

    getPointsSync(areaId: string): unknown {
        const log = getLogger();
        const key = STORAGE_KEY_PREFIX + areaId;
        const raw = this._storage.getItem(key);
        if (!raw) {
            log.info("store.read", { key, found: 0 });
            return EMPTY_COLLECTION;
        }
        try {
            const parsed = JSON.parse(raw) as unknown;
            const count = (parsed as { features?: unknown[] }).features?.length ?? "?";
            log.info("store.read", { key, found: count });
            return parsed;
        } catch {
            log.warning("store.read.parse_error", { key });
            return EMPTY_COLLECTION;
        }
    }

    async getPoints(areaId: string): Promise<unknown> {
        return this.getPointsSync(areaId);
    }

    async addPoint(areaId: string, lat: number, lon: number, pressure: number, poiProperties?: Record<string, unknown>): Promise<void> {
        const log = getLogger();
        const key = STORAGE_KEY_PREFIX + areaId;
        const raw = this._storage.getItem(key);
        let collection: { type: string; features: unknown[] };
        try {
            collection = raw ? (JSON.parse(raw) as typeof collection) : { type: "FeatureCollection", features: [] };
        } catch {
            collection = { type: "FeatureCollection", features: [] };
        }

        const safePoiProps = stripInternalPoiFlags(poiProperties);
        collection.features.push({
            type: "Feature",
            geometry: { type: "Point", coordinates: [lon, lat] },
            properties: {
                ...safePoiProps,
                timestamp: new Date().toISOString(),
                pressure,
                weight: pressure,
                name: (safePoiProps["name"] as string | null | undefined) ?? null,
            },
        });

        try {
            this._storage.setItem(key, JSON.stringify(collection));
            log.info("store.add", { key, count: collection.features.length, lat, lon, stars: safePoiProps["stars"] ?? null });
        } catch (err) {
            log.error("store.add.error", err);
        }
    }

    async removePoint(areaId: string, lon: number, lat: number): Promise<void> {
        const log = getLogger();
        const key = STORAGE_KEY_PREFIX + areaId;
        const raw = this._storage.getItem(key);
        if (!raw) {
            log.warning("store.remove.key_missing", { key, lon, lat });
            return;
        }
        let collection: { type: string; features: unknown[] };
        try {
            collection = JSON.parse(raw) as typeof collection;
        } catch {
            log.warning("store.remove.parse_error", { key });
            return;
        }
        const before = collection.features.length;
        collection.features = collection.features.filter((f) => {
            const coords = (f as { geometry?: { coordinates?: number[] } }).geometry?.coordinates;
            return !(Array.isArray(coords) && coords[0] === lon && coords[1] === lat);
        });
        const removed = before - collection.features.length;
        this._storage.setItem(key, JSON.stringify(collection));
        log.info("store.remove", { key, removed, remaining: collection.features.length, lon, lat });
    }

    async setBookmarked(areaId: string, lon: number, lat: number, bookmarked: boolean): Promise<void> {
        const log = getLogger();
        const key = STORAGE_KEY_PREFIX + areaId;
        const raw = this._storage.getItem(key);
        if (!raw) {
            log.warning("store.set_bookmarked.key_missing", { key, lon, lat });
            return;
        }
        let collection: { type: string; features: unknown[] };
        try {
            collection = JSON.parse(raw) as typeof collection;
        } catch {
            log.warning("store.set_bookmarked.parse_error", { key });
            return;
        }
        let found = false;
        for (const f of collection.features) {
            const feature = f as { geometry?: { coordinates?: number[] }; properties?: Record<string, unknown> };
            const coords = feature.geometry?.coordinates;
            if (Array.isArray(coords) && coords[0] === lon && coords[1] === lat) {
                if (!feature.properties) feature.properties = {};
                if (bookmarked) {
                    feature.properties["bookmarked"] = true;
                } else {
                    delete feature.properties["bookmarked"];
                }
                found = true;
                break;
            }
        }
        if (!found) {
            log.warning("store.set_bookmarked.not_found", { key, lon, lat });
            return;
        }
        this._storage.setItem(key, JSON.stringify(collection));
        log.info("store.set_bookmarked", { key, lon, lat, bookmarked });
    }
}

export class GatewayUserPointsStore implements UserPointsStore {
    private readonly _gateway: GatewayService;
    private readonly _log = getLogger();

    constructor(gateway: GatewayService) {
        this._gateway = gateway;
    }

    getPoints(areaId: string): Promise<unknown> {
        return new Promise((resolve) => {
            this._gateway.invoke(GetUserPoints, { areaId }, (response) => {
                if (response.error !== OK || !response.geojson) {
                    this._log.warning("user_points_store.get_points.error", { areaId, error: response.error });
                    resolve(EMPTY_COLLECTION);
                    return;
                }
                resolve(response.geojson);
            });
        });
    }

    addPoint(areaId: string, lat: number, lon: number, pressure: number, poiProperties?: Record<string, unknown>): Promise<void> {
        return new Promise((resolve) => {
            this._gateway.invoke(AddUserPoint, {
                areaId,
                point: {
                    lat,
                    lon,
                    timestamp: new Date().toISOString(),
                    pressure,
                    name: (poiProperties?.["name"] as string | null | undefined) ?? null,
                    ...(poiProperties ? { properties: stripInternalPoiFlags(poiProperties) } : {}),
                },
            }, (response) => {
                if (response.error !== OK) {
                    this._log.warning("user_points_store.add_point.error", { areaId, error: response.error });
                }
                resolve();
            });
        });
    }

    removePoint(areaId: string, lon: number, lat: number): Promise<void> {
        return new Promise((resolve) => {
            this._gateway.invoke(RemoveUserPoint, { areaId, lon, lat }, (response) => {
                if (response.error !== OK) {
                    this._log.warning("user_points_store.remove_point.error", { areaId, error: response.error });
                }
                resolve();
            });
        });
    }
}
