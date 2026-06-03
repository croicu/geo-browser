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
        const raw = this._storage.getItem(STORAGE_KEY_PREFIX + areaId);
        if (!raw) return EMPTY_COLLECTION;
        try { return JSON.parse(raw) as unknown; } catch { return EMPTY_COLLECTION; }
    }

    async getPoints(areaId: string): Promise<unknown> {
        return this.getPointsSync(areaId);
    }

    async addPoint(areaId: string, lat: number, lon: number, pressure: number, poiProperties?: Record<string, unknown>): Promise<void> {
        const raw = this._storage.getItem(STORAGE_KEY_PREFIX + areaId);
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

        this._storage.setItem(STORAGE_KEY_PREFIX + areaId, JSON.stringify(collection));
    }

    async removePoint(areaId: string, lon: number, lat: number): Promise<void> {
        const raw = this._storage.getItem(STORAGE_KEY_PREFIX + areaId);
        if (!raw) return;
        let collection: { type: string; features: unknown[] };
        try {
            collection = JSON.parse(raw) as typeof collection;
        } catch {
            return;
        }
        collection.features = collection.features.filter((f) => {
            const coords = (f as { geometry?: { coordinates?: number[] } }).geometry?.coordinates;
            return !(Array.isArray(coords) && coords[0] === lon && coords[1] === lat);
        });
        this._storage.setItem(STORAGE_KEY_PREFIX + areaId, JSON.stringify(collection));
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
