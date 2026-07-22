import { describe, expect, it } from "vitest";
import { bboxPixelSize, boundsIntersectBbox, metersPerPixel } from "../../../src/geo/mercator";

describe("metersPerPixel", () => {
    it("matches the known reference value at the equator, zoom 0", () => {
        expect(metersPerPixel(0, 0)).toBeCloseTo(156543.03, 1);
    });

    it("shrinks with latitude due to the cosine term", () => {
        expect(metersPerPixel(60, 0)).toBeCloseTo(78271.52, 1);
    });

    it("halves for every zoom level increase", () => {
        const z5 = metersPerPixel(40, 5);
        const z6 = metersPerPixel(40, 6);
        expect(z6).toBeCloseTo(z5 / 2, 5);
    });
});

describe("bboxPixelSize", () => {
    const bbox: [number, number, number, number] = [14.0, 40.0, 14.1, 40.1];

    it("returns positive width/height for a non-degenerate bbox", () => {
        const { widthPx, heightPx } = bboxPixelSize(bbox, 10);
        expect(widthPx).toBeGreaterThan(0);
        expect(heightPx).toBeGreaterThan(0);
    });

    it("doubles on-screen size for every zoom level increase", () => {
        const at10 = bboxPixelSize(bbox, 10);
        const at11 = bboxPixelSize(bbox, 11);
        expect(at11.widthPx).toBeCloseTo(at10.widthPx * 2, 1);
        expect(at11.heightPx).toBeCloseTo(at10.heightPx * 2, 1);
    });

    it("returns zero size for a degenerate (point) bbox", () => {
        const point: [number, number, number, number] = [14.0, 40.0, 14.0, 40.0];
        const { widthPx, heightPx } = bboxPixelSize(point, 10);
        expect(widthPx).toBe(0);
        expect(heightPx).toBe(0);
    });
});

describe("boundsIntersectBbox", () => {
    const viewport = { sw: [40.0, 14.0] as [number, number], ne: [41.0, 15.0] as [number, number] };

    it("returns true when the bbox is fully inside the viewport", () => {
        expect(boundsIntersectBbox([14.2, 40.2, 14.5, 40.5], viewport)).toBe(true);
    });

    it("returns true when the bbox partially overlaps the viewport", () => {
        expect(boundsIntersectBbox([13.5, 39.5, 14.2, 40.2], viewport)).toBe(true);
    });

    it("returns false when the bbox is fully outside the viewport", () => {
        expect(boundsIntersectBbox([20.0, 50.0, 20.5, 50.5], viewport)).toBe(false);
    });

    it("returns false when the bbox merely touches the viewport edge (no strict overlap)", () => {
        expect(boundsIntersectBbox([15.0, 40.0, 15.5, 40.5], viewport)).toBe(false);
    });

    it("returns false when the bbox is above/below the viewport but longitude overlaps", () => {
        expect(boundsIntersectBbox([14.2, 41.5, 14.5, 42.0], viewport)).toBe(false);
    });
});
