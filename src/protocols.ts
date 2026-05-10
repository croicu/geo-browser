export interface Catalog {
    version: number;
    createdAt: string;
    areas: AreaSummary[];
}

export interface AreaSummary {
    id: string;
    name: string;

    center: [number, number];
    radiusMeters: number;

    minRadiusPx: number;
    maxRadiusPx: number;
    liveMapRadiusPx: number;

    manifestUrl: string;

    images: AreaImage[];
}

export interface AreaImage {
    sizePx: number;

    url: string;
}

export interface AreaDetail {
    id: string;

    layers: Layer[];
}
export interface LayerStyle {
    color?: string;
    opacity?: number;
    radius?: number;
    blur?: number;
    radiusScale?: number;
}

export interface Layer {
    id: string;
    type: string;
    url: string;
    visible: boolean;

    name?: string;
    style?: LayerStyle;
}

export type LatLng = [number, number];

export interface HeatPoint {
    latLng: [number, number];
    weight: number;
}

export interface SummaryViewStateData {
    center: LatLng;
    zoom: number;
    selectedAreaId?: string;
    hoveredAreaId?: string;
}

export interface DetailViewStateData {
    areaId: string;
    center?: LatLng;
    zoom?: number;
    visibleLayers?: Record<string, boolean>;
}
