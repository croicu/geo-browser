import { describe, expect, it } from "vitest";
import { AreaRenderClassifier } from "../../../../src/view/map/areaRenderClassifier";
import { bboxPixelSize } from "../../../../src/geo/mercator";

describe("AreaRenderClassifier.classifySize", () => {
    const tinyBbox: [number, number, number, number] = [14.000, 40.000, 14.0002, 40.0002];
    const bigBbox: [number, number, number, number] = [14.0, 40.0, 14.5, 40.5];

    it("classifies a bbox far below threshold as small", () => {
        expect(AreaRenderClassifier.classifySize(tinyBbox, 10)).toBe("small");
    });

    it("classifies a bbox far above threshold as big", () => {
        expect(AreaRenderClassifier.classifySize(bigBbox, 15)).toBe("big");
    });

    it("classifies the same bbox as small at low zoom and big at high zoom", () => {
        // A ~500m-wide bbox: tiny at zoom 5, clearly big at zoom 18.
        const bbox: [number, number, number, number] = [14.000, 40.000, 14.006, 40.004];
        expect(AreaRenderClassifier.classifySize(bbox, 5)).toBe("small");
        expect(AreaRenderClassifier.classifySize(bbox, 18)).toBe("big");
    });

    it("uses an inclusive >= comparison against the threshold", () => {
        // bboxPixelSize is deterministic, so back into a zoom that lands the max
        // dimension exactly on LOAD_THRESHOLD_PX and confirm it classifies as "big".
        const bbox: [number, number, number, number] = [14.000, 40.000, 14.006, 40.004];
        let zoom = 0;
        while (AreaRenderClassifier.classifySize(bbox, zoom) === "small") {
            zoom++;
        }
        expect(AreaRenderClassifier.classifySize(bbox, zoom)).toBe("big");
        expect(AreaRenderClassifier.classifySize(bbox, zoom - 1)).toBe("small");
    });

    it("exposes LOAD_THRESHOLD_PX as 48 (the spec's starting N value)", () => {
        expect(AreaRenderClassifier.LOAD_THRESHOLD_PX).toBe(48);
    });

    it("compares bbox *area* against the area of a LOAD_THRESHOLD_PX-diameter circle, not max(width, height) against N", () => {
        // A long, thin strip: its longer dimension alone clears N, but its
        // rectangle area is far smaller than the reference circle's area --
        // proves the check is area-based, not a single-dimension check.
        const stripBbox: [number, number, number, number] = [14.000, 40.000, 14.30, 40.0005];
        const zoom = 10;
        const { widthPx, heightPx } = bboxPixelSize(stripBbox, zoom);
        const circleAreaPx = Math.PI * (AreaRenderClassifier.LOAD_THRESHOLD_PX / 2) ** 2;

        expect(Math.max(widthPx, heightPx)).toBeGreaterThanOrEqual(AreaRenderClassifier.LOAD_THRESHOLD_PX);
        expect(widthPx * heightPx).toBeLessThan(circleAreaPx);
        expect(AreaRenderClassifier.classifySize(stripBbox, zoom)).toBe("small");
    });
});
