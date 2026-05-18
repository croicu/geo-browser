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
