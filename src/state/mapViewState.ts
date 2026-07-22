// state/mapViewState.ts

import type { MapViewStateData, LatLng } from "../protocols";
import { isLatLng, isNumber } from "../validate";

export const DEFAULT_CENTER: LatLng = [20, 20];
export const DEFAULT_ZOOM = 3;

// The single shared map's viewport (tasks/layer_lifecycle.md) — one camera
// position for the whole app, not one per area. Successor of
// SummaryViewState; selectedAreaId/hoveredAreaId dropped (grep-confirmed
// dead — written but never read anywhere in the old SummaryView).
export class MapViewState {
    private _center: LatLng;
    private _zoom: number;

    constructor(data?: unknown) {
        if (!data || typeof data !== "object") {
            this._center = DEFAULT_CENTER;
            this._zoom = DEFAULT_ZOOM;
            return;
        }

        const d = data as Partial<MapViewStateData>;

        this._center = isLatLng(d.center) ? d.center : DEFAULT_CENTER;
        this._zoom = isNumber(d.zoom) ? d.zoom : DEFAULT_ZOOM;
    }

    get center(): LatLng {
        return this._center;
    }

    set center(value: LatLng) {
        this._center = value;
    }

    get zoom(): number {
        return this._zoom;
    }

    set zoom(value: number) {
        this._zoom = value;
    }

    toJSON(): MapViewStateData {
        return {
            center: this._center,
            zoom: this._zoom,
        };
    }

    static fromJSON(data: MapViewStateData): MapViewState {
        return new MapViewState(data);
    }
}
