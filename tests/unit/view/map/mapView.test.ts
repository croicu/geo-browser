import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GeoCatalog } from "../../../../src/catalog/catalog";
import { GeoStateStore } from "../../../../src/state/geoStateStore";
import { MapViewState } from "../../../../src/state/mapViewState";
import { MapView } from "../../../../src/view/map/mapView";
import { AreaRenderClassifier } from "../../../../src/view/map/areaRenderClassifier";
import { StubActions } from "../../../stubs/stubActions";
import { StubLogger } from "../../../stubs/stubLogger";
import { StubStorage } from "../../../stubs/stubStorage";
import { StubDestinationStore } from "../../../stubs/stubDestinationStore";
import { StubLayerFactory, StubMapFactory, StubWidgetFactory } from "../../../stubs/stubLeafletFactories";
import { stubFetch } from "../../../fakes/fakeFetch";
import { setLogger } from "../../../../src/services";
import type { UserPointsStore } from "../../../../src/contracts";

class StubUserPointsStore implements UserPointsStore {
    async getPoints(): Promise<unknown> {
        return { type: "FeatureCollection", features: [] };
    }
    getPointsSync(): unknown {
        return { type: "FeatureCollection", features: [] };
    }
    async addPoint(): Promise<void> {}
    async removePoint(): Promise<void> {}
}

// Same ~0.05deg bbox shape used in areaLifecycleTracker.test.ts, far enough
// apart that individual/wide viewports can target either or both cleanly.
const AREA_A = {
    id: "a",
    name: "Area A",
    bbox: [14.0, 40.0, 14.05, 40.05] as [number, number, number, number],
    minRadiusPx: 16,
    maxRadiusPx: 64,
    liveMapRadiusPx: 128,
    manifestUrl: "/areas/a/manifest.json",
    images: [],
};
const AREA_B = {
    id: "b",
    name: "Area B",
    bbox: [14.2, 40.2, 14.25, 40.25] as [number, number, number, number],
    minRadiusPx: 16,
    maxRadiusPx: 64,
    liveMapRadiusPx: 128,
    manifestUrl: "/areas/b/manifest.json",
    images: [],
};

const ZOOM_BIG = (() => {
    for (let z = 0; z <= 22; z++) {
        if (AreaRenderClassifier.classifySize(AREA_A.bbox, z) === "big") return z;
    }
    throw new Error("no zoom classifies AREA_A as big");
})();
const ZOOM_SMALL = 0;

// Shape GeoArea.load() expects (AreaDetail: {id, layers}) — empty layers array
// since these MapView tests only exercise residency/current-area wiring, not
// any specific base-layer content. Set *after* buildCatalog(), since the
// catalog fetch itself needs the Catalog shape ({version, createdAt, areas}).
const emptyAreaDetail = { id: "irrelevant", layers: [] };

// Flushes the GeoArea.load() fetch chain (fetch() -> response.json(), each an
// async stub adding its own microtask hop) — a macrotask boundary guarantees
// every pending microtask has run, regardless of exact chain depth.
function flush(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}

async function buildCatalog(areas: typeof AREA_A[]): Promise<GeoCatalog> {
    stubFetch({ version: 1, createdAt: "2026-01-01", areas });
    const catalog = new GeoCatalog("/catalog.json");
    await catalog.load();
    stubFetch(emptyAreaDetail);
    return catalog;
}

function buildView(catalog: GeoCatalog, mapFactory: StubMapFactory, layerFactory: StubLayerFactory, widgetFactory: StubWidgetFactory) {
    const root = document.createElement("div");
    const actions = new StubActions();
    const geoState = new GeoStateStore(new StubStorage());
    const state = new MapViewState();

    const view = new MapView(root, actions, geoState, catalog, state, {
        mapFactory,
        layerFactory,
        widgetFactory,
        userPointsStore: new StubUserPointsStore(),
        destinationStore: new StubDestinationStore(),
    });

    return { view, root };
}

