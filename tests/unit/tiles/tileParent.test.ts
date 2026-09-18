import { describe, expect, it } from "vitest";
import { computeParentTileCrop } from "../../../src/tiles/tileParent";

describe("computeParentTileCrop", () => {
    it("computes the immediate parent (levelsUp: 1) and the correct quadrant", () => {
        // z16 tile (10, 20) -> z15 parent (5, 10), top-left quadrant (even x, even y)
        const crop = computeParentTileCrop({ x: 10, y: 20, z: 16 }, 1, 10);

        expect(crop).toEqual({
            parent: { x: 5, y: 10, z: 15 },
            cropX: 0,
            cropY: 0,
            cropSize: 0.5,
        });
    });

    it("picks the correct quadrant for odd x/y (bottom-right)", () => {
        // z16 tile (11, 21) -> z15 parent (5, 10), bottom-right quadrant
        const crop = computeParentTileCrop({ x: 11, y: 21, z: 16 }, 1, 10);

        expect(crop).toEqual({
            parent: { x: 5, y: 10, z: 15 },
            cropX: 0.5,
            cropY: 0.5,
            cropSize: 0.5,
        });
    });

    it("computes a grandparent (levelsUp: 2) with a quarter-size crop", () => {
        // z16 tile (11, 21) -> z14 parent (2, 5)
        const crop = computeParentTileCrop({ x: 11, y: 21, z: 16 }, 2, 10);

        expect(crop?.parent).toEqual({ x: 2, y: 5, z: 14 });
        expect(crop?.cropSize).toBeCloseTo(0.25, 10);
    });

    it("returns null once the parent zoom would fall below minZoom", () => {
        const crop = computeParentTileCrop({ x: 10, y: 20, z: 11 }, 2, 10);

        expect(crop).toBeNull();
    });

    it("returns a crop exactly at minZoom (the floor is inclusive)", () => {
        const crop = computeParentTileCrop({ x: 10, y: 20, z: 12 }, 2, 10);

        expect(crop?.parent.z).toBe(10);
    });

    it("returns null for levelsUp less than 1", () => {
        expect(computeParentTileCrop({ x: 10, y: 20, z: 16 }, 0, 10)).toBeNull();
    });

    it("the four children of one parent tile cover its four quadrants exactly, no gaps or overlap", () => {
        const parentTileCoord = { x: 5, y: 10, z: 15 };
        const children = [
            { x: 10, y: 20 }, // top-left
            { x: 11, y: 20 }, // top-right
            { x: 10, y: 21 }, // bottom-left
            { x: 11, y: 21 }, // bottom-right
        ];

        const crops = children.map((c) => computeParentTileCrop({ ...c, z: 16 }, 1, 10));

        expect(crops.every((c) => c?.parent.x === parentTileCoord.x && c?.parent.y === parentTileCoord.y)).toBe(true);
        const corners = crops.map((c) => `${c?.cropX},${c?.cropY}`);
        expect(new Set(corners).size).toBe(4);
    });
});
