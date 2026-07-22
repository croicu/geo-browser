import { bboxPixelSize } from "../../geo/mercator";

export type AreaSizeClass = "small" | "big";

// Pure pixel-size check per tasks/layer_lifecycle.md's Rendering States table.
// Says nothing about load/residency — see AreaLifecycleTracker for that.
export class AreaRenderClassifier {
    // Diameter, in px, of the fixed-size circle marker an area collapses to
    // once its bbox is too small to usefully show as a rectangle — see
    // classifySize's doc comment. Also the marker's actual rendered diameter
    // (AreaMarkerView) — one named constant for both.
    static readonly LOAD_THRESHOLD_PX = 48;

    // Global zoom floor, the same for every area regardless of its own bbox
    // size — below this, no area's layers are ever shown (matches the old
    // Summary/Detail split's zoom<minZoom exit boundary, which the
    // viewport-driven tracker otherwise has no equivalent for; see
    // tasks/layer_lifecycle.md). Independent of classifySize: an area can be
    // "big" (outline-worthy) below this floor, it just won't load — it stays
    // an outline instead of collapsing to a circle. Tunable like
    // LOAD_THRESHOLD_PX — needs an on-device check.
    static readonly MIN_LOADED_ZOOM = 10;

    // Compares the bbox's on-screen *area* (width x height in px) against the
    // area of a circle whose diameter is LOAD_THRESHOLD_PX -- not a simple
    // width/height vs. N comparison. Below that area, the rectangle outline
    // would be smaller than the fixed-size circle marker it'd collapse to,
    // so the circle is what's actually shown (see tasks/layer_lifecycle.md).
    static classifySize(
        bbox: [number, number, number, number],
        zoom: number
    ): AreaSizeClass {
        const { widthPx, heightPx } = bboxPixelSize(bbox, zoom);
        const bboxAreaPx = widthPx * heightPx;
        const circleRadiusPx = AreaRenderClassifier.LOAD_THRESHOLD_PX / 2;
        const circleAreaPx = Math.PI * circleRadiusPx * circleRadiusPx;
        return bboxAreaPx >= circleAreaPx ? "big" : "small";
    }
}
