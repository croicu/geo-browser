import { describe, expect, it } from "vitest";
import { VoidLayerComputer } from "../../src/view/detail/voidLayerComputer";

// Helper: build sources array from plain [lat, lon] pairs (radiusM = 0).
function pts(...coords: [number, number][]): [number, number, number][] {
    return coords.map(([lat, lon]) => [lat, lon, 0]);
}

describe("VoidLayerComputer.nearestEffectiveDist", () => {
    it("returns 0 when sources list is empty", () => {
        expect(VoidLayerComputer.nearestEffectiveDist(40.85, 14.25, [])).toBe(0);
    });

    it("returns positive distance for a nearby point-source (radiusM = 0)", () => {
        const dist = VoidLayerComputer.nearestEffectiveDist(40.85, 14.25, pts([40.851, 14.251]));
        expect(dist).toBeGreaterThan(0);
    });

    it("returns 0 for a query point coincident with a point-source", () => {
        const dist = VoidLayerComputer.nearestEffectiveDist(40.85, 14.25, pts([40.85, 14.25]));
        expect(dist).toBe(0);
    });

    it("returns negative effective distance when inside a source circle", () => {
        // Source at (40.85, 14.25) with radiusM = 5000m (~0.045°) — query is 0.001° away
        const sources: [number, number, number][] = [[40.85, 14.25, 5000]];
        const dist = VoidLayerComputer.nearestEffectiveDist(40.851, 14.251, sources);
        expect(dist).toBeLessThan(0);
    });

    it("returns smaller effective distance for the nearer of two sources", () => {
        const sources = pts([40.85, 14.25], [40.87, 14.27]);
        const distNear = VoidLayerComputer.nearestEffectiveDist(40.851, 14.251, sources);
        const distFar = VoidLayerComputer.nearestEffectiveDist(40.856, 14.258, sources);
        expect(distNear).toBeLessThan(distFar);
    });

    it("finds a source regardless of how far it is from the query point", () => {
        // Source is far away but must still be found (no spatial index cutoff)
        const sources = pts([40.90, 14.33]);
        const dist = VoidLayerComputer.nearestEffectiveDist(40.80, 14.20, sources);
        expect(dist).toBeGreaterThan(0);
    });
});

describe("VoidLayerComputer.pointInRing", () => {
    const square: [number, number][] = [
        [0, 0], [1, 0], [1, 1], [0, 1], [0, 0],
    ];

    it("detects a point inside the ring", () => {
        expect(VoidLayerComputer.pointInRing(0.5, 0.5, square)).toBe(true);
    });

    it("detects a point outside the ring", () => {
        expect(VoidLayerComputer.pointInRing(2, 2, square)).toBe(false);
    });

    it("returns false for empty ring", () => {
        expect(VoidLayerComputer.pointInRing(0.5, 0.5, [])).toBe(false);
    });
});

describe("VoidLayerComputer.isExcluded", () => {
    const squareRing: [number, number][] = [
        [0, 0], [1, 0], [1, 1], [0, 1], [0, 0],
    ];

    it("excludes a point inside any ring", () => {
        expect(VoidLayerComputer.isExcluded(0.5, 0.5, [squareRing])).toBe(true);
    });

    it("does not exclude a point outside all rings", () => {
        expect(VoidLayerComputer.isExcluded(5, 5, [squareRing])).toBe(false);
    });

    it("returns false when rings list is empty", () => {
        expect(VoidLayerComputer.isExcluded(0.5, 0.5, [])).toBe(false);
    });
});
