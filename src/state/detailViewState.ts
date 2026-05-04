// state/detailViewState.ts

import type { DetailViewStateData, LatLng } from "../protocols";

const DEFAULT_CENTER: LatLng = [0, 0];
const DEFAULT_ZOOM = 13;

export class DetailViewState {
    private readonly _areaId: string;
    private _center: LatLng;
    private _zoom: number;
    private _visibleLayers: Record<string, boolean>;

    constructor(data: DetailViewStateData) {
        this._areaId = data.areaId;
        this._center = data.center ?? DEFAULT_CENTER;
        this._zoom = data.zoom ?? DEFAULT_ZOOM;
        this._visibleLayers = data.visibleLayers ?? {};
    }

    get areaId(): string {
        return this._areaId;
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

    get visibleLayers(): Record<string, boolean> {
        return this._visibleLayers;
    }

    setLayerVisible(layerId: string, visible: boolean): void {
        this._visibleLayers[layerId] = visible;
    }

    isLayerVisible(layerId: string, defaultVisible: boolean): boolean {
        return this._visibleLayers[layerId] ?? defaultVisible;
    }

    toJSON(): DetailViewStateData {
        return {
            areaId: this._areaId,
            center: this._center,
            zoom: this._zoom,
            visibleLayers: this._visibleLayers,
        };
    }

    static fromJSON(data: DetailViewStateData): DetailViewState {
        return new DetailViewState(data);
    }
}