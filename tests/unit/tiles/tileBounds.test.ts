import { describe, expect, it } from "vitest";
import { tileToBounds } from "../../../src/tiles/tileBounds";

describe("tileToBounds", () => {
    it("covers the whole world in longitude for the single z=0 tile", () => {
        const bounds = tileToBounds({ x: 0, y: 0, z: 0 });

        expect(bounds.west).toBeCloseTo(-180, 5);
        expect(bounds.east).toBeCloseTo(180, 5);
    });

    it("covers the standard Web Mercator latitude limits for the single z=0 tile", () => {
        const bounds = tileToBounds({ x: 0, y: 0, z: 0 });

        expect(bounds.north).toBeCloseTo(85.0511287798, 6);
        expect(bounds.south).toBeCloseTo(-85.0511287798, 6);
    });

    it("north is always greater than south, east always greater than west", () => {
        const bounds = tileToBounds({ x: 10, y: 20, z: 8 });

        expect(bounds.north).toBeGreaterThan(bounds.south);
        expect(bounds.east).toBeGreaterThan(bounds.west);
    });

    it("splits a parent tile's bounds exactly between its four children at the next zoom level", () => {
        const parent = tileToBounds({ x: 4, y: 4, z: 4 });
        const topLeftChild = tileToBounds({ x: 8, y: 8, z: 5 });

        expect(topLeftChild.north).toBeCloseTo(parent.north, 9);
        expect(topLeftChild.west).toBeCloseTo(parent.west, 9);
    });

    it("is deterministic for the same coordinate", () => {
        const first = tileToBounds({ x: 3, y: 5, z: 4 });
        const second = tileToBounds({ x: 3, y: 5, z: 4 });

        expect(first).toEqual(second);
    });
});
