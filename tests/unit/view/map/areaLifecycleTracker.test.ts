import { describe, expect, it } from "vitest";
import {
    AreaLifecycleInput,
    AreaLifecycleTracker,
    ViewportSnapshot,
} from "../../../../src/view/map/areaLifecycleTracker";
import { AreaRenderClassifier } from "../../../../src/view/map/areaRenderClassifier";

function findZoom(
    bbox: [number, number, number, number],
    target: "small" | "big",
    start = 0,
    maxZoom = 22
): number {
    for (let z = start; z <= maxZoom; z++) {
        if (AreaRenderClassifier.classifySize(bbox, z) === target) {
            return z;
        }
    }
    throw new Error(`no zoom in [${start}, ${maxZoom}] classifies as "${target}"`);
}

function viewportAround(center: [number, number], halfExtentDeg: number, zoom: number): ViewportSnapshot {
    return {
        bounds: {
            sw: [center[0] - halfExtentDeg, center[1] - halfExtentDeg],
            ne: [center[0] + halfExtentDeg, center[1] + halfExtentDeg],
        },
        zoom,
    };
}

const AREA_A: AreaLifecycleInput = {
    id: "a",
    bbox: [14.0, 40.0, 14.05, 40.05],
    center: [40.025, 14.025],
};
const AREA_B: AreaLifecycleInput = {
    id: "b",
    bbox: [14.2, 40.2, 14.25, 40.25],
    center: [40.225, 14.225],
};
const ANCHOR: AreaLifecycleInput = {
    // Tiny, always classifies "small" at ZOOM_BIG — used only to keep at
    // least one area intersecting the viewport (suppressing the empty-
    // viewport fallback pin) while area A is panned out of view.
    id: "anchor",
    bbox: [0.0, 0.0, 0.0001, 0.0001],
    center: [0.00005, 0.00005],
};

const AREA_LARGE: AreaLifecycleInput = {
    // Physically much bigger than AREA_A/AREA_B — crosses its own 48px
    // pixel-size threshold at a much lower zoom, specifically below
    // MIN_LOADED_ZOOM. Used to exercise the global zoom floor independently
    // of the per-area LOAD_THRESHOLD_PX check.
    id: "large",
    bbox: [15.0, 41.0, 16.0, 42.0],
    center: [41.5, 15.5],
};

const ZOOM_BIG = findZoom(AREA_A.bbox, "big");
const ZOOM_SMALL = 0;
const ZOOM_LARGE_BIG_BELOW_FLOOR = findZoom(AREA_LARGE.bbox, "big", 0, AreaRenderClassifier.MIN_LOADED_ZOOM - 1);