describe("MapView", () => {
    beforeEach(() => {
        setLogger(new StubLogger());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("creates a marker for every catalog area on render()", async () => {
        const catalog = await buildCatalog([AREA_A, AREA_B]);
        const mapFactory = new StubMapFactory();
        const layerFactory = new StubLayerFactory();
        const { view } = buildView(catalog, mapFactory, layerFactory, new StubWidgetFactory());

        // Both areas start small (default StubMap zoom 8, boundsResult [0,0]-[1,1]
        // covers neither) — expect two circle markers, one per area.
        view.render();

        expect((view as any)._markers.size).toBe(2);
    });

    it("loads base layers and attaches the bundle for a big, intersecting area", async () => {
        const catalog = await buildCatalog([AREA_A]);
        const mapFactory = new StubMapFactory();
        const layerFactory = new StubLayerFactory();
        const widgetFactory = new StubWidgetFactory();
        const { view } = buildView(catalog, mapFactory, layerFactory, widgetFactory);

        mapFactory.map.setZoom(ZOOM_BIG);
        mapFactory.map.boundsResult = { sw: [39.9, 13.9], ne: [40.15, 14.15] };

        view.render();
        await flush();

        expect((view as any)._baseLayers.has("a")).toBe(true);
        expect((view as any)._bundle?.areaId).toBe("a");
    });

    it("zooming out without panning hides the bundle and reverts the area to a circle marker", async () => {
        const catalog = await buildCatalog([AREA_A]);
        const mapFactory = new StubMapFactory();
        const layerFactory = new StubLayerFactory();
        const widgetFactory = new StubWidgetFactory();
        const { view } = buildView(catalog, mapFactory, layerFactory, widgetFactory);

        mapFactory.map.setZoom(ZOOM_BIG);
        mapFactory.map.boundsResult = { sw: [39.9, 13.9], ne: [40.15, 14.15] };
        view.render();
        await flush();

        expect((view as any)._bundle?.areaId).toBe("a");

        // Same bounds (never panned), just zoomed out below threshold.
        mapFactory.map.simulateZoom(ZOOM_SMALL);

        expect((view as any)._bundle._attached).toBe(false);
        // AreaMarkerView now shows "a" as a circle again, currently attached.
        const currentCircle = layerFactory.markers[layerFactory.markers.length - 1];
        expect(currentCircle.addToMap).toBe(mapFactory.map);
    });

    it("renders circles/outlines for other areas regardless of which area is current", async () => {
        const catalog = await buildCatalog([AREA_A, AREA_B]);
        const mapFactory = new StubMapFactory();
        const layerFactory = new StubLayerFactory();
        const widgetFactory = new StubWidgetFactory();
        const { view } = buildView(catalog, mapFactory, layerFactory, widgetFactory);

        // Viewport covers only "a" (big, current); "b" sits far outside it but
        // is still classified "small" at this zoom everywhere — it must still
        // render as a circle, independent of "a" owning the current bundle.
        mapFactory.map.setZoom(ZOOM_SMALL);
        mapFactory.map.boundsResult = { sw: [39.9, 13.9], ne: [40.15, 14.15] };
        view.render();
        await flush();

        // Both "a" and "b" are small at ZOOM_SMALL -> two circle markers, no bundle.
        expect(layerFactory.markers.length).toBe(2);
        expect((view as any)._bundle).toBeUndefined();
    });

    it("keeps both areas' base layers loaded concurrently, only one gets the virtual bundle", async () => {
        const catalog = await buildCatalog([AREA_A, AREA_B]);
        const mapFactory = new StubMapFactory();
        const layerFactory = new StubLayerFactory();
        const widgetFactory = new StubWidgetFactory();
        const { view } = buildView(catalog, mapFactory, layerFactory, widgetFactory);

        // Wide viewport containing both areas, zoomed in enough that both are "big".
        mapFactory.map.setZoom(ZOOM_BIG);
        mapFactory.map.boundsResult = { sw: [39.9, 13.9], ne: [40.35, 14.35] };
        view.render();
        await flush();

        expect((view as any)._baseLayers.has("a")).toBe(true);
        expect((view as any)._baseLayers.has("b")).toBe(true);
        // Exactly one bundle, for whichever area is nearest the viewport center.
        expect((view as any)._bundle).toBeDefined();
    });

    it("keeps the same flyout control (and its tile layer) across current-area transitions, never tearing it down", async () => {
        const catalog = await buildCatalog([AREA_A]);
        const mapFactory = new StubMapFactory();
        const layerFactory = new StubLayerFactory();
        const widgetFactory = new StubWidgetFactory();
        const { view } = buildView(catalog, mapFactory, layerFactory, widgetFactory);

        mapFactory.map.setZoom(ZOOM_SMALL);
        view.render();

        const flyoutBefore = (view as any)._flyout;
        expect(flyoutBefore).toBeDefined();
        expect((view as any)._bundle).toBeUndefined();

        mapFactory.map.setZoom(ZOOM_BIG);
        mapFactory.map.boundsResult = { sw: [39.9, 13.9], ne: [40.15, 14.15] };
        mapFactory.map.simulateZoom(ZOOM_BIG);
        await flush();

        expect((view as any)._bundle?.areaId).toBe("a");
        // Same object reference — the flyout (and the tile layer it owns)
        // was never removed/recreated, only its layer list content changed.
        expect((view as any)._flyout).toBe(flyoutBefore);
        expect(flyoutBefore.removed).toBe(false);
    });

    it("tap-to-jump: selecting a circle marker pans/zooms and promotes that area to current", async () => {
        // StubMap.getBoundsZoom() is hardcoded to always return 10 (jumpToArea's
        // zoom source) regardless of the bbox passed in, so this area needs to
        // classify as "big" at zoom 10 specifically — much larger than AREA_A.
        const bigArea = { ...AREA_A, id: "big", bbox: [14.0, 40.0, 14.5, 40.5] as [number, number, number, number] };
        const catalog = await buildCatalog([bigArea]);
        const mapFactory = new StubMapFactory();
        const layerFactory = new StubLayerFactory();
        const widgetFactory = new StubWidgetFactory();
        const { view } = buildView(catalog, mapFactory, layerFactory, widgetFactory);

        mapFactory.map.setZoom(ZOOM_SMALL);
        // boundsResult never updated by setZoom/panTo on the stub, so make it
        // already cover the area — real Leaflet would update it as a side
        // effect of the pan/zoom this test triggers.
        mapFactory.map.boundsResult = { sw: [39.9, 13.9], ne: [40.6, 14.6] };
        view.render();

        expect(layerFactory.markers.length).toBe(1);
        layerFactory.markers[0].clickHandler?.();
        await flush();

        expect((view as any)._bundle?.areaId).toBe("big");
    });

    it("destroys base layers only when a genuinely new area loads, not merely on losing current status", async () => {
        const catalog = await buildCatalog([AREA_A, AREA_B]);
        const mapFactory = new StubMapFactory();
        const layerFactory = new StubLayerFactory();
        const widgetFactory = new StubWidgetFactory();
        const { view } = buildView(catalog, mapFactory, layerFactory, widgetFactory);

        mapFactory.map.setZoom(ZOOM_BIG);
        mapFactory.map.boundsResult = { sw: [39.9, 13.9], ne: [40.15, 14.15] };
        view.render();
        await flush();
        expect((view as any)._baseLayers.has("a")).toBe(true);

        // Pan to a neutral spot containing neither area's bbox nor "b" — triggers
        // the empty-viewport fallback pin on "a" (nearest), so "a" stays resident.
        mapFactory.map.boundsResult = { sw: [-1, -1], ne: [-0.5, -0.5] };
        mapFactory.map.simulateMoveEnd();
        expect((view as any)._baseLayers.has("a")).toBe(true); // still resident (pinned)

        // Now genuinely move to "b" — "a" is swept as a side effect of "b" loading.
        mapFactory.map.boundsResult = { sw: [40.15, 14.15], ne: [40.35, 14.35] };
        mapFactory.map.simulateMoveEnd();
        await flush();

        expect((view as any)._baseLayers.has("b")).toBe(true);
        expect((view as any)._baseLayers.has("a")).toBe(false);
    });
});
