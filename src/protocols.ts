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

export interface Layer {
    id: string;

    type: string;
    url: string;

    visible: boolean;

    name?: string;
}

export type LatLng = [number, number];

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

export type LogLevel =
    | "diagnostic"
    | "info"
    | "warning"
    | "error"
    | "fatal";

export interface TelemetryRecord {
    timestamp: string;
    level: LogLevel;
    message: string;
    props?: Record<string, unknown>;
    error?: unknown;
}

export interface TelemetrySink {
    write(record: TelemetryRecord): void;
}

export interface Logger {
    diagnostic(message: string, props?: Record<string, unknown>): void;
    info(message: string, props?: Record<string, unknown>): void;
    warning(message: string, props?: Record<string, unknown>): void;
    error(message: string, error?: unknown, props?: Record<string, unknown>): void;
    fatal(message: string, error?: unknown, props?: Record<string, unknown>): void;
}