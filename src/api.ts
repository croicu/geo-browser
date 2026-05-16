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

// Universal error code constant. All other codes are API-specific.
export const OK = 0;

// ── Ping / Pong (internal connection handshake) ───────────────────────────────

export interface PingData {
    token: string;
}

export interface PongData {
    token: string;
}

export const Ping: MethodDef<PingData, PingData> = { id: "__geo_ping__", _kind: "method" };
export const Pong: EventDef<PongData, void> = { id: "__geo_pong__", _kind: "event" };

// ── GetAreaBbox ───────────────────────────────────────────────────────────────

export interface GetAreaBboxInput {
    areaId: string;
}

export interface GetAreaBboxOutput {
    error: number;
    errorDescription: string | null;
    bbox: [number, number, number, number] | null; // [west, south, east, north]
}

export const GetAreaBbox: EventDef<GetAreaBboxInput, GetAreaBboxOutput> = {
    id: "__geo_get_area_bbox__",
    _kind: "event",
};
