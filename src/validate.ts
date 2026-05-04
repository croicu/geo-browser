import type { LatLng } from "./protocols";

export function isLatLng(value: unknown): value is LatLng {
    return (
        Array.isArray(value) &&
        value.length === 2 &&
        typeof value[0] === "number" &&
        typeof value[1] === "number"
    );
}

export function isNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

export function isString(value: unknown): value is string {
    return typeof value === "string";
}

