import type { AreaSummary } from "./protocols";

export type Cookie = number;

export interface MethodDef<TIn, TOut> {
    readonly id: string;
    readonly _kind: "method";
    readonly _types?: readonly [TIn, TOut];
}

export interface EventDef<TIn, TOut> {
    readonly id: string;
    readonly _kind: "event";
    readonly _types?: readonly [TIn, TOut];
}

// Universal error code constant. All other codes are method-specific.
export const OK = 0;
export const ERR_AREA_NOT_FOUND = 1;
export const ERR_TEMPLATE_NOT_FOUND = 2;

// ── Ready (connection handshake, builder → browser) ───────────────────────────

export interface ReadyData {}

export const Ready: EventDef<ReadyData, void> = { id: "__geo_ready__", _kind: "event" };

// ── GetAreaBbox (browser → builder) ──────────────────────────────────────────

export interface GetAreaBboxInput {
    areaId: string;
}

export interface GetAreaBboxOutput {
    error: number;
    errorDescription: string | null;
    bbox: [number, number, number, number] | null; // [west, south, east, north]
}

export const GetAreaBbox: MethodDef<GetAreaBboxInput, GetAreaBboxOutput> = {
    id: "__geo_get_area_bbox__",
    _kind: "method",
};

// ── SetAreaBbox (browser → builder) ──────────────────────────────────────────

export interface SetAreaBboxInput {
    areaId: string;
    bbox: [number, number, number, number]; // [west, south, east, north]
}

export interface SetAreaBboxOutput {
    error: number;
    errorDescription: string | null;
}

export const SetAreaBbox: MethodDef<SetAreaBboxInput, SetAreaBboxOutput> = {
    id: "__geo_set_area_bbox__",
    _kind: "method",
};

// ── AddArea (browser → builder) ───────────────────────────────────────────────

export interface AddAreaInput {
    areaName: string;
    bbox: [number, number, number, number]; // [west, south, east, north]
    template?: string;
}

export interface AddAreaOutput {
    error: number;
    errorDescription: string | null;
    area: AreaSummary | null;
}

export const AddArea: MethodDef<AddAreaInput, AddAreaOutput> = {
    id: "__geo_add_area__",
    _kind: "method",
};

// ── Manifest editor error codes ───────────────────────────────────────────────

export const ERR_MANIFEST_INVALID = 3;
export const ERR_IO = 4;

export type ManifestJson = Record<string, unknown>;

// ── GetAreaJson (browser → builder) ──────────────────────────────────────────

export interface GetAreaJsonInput {
    areaId: string;
}

export interface GetAreaJsonOutput {
    error: number;
    errorDescription: string | null;
    manifest: ManifestJson | null;
}

export const GetAreaJson: MethodDef<GetAreaJsonInput, GetAreaJsonOutput> = {
    id: "__geo_get_area_json__",
    _kind: "method",
};

// ── PutAreaJson (browser → builder) ──────────────────────────────────────────

export interface PutAreaJsonInput {
    areaId: string;
    manifest: ManifestJson;
}

export interface PutAreaJsonOutput {
    error: number;
    errorDescription: string | null;
}

export const PutAreaJson: MethodDef<PutAreaJsonInput, PutAreaJsonOutput> = {
    id: "__geo_put_area_json__",
    _kind: "method",
};

// ── AreaChanged (builder → browser) ──────────────────────────────────────────

export interface AreaChangedData {
    area: AreaSummary;
}

export const AreaChanged: EventDef<AreaChangedData, void> = {
    id: "__geo_area_changed__",
    _kind: "event",
};

// ── GetUserPoints (browser → builder / standalone) ───────────────────────────

export interface GetUserPointsInput {
    areaId: string;
}

export interface GetUserPointsOutput {
    error: number;
    errorDescription: string | null;
    geojson: unknown | null;  // GeoJSON FeatureCollection; null when error !== OK
}

export const GetUserPoints: MethodDef<GetUserPointsInput, GetUserPointsOutput> = {
    id: "__geo_get_user_points__",
    _kind: "method",
};

// ── AddUserPoint (browser → builder / standalone) ────────────────────────────

export interface UserPointData {
    lat: number;
    lon: number;
    timestamp: string;   // ISO 8601
    pressure: number;    // 0.0–1.0
    name: string | null;
    properties?: Record<string, unknown>;  // extra POI properties copied at add-time; absent when no POI matched
}

export interface AddUserPointInput {
    areaId: string;
    point: UserPointData;
}

export interface AddUserPointOutput {
    error: number;
    errorDescription: string | null;
}

export const AddUserPoint: MethodDef<AddUserPointInput, AddUserPointOutput> = {
    id: "__geo_add_user_point__",
    _kind: "method",
};

// ── RemoveUserPoint (browser → builder / standalone) ─────────────────────────

export interface RemoveUserPointInput {
    areaId: string;
    lon: number;
    lat: number;
}

export interface RemoveUserPointOutput {
    error: number;
    errorDescription: string | null;
}

export const RemoveUserPoint: MethodDef<RemoveUserPointInput, RemoveUserPointOutput> = {
    id: "__geo_remove_user_point__",
    _kind: "method",
};
