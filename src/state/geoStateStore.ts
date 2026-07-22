import type { StorageService } from "../contracts";
import type { GeoState } from "./geoState";
import { MapViewState } from "./mapViewState";
import { AreaViewState } from "./areaViewState";

const KEY_MAP_VIEW = "geo-browser.mapViewState";
const KEY_AREA_VIEW = "geo-browser.areaViewState.";

export class GeoStateStore implements GeoState {
    private readonly _storage: StorageService;

    constructor(storage: StorageService) {
        this._storage = storage;
    }

    loadMapViewState(): MapViewState {
        const raw = this._storage.getItem(KEY_MAP_VIEW);

        if (!raw) {
            return new MapViewState();
        }

        try {
            return MapViewState.fromJSON(JSON.parse(raw));
        } catch {
            return new MapViewState();
        }
    }

    saveMapViewState(state: MapViewState): void {
        this._storage.setItem(KEY_MAP_VIEW, JSON.stringify(state.toJSON()));
    }

    loadAreaViewState(areaId: string): AreaViewState | undefined {
        const raw = this._storage.getItem(`${KEY_AREA_VIEW}${areaId}`);

        if (!raw) {
            return undefined;
        }

        try {
            return AreaViewState.fromJSON(JSON.parse(raw));
        } catch {
            return undefined;
        }
    }

    saveAreaViewState(state: AreaViewState): void {
        this._storage.setItem(
            `${KEY_AREA_VIEW}${state.areaId}`,
            JSON.stringify(state.toJSON())
        );
    }
}
