import { vi, beforeEach, describe, expect, it } from "vitest";
import { GeoCatalog } from "../../../src/catalog/catalog";
import { SummaryView } from "../../../src/view/summary/summaryView";
import { SummaryViewState } from "../../../src/state/summaryViewState";
import { StubActions } from "../../stubs/stubActions";
import { StubLogger } from "../../stubs/stubLogger";
import {
    StubLayerFactory,
    StubMapFactory,
    StubWidgetFactory,
} from "../../stubs/stubLeafletFactories";
import { setLogger } from "../../../src/services";

describe("SummaryView", () => {
    let root: HTMLElement;
    let actions: StubActions;
    let mapFactory: StubMapFactory;
    let layerFactory: StubLayerFactory;
    let widgetFactory: StubWidgetFactory;

    beforeEach(() => {
        document.body.innerHTML = '<div id="app"></div>';

        const app = document.getElementById("app");
        if (!app) {
            throw new Error("Missing #app.");
        }

        root = app;
        actions = new StubActions();
        mapFactory = new StubMapFactory();
        layerFactory = new StubLayerFactory();
        widgetFactory = new StubWidgetFactory();
        setLogger(new StubLogger());
    });

    it("creates a leaflet-backed summary map", async () => {
        const catalog = await createCatalog();
        const state = new SummaryViewState({
            center: [0, 0],
            zoom: 2,
        });

        const view = new SummaryView(root, actions, catalog, state, {
            mapFactory,
            layerFactory,
            widgetFactory,
        });

        view.create();

        expect(root.querySelector(".summary-view")).not.toBeNull();
        expect(root.querySelector(".summary-map")).not.toBeNull();
    });

    it("renders one bubble marker per catalog area", async () => {
        const catalog = await createCatalog();
        const state = new SummaryViewState({
            center: [0, 0],
            zoom: 2,
        });

        const view = new SummaryView(root, actions, catalog, state, {
            mapFactory,
            layerFactory,
            widgetFactory,
        });

        view.render();

        expect(layerFactory.markers.length).toBe(2);

        for (const marker of layerFactory.markers) {
            expect(marker.addToMap).toBe(mapFactory.map);
        }
    });

    it("opens detail when a bubble marker is clicked", async () => {
        const catalog = await createCatalog();
        const state = new SummaryViewState({
            center: [0, 0],
            zoom: 2,
        });

        const view = new SummaryView(root, actions, catalog, state, {
            mapFactory,
            layerFactory,
            widgetFactory,
        });

        view.render();

        const firstMarker = layerFactory.markers[0];
        expect(firstMarker.clickHandler).toBeDefined();

        firstMarker.clickHandler?.();

        expect(actions.openedDetailAreaId).toBe("napoli");
    });

    it("navigates to detail when zoomed above threshold with area in viewport", async () => {
        vi.useFakeTimers();
        const catalog = await createCatalog();
        const state = new SummaryViewState({ center: [40.85, 14.27], zoom: 2 });

        const view = new SummaryView(root, actions, catalog, state, {
            mapFactory,
            layerFactory,
            widgetFactory,
        });

        view.render();
        vi.advanceTimersByTime(500);

        // Napoli bbox: [west=14.13, south=40.74, east=14.41, north=40.96]
        mapFactory.map.boundsResult = { sw: [40.0, 14.0], ne: [41.5, 15.0] };
        mapFactory.map.simulateZoom(11);

        expect(actions.openedDetailAreaId).toBe("napoli");
        expect(actions.openedDetailCenter).toEqual([0, 0]);
        expect(actions.openedDetailZoom).toBe(11);

        vi.useRealTimers();
    });

    it("does not navigate when no area bbox intersects the viewport", async () => {
        const catalog = await createCatalog();
        const state = new SummaryViewState({ center: [51.5, -0.1], zoom: 2 });

        const view = new SummaryView(root, actions, catalog, state, {
            mapFactory,
            layerFactory,
            widgetFactory,
        });

        view.render();

        // London — no areas here
        mapFactory.map.boundsResult = { sw: [51.0, -1.0], ne: [52.0, 1.0] };
        mapFactory.map.simulateZoom(11);

        expect(actions.openedDetailAreaId).toBeUndefined();
    });

    it("does not navigate when zoom is below threshold", async () => {
        const catalog = await createCatalog();
        const state = new SummaryViewState({ center: [40.85, 14.27], zoom: 2 });

        const view = new SummaryView(root, actions, catalog, state, {
            mapFactory,
            layerFactory,
            widgetFactory,
        });

        view.render();

        mapFactory.map.boundsResult = { sw: [40.0, 14.0], ne: [41.5, 15.0] };
        mapFactory.map.simulateZoom(10);

        expect(actions.openedDetailAreaId).toBeUndefined();
    });

    it("destroys markers and map", async () => {
        const catalog = await createCatalog();
        const state = new SummaryViewState({
            center: [0, 0],
            zoom: 2,
        });

        const view = new SummaryView(root, actions, catalog, state, {
            mapFactory,
            layerFactory,
            widgetFactory,
        });

        view.render();
        view.destroy();

        expect(mapFactory.map.removeCalled).toBe(true);

        for (const marker of layerFactory.markers) {
            expect(marker.removeCalled).toBe(true);
        }

        expect(root.querySelector(".summary-view")).toBeNull();
    });

});

async function createCatalog(): Promise<GeoCatalog> {
    const catalog = new GeoCatalog("/catalog.json");

    vi.stubGlobal("fetch", async (url: string) => {
        if (url === "/catalog.json") {
            return {
                ok: true,
                json: async () => ({
                    version: 1,
                    createdAt: "2026-01-01T00:00:00Z",
                    areas: [
                        {
                            id: "napoli",
                            name: "Napoli",
                            bbox: [14.13, 40.74, 14.41, 40.96],
                            minRadiusPx: 16,
                            maxRadiusPx: 64,
                            liveMapRadiusPx: 256,
                            detailUrl: "/areas/napoli/manifest.json",
                            images: [],
                        },
                        {
                            id: "rome",
                            name: "Rome",
                            bbox: [12.35, 41.79, 12.64, 42.01],
                            minRadiusPx: 16,
                            maxRadiusPx: 64,
                            liveMapRadiusPx: 256,
                            detailUrl: "/areas/rome/manifest.json",
                            images: [],
                        },
                    ],
                }),
            };
        }

        throw new Error(`Unexpected URL: ${url}`);
    });

    await catalog.load();

    vi.unstubAllGlobals();

    return catalog;
}