describe("AreaLifecycleTracker", () => {
    it("classifies a small (below-threshold) area as circle regardless of viewport position", () => {
        const tracker = new AreaLifecycleTracker([AREA_A]);
        const t = tracker.recompute(viewportAround(AREA_A.center, 0.3, ZOOM_SMALL));

        expect(t.renderKinds.get("a")).toBe("circle");
        expect(t.toLoad).toEqual([]);
        expect(tracker.getResidency("a")).toBe("none");
    });

    it("renders a big-but-not-intersecting area as outline, never loading it", () => {
        // ANCHOR keeps something intersecting the viewport so the empty-viewport
        // fallback pin (exercised separately below) doesn't kick in here.
        const tracker = new AreaLifecycleTracker([AREA_A, ANCHOR]);
        const t = tracker.recompute(viewportAround(ANCHOR.center, 0.05, ZOOM_BIG));

        expect(t.renderKinds.get("a")).toBe("outline");
        expect(t.toLoad).toEqual([]);
        expect(t.pinnedAreaId).toBeNull();
    });

    it("loads a big, intersecting area immediately and makes it current", () => {
        const tracker = new AreaLifecycleTracker([AREA_A]);
        const t = tracker.recompute(viewportAround(AREA_A.center, 0.3, ZOOM_BIG));

        expect(t.toLoad).toEqual(["a"]);
        expect(t.toShow).toEqual([]);
        expect(t.toHide).toEqual([]);
        expect(t.toDestroy).toEqual([]);
        expect(t.renderKinds.get("a")).toBe("loaded");
        expect(tracker.getResidency("a")).toBe("visible");
        expect(tracker.currentAreaId).toBe("a");
        expect(t.bundle).toEqual({ kind: "build", areaId: "a", previousAreaId: null });
    });

    it("produces an empty diff and a no-op bundle action when the viewport doesn't change", () => {
        const tracker = new AreaLifecycleTracker([AREA_A]);
        const vp = viewportAround(AREA_A.center, 0.3, ZOOM_BIG);
        tracker.recompute(vp);

        const t2 = tracker.recompute(vp);

        expect(t2.toLoad).toEqual([]);
        expect(t2.toShow).toEqual([]);
        expect(t2.toHide).toEqual([]);
        expect(t2.toDestroy).toEqual([]);
        expect(t2.bundle).toEqual({ kind: "none" });
    });

    it("zooming out below threshold while still on-screen hides with an explicit 'hide' and drops to circle", () => {
        const tracker = new AreaLifecycleTracker([AREA_A]);
        tracker.recompute(viewportAround(AREA_A.center, 0.3, ZOOM_BIG));

        const t = tracker.recompute(viewportAround(AREA_A.center, 0.3, ZOOM_SMALL));

        expect(t.toHide).toEqual(["a"]);
        expect(t.toDestroy).toEqual([]);
        expect(t.renderKinds.get("a")).toBe("circle");
        expect(tracker.getResidency("a")).toBe("hidden");
        expect(tracker.currentAreaId).toBeNull();
        expect(t.bundle).toEqual({ kind: "hide", areaId: "a" });
    });

    it("panning fully out of the viewport hides with 'hide-skipped' (content already off-screen)", () => {
        const tracker = new AreaLifecycleTracker([AREA_A, ANCHOR]);
        tracker.recompute(viewportAround(AREA_A.center, 0.3, ZOOM_BIG));

        const t = tracker.recompute(viewportAround(ANCHOR.center, 0.05, ZOOM_BIG));

        expect(t.toHide).toEqual(["a"]);
        expect(t.renderKinds.get("a")).toBe("outline");
        expect(tracker.getResidency("a")).toBe("hidden");
        expect(tracker.currentAreaId).toBeNull();
        expect(t.bundle).toEqual({ kind: "hide-skipped", areaId: "a" });
    });

    it("two overlapping/adjacent areas both load concurrently without exclusivity", () => {
        const tracker = new AreaLifecycleTracker([AREA_A, AREA_B]);
        const midpoint: [number, number] = [
            (AREA_A.center[0] + AREA_B.center[0]) / 2,
            (AREA_A.center[1] + AREA_B.center[1]) / 2,
        ];
        const t = tracker.recompute(viewportAround(midpoint, 0.3, ZOOM_BIG));

        expect(t.toLoad.sort()).toEqual(["a", "b"]);
        expect(t.renderKinds.get("a")).toBe("loaded");
        expect(t.renderKinds.get("b")).toBe("loaded");
    });

    it("re-entering a hidden-but-resident area produces toShow, not toLoad", () => {
        const tracker = new AreaLifecycleTracker([AREA_A, ANCHOR]);
        tracker.recompute(viewportAround(AREA_A.center, 0.3, ZOOM_BIG));
        tracker.recompute(viewportAround(ANCHOR.center, 0.05, ZOOM_BIG));

        const t = tracker.recompute(viewportAround(AREA_A.center, 0.3, ZOOM_BIG));

        expect(t.toLoad).toEqual([]);
        expect(t.toShow).toEqual(["a"]);
        expect(t.renderKinds.get("a")).toBe("loaded");
        expect(t.bundle).toEqual({ kind: "show", areaId: "a" });
    });

    it("a hidden area survives many pan cycles and is destroyed only once a genuinely new area loads", () => {
        const tracker = new AreaLifecycleTracker([AREA_A, AREA_B, ANCHOR]);
        const vpA = viewportAround(AREA_A.center, 0.08, ZOOM_BIG);
        const vpNeutral = viewportAround(ANCHOR.center, 0.05, ZOOM_BIG);
        const vpB = viewportAround(AREA_B.center, 0.08, ZOOM_BIG);

        tracker.recompute(vpA);
        const afterHide = tracker.recompute(vpNeutral);
        expect(afterHide.toHide).toEqual(["a"]);
        expect(afterHide.toDestroy).toEqual([]);

        // Repeated jitter over the neutral viewport must never destroy "a".
        for (let i = 0; i < 5; i++) {
            const t = tracker.recompute(vpNeutral);
            expect(t.toDestroy).toEqual([]);
        }
        expect(tracker.getResidency("a")).toBe("hidden");

        const afterNewLoad = tracker.recompute(vpB);
        expect(afterNewLoad.toLoad).toEqual(["b"]);
        expect(afterNewLoad.toDestroy).toEqual(["a"]);
        expect(tracker.getResidency("a")).toBe("none");
    });

    it("empty-viewport fallback pins the nearest area across the full catalog, exempt from Hide/Destroy", () => {
        const tracker = new AreaLifecycleTracker([AREA_A, AREA_B]);
        const emptyViewport = viewportAround([0, 0], 0.3, ZOOM_BIG);

        const t = tracker.recompute(emptyViewport);

        expect(t.pinnedAreaId).toBe("a"); // AREA_A's center is closer to [0,0] than AREA_B's.
        expect(t.renderKinds.get("a")).toBe("loaded");
        expect(tracker.getResidency("a")).toBe("visible");
        expect(t.toLoad).toEqual(["a"]);
    });

    it("drops the fallback pin the instant a real intersection exists", () => {
        const tracker = new AreaLifecycleTracker([AREA_A, AREA_B]);
        tracker.recompute(viewportAround([0, 0], 0.3, ZOOM_BIG));
        expect(tracker.getResidency("a")).toBe("visible");

        const t = tracker.recompute(viewportAround(AREA_B.center, 0.08, ZOOM_BIG));

        expect(t.pinnedAreaId).toBeNull();
        expect(t.toLoad).toEqual(["b"]);
        // "a" is no longer pinned and no longer intersects, so it loses residency
        // this same tick — and since "b" is a genuinely new load in that same
        // recompute() call, the destroy sweep immediately reclaims it too (a
        // direct jump to a new area, not jitter around a threshold).
        expect(t.toHide).toEqual(["a"]);
        expect(t.toDestroy).toEqual(["a"]);
        expect(tracker.getResidency("a")).toBe("none");
    });

    it("never selects the pinned area as current", () => {
        const tracker = new AreaLifecycleTracker([AREA_A]);
        const t = tracker.recompute(viewportAround([0, 0], 0.3, ZOOM_BIG));

        expect(t.pinnedAreaId).toBe("a");
        expect(tracker.currentAreaId).toBeNull();
        expect(t.bundle).toEqual({ kind: "none" });
    });

    it("switches current area directly between two simultaneously-loaded neighbors", () => {
        const tracker = new AreaLifecycleTracker([AREA_A, AREA_B]);

        // Both load, viewport centered on A -> A is current.
        tracker.recompute(viewportAround(AREA_A.center, 0.3, ZOOM_BIG));
        expect(tracker.currentAreaId).toBe("a");

        // Re-center on B (still wide enough that both stay resident/visible).
        const t = tracker.recompute(viewportAround(AREA_B.center, 0.3, ZOOM_BIG));

        expect(t.toLoad).toEqual([]); // both already resident, nothing new fetched
        expect(tracker.getResidency("a")).toBe("visible");
        expect(tracker.currentAreaId).toBe("b");
        expect(t.bundle).toEqual({ kind: "build", areaId: "b", previousAreaId: "a" });
    });

    it("participates newly-added areas in the very next recompute", () => {
        const tracker = new AreaLifecycleTracker([AREA_A]);
        tracker.recompute(viewportAround(AREA_A.center, 0.3, ZOOM_BIG));

        tracker.addArea(AREA_B);
        const t = tracker.recompute(viewportAround(AREA_B.center, 0.08, ZOOM_BIG));

        expect(t.toLoad).toEqual(["b"]);
        expect(t.renderKinds.get("b")).toBe("loaded");
    });

    it("a big-enough, intersecting area below the global zoom floor renders as an outline (not circle) and never loads", () => {
        expect(ZOOM_LARGE_BIG_BELOW_FLOOR).toBeLessThan(AreaRenderClassifier.MIN_LOADED_ZOOM);

        const tracker = new AreaLifecycleTracker([AREA_LARGE]);
        const t = tracker.recompute(viewportAround(AREA_LARGE.center, 1, ZOOM_LARGE_BIG_BELOW_FLOOR));

        // Circle vs. outline is purely a bbox-size question; the zoom floor
        // only gates loaded vs. outline, per tasks/layer_lifecycle.md.
        expect(t.renderKinds.get("large")).toBe("outline");
        expect(t.toLoad).toEqual([]);
        expect(tracker.getResidency("large")).toBe("none");
        expect(tracker.currentAreaId).toBeNull();
    });

    it("regression: zooming out below the global floor does not hand current status to a peripheral area whose own threshold is crossed at that same low zoom (the reported 'ghost heatmap' bug)", () => {
        const tracker = new AreaLifecycleTracker([AREA_A, AREA_LARGE]);
        tracker.recompute(viewportAround(AREA_A.center, 0.3, ZOOM_BIG));
        expect(tracker.currentAreaId).toBe("a");

        const midpoint: [number, number] = [
            (AREA_A.center[0] + AREA_LARGE.center[0]) / 2,
            (AREA_A.center[1] + AREA_LARGE.center[1]) / 2,
        ];
        const t = tracker.recompute(viewportAround(midpoint, 2, ZOOM_LARGE_BIG_BELOW_FLOOR));

        // AREA_A drops below its own (small-bbox) threshold, so it's a
        // circle. AREA_LARGE crosses its own (much lower) threshold in this
        // exact tick and is still bbox-big enough for an outline -- but
        // both are below MIN_LOADED_ZOOM, so neither loads/becomes current.
        expect(t.renderKinds.get("a")).toBe("circle");
        expect(t.renderKinds.get("large")).toBe("outline");
        expect(t.toLoad).toEqual([]);
        expect(tracker.currentAreaId).toBeNull();
        expect(["hide", "hide-skipped"]).toContain(t.bundle.kind);
    });
});
