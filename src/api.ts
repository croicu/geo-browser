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

export interface PingData {
    token: string;
}

export interface PongData {
    token: string;
}

export const Ping: MethodDef<PingData, PingData> = { id: "__geo_ping__", _kind: "method" };
export const Pong: EventDef<PongData, void> = { id: "__geo_pong__", _kind: "event" };
