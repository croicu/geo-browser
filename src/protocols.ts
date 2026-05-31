export interface Catalog {
    version: number;
    createdAt: string;
    areas: AreaSummary[];
}

export interface AreaSummary {
    id: string;
    name: string;

    bbox: [number, number, number, number];  // [west, south, east, north]

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
    type?: string;
    color?: string;
    opacity?: number;
    radius?: number;
    blur?: number;
    radiusScale?: number;
    minRadius?: number;
    maxRadius?: number;
    strokeColor?: string;
    strokeWidth?: number;
    minZoom?: number;
}

export interface LayerAcquisition {
    provider: string;
    filters: { [key: string]: string[] };
}

export interface Layer {
    id: string;
    type: string;
    url: string | null;
    visible: boolean;

    name?: string;
    style?: LayerStyle;
    acquisition?: LayerAcquisition;
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
