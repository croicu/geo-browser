import { describe, expect, it } from "vitest";
import { CurrentAreaSelector } from "../../../../src/view/map/currentAreaSelector";

describe("CurrentAreaSelector.selectNearest", () => {
    it("returns null for an empty candidate list", () => {
        expect(CurrentAreaSelector.selectNearest([], [40, 14])).toBeNull();
    });

    it("returns the single candidate trivially", () => {
        const candidates = [{ id: "a", center: [40, 14] as [number, number] }];
        expect(CurrentAreaSelector.selectNearest(candidates, [41, 15])).toBe("a");
    });

    it("picks the candidate whose center is closest to the viewport center", () => {
        const candidates = [
            { id: "far", center: [50, 20] as [number, number] },
            { id: "near", center: [40.01, 14.01] as [number, number] },
            { id: "mid", center: [42, 16] as [number, number] },
        ];
        expect(CurrentAreaSelector.selectNearest(candidates, [40, 14])).toBe("near");
    });

    it("breaks exact ties by keeping the first candidate encountered", () => {
        const candidates = [
            { id: "first", center: [41, 15] as [number, number] },
            { id: "second", center: [39, 13] as [number, number] },
        ];
        // Both are equidistant from [40, 14].
        expect(CurrentAreaSelector.selectNearest(candidates, [40, 14])).toBe("first");
    });
});
