import type { GatewayService, StorageService, UserPointsStore } from "../contracts";
import { AddUserPoint, GetUserPoints, OK } from "../api";
import { getLogger } from "../services";

const EMPTY_COLLECTION = { type: "FeatureCollection", features: [] } as const;
const STORAGE_KEY_PREFIX = "geo-browser.userPoints.";

export class LocalStorageUserPointsStore implements UserPointsStore {
    private readonly _storage: StorageService;

    constructor(storage: StorageService) {
        this._storage = storage;
    }

    async getPoints(areaId: string): Promise<unknown> {
        const raw = this._storage.getItem(STORAGE_KEY_PREFIX + areaId);
        if (!raw) {
            return EMPTY_COLLECTION;
        }
        try {
            return JSON.parse(raw) as unknown;
        } catch {
            return EMPTY_COLLECTION;
        }
    }

    async addPoint(areaId: string, lat: number, lon: number, pressure: number): Promise<void> {
        const raw = this._storage.getItem(STORAGE_KEY_PREFIX + areaId);
        let collection: { type: string; features: unknown[] };
        try {
            collection = raw ? (JSON.parse(raw) as typeof collection) : { type: "FeatureCollection", features: [] };
        } catch {
            collection = { type: "FeatureCollection", features: [] };
        }

        collection.features.push({
            type: "Feature",
            geometry: { type: "Point", coordinates: [lon, lat] },
            properties: {
                timestamp: new Date().toISOString(),
                pressure,
                name: null,
            },
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

    addPoint(areaId: string, lat: number, lon: number, pressure: number): Promise<void> {
        return new Promise((resolve) => {
            this._gateway.invoke(AddUserPoint, {
                areaId,
                point: {
                    lat,
                    lon,
                    timestamp: new Date().toISOString(),
                    pressure,
                    name: null,
                },
            }, (response) => {
                if (response.error !== OK) {
                    this._log.warning("user_points_store.add_point.error", { areaId, error: response.error });
                }
                resolve();
            });
        });
    }
}
