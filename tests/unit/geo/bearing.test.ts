import { describe, expect, it } from "vitest";
import { computeBearing } from "../../../src/geo/bearing";

describe("computeBearing", () => {
    it("returns 0 (north) when the destination is due north", () => {
        const bearing = computeBearing([40.0, 14.0], [41.0, 14.0]);
        expect(bearing).toBeCloseTo(0, 0);
    });

    it("returns ~90 (east) when the destination is due east on the equator", () => {
        const bearing = computeBearing([0.0, 14.0], [0.0, 15.0]);
        expect(bearing).toBeCloseTo(90, 0);
    });

    it("returns 180 (south) when the destination is due south", () => {
        const bearing = computeBearing([41.0, 14.0], [40.0, 14.0]);
        expect(bearing).toBeCloseTo(180, 0);
    });

    it("returns ~270 (west) when the destination is due west on the equator", () => {
        const bearing = computeBearing([0.0, 15.0], [0.0, 14.0]);
        expect(bearing).toBeCloseTo(270, 0);
    });

    it("returns a value in [0, 360) for an arbitrary diagonal pair", () => {
        const bearing = computeBearing([40.8518, 14.2681], [40.8402, 14.2903]);
        expect(bearing).toBeGreaterThanOrEqual(0);
        expect(bearing).toBeLessThan(360);
        // South-east quadrant.
        expect(bearing).toBeGreaterThan(90);
        expect(bearing).toBeLessThan(180);
    });

    it("does not throw for identical from/to points", () => {
        const bearing = computeBearing([40.85, 14.27], [40.85, 14.27]);
        expect(Number.isNaN(bearing)).toBe(false);
    });
});
