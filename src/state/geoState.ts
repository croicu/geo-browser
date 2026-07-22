import type { MapViewState } from "./mapViewState";
import type { AreaViewState } from "./areaViewState";

export interface GeoState {
    loadMapViewState(): MapViewState;
    saveMapViewState(state: MapViewState): void;

    loadAreaViewState(areaId: string): AreaViewState | undefined;
    saveAreaViewState(state: AreaViewState): void;
}
