import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DetailView } from "../../../src/view/detail/detailView";
import type { UserPointsStore } from "../../../src/contracts";
import { GeoLayer } from "../../../src/catalog/layer";
import { PoiLayerView } from "../../../src/view/detail/poiLayerView";
import { StubActions } from "../../stubs/stubActions";
import { StubLogger } from "../../stubs/stubLogger";
import { StubLayerFactory, StubMapFactory, StubWidgetFactory } from "../../stubs/stubLeafletFactories";
import { setLogger } from "../../../src/services";

class StubUserPointsStore implements UserPointsStore {
    public getPointsCallCount = 0;
    private _points: unknown[] = [];

    setPoints(points: unknown[]): void {
        this._points = points;
    }

    getPointsSync(_areaId: string): unknown {
        return { type: "FeatureCollection", features: this._points };
    }

    async getPoints(_areaId: string): Promise<unknown> {
        this.getPointsCallCount++;
        return this.getPointsSync(_areaId);
    }

    async addPoint(): Promise<void> {}
    async removePoint(): Promise<void> {}
}

const fakeArea = {
    id: "napoli",
    center: [40.8518, 14.2681] as [number, number],
    bbox: [14.25, 40.84, 14.28, 40.86] as [number, number, number, number],
    summary: {
        id: "napoli",
        name: "Napoli",
        bbox: [14.25, 40.84, 14.28, 40.86] as [number, number, number, number],
        minRadiusPx: 32,
        maxRadiusPx: 256,
        liveMapRadiusPx: 128,
        manifestUrl: "/areas/napoli/manifest.json",
        images: [],
    },
    isLoaded: () => true,
    layers: [],
};

const fakeState = {
    center: [40.8518, 14.2681],
    zoom: 13,
    isLayerVisible: (_id: string, def: boolean) => def ?? true,
    setLayerVisible: (_id: string, _visible: boolean) => {},
};

describe("DetailView", () => {
    beforeEach(() => {
        setLogger(new StubLogger());
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("renders detail map root", () => {
        const root = document.createElement("div");

        const view = new DetailView(
            root,
            new StubActions(),
            fakeArea as any,
            fakeState as any,
            {
                mapFactory: new StubMapFactory(),
                layerFactory: new StubLayerFactory(),
                widgetFactory: new StubWidgetFactory(),
            }
        );

        view.render();

        expect(root.querySelector(".detail-view")).not.toBeNull();
        expect(root.querySelector(".detail-map")).not.toBeNull();
    });

    it("destroy removes detail view", () => {
        const root = document.createElement("div");

        const view = new DetailView(
            root,
            new StubActions(),
            fakeArea as any,
            fakeState as any,
            {
                mapFactory: new StubMapFactory(),
                layerFactory: new StubLayerFactory(),
                widgetFactory: new StubWidgetFactory(),
            }
        );

        view.render();
        view.destroy();

        expect(root.querySelector(".detail-view")).toBeNull();
    });

    it("render is idempotent", () => {
        const root = document.createElement("div");

        const view = new DetailView(
            root,
            new StubActions(),
            fakeArea as any,
            fakeState as any,
            {
                mapFactory: new StubMapFactory(),
                layerFactory: new StubLayerFactory(),
                widgetFactory: new StubWidgetFactory(),
            }
        );

        view.render();
        view.render();

        expect(root.querySelectorAll(".detail-view").length).toBe(1);
        expect(root.querySelectorAll(".detail-map").length).toBe(1);
    });

    it("synthesizes the search control when the manifest has no __search__ layer", () => {
        const root = document.createElement("div");
        const mapFactory = new StubMapFactory();
        const widgetFactory = new StubWidgetFactory();
        const logger = new StubLogger();

        setLogger(logger);

        // fakeArea.layers is [] — no __search__ layer, same as an area created
        // by geo-builder's AddArea pipeline, which has no knowledge of __search__.
        const view = new DetailView(
            root,
            new StubActions(),
            fakeArea as any,
            fakeState as any,
            {
                mapFactory,
                layerFactory: new StubLayerFactory(),
                widgetFactory,
            }
        );

        view.render();

        expect(widgetFactory.lastSearchControl).toBeDefined();
        expect(widgetFactory.lastSearchControl?.addedTo).toBe(mapFactory.map);
        expect(logger.warningCalls.find(c => c.message === "search_layer.synthesize")).toBeDefined();
    });

    it("opens empty-space callout on map click", () => {
        const root = document.createElement("div");
        const mapFactory = new StubMapFactory();
        const logger = new StubLogger();

        setLogger(logger);

        const view = new DetailView(
            root,
            new StubActions(),
            fakeArea as any,
            fakeState as any,
            {
                mapFactory,
                layerFactory: new StubLayerFactory(),
                widgetFactory: new StubWidgetFactory(),
            }
        );

        view.render();
        mapFactory.map.setZoom(18);
        mapFactory.map.simulateClick([40.8518, 14.2681]);

        const startCall = logger.infoCalls.find(c => c.message === "map.empty_tap.start");
        expect(startCall).toBeDefined();
        expect(startCall?.props).toEqual({ lat: 40.8518, lng: 14.2681 });

        expect(mapFactory.map.lastPopup).toBeDefined();
        expect(mapFactory.map.lastPopup?.latLng).toEqual([40.8518, 14.2681]);
    });

    it("does not open the empty-space callout when below the POI min zoom", () => {
        const root = document.createElement("div");
        const mapFactory = new StubMapFactory();
        const logger = new StubLogger();

        setLogger(logger);

        const view = new DetailView(
            root,
            new StubActions(),
            fakeArea as any,
            fakeState as any,
            {
                mapFactory,
                layerFactory: new StubLayerFactory(),
                widgetFactory: new StubWidgetFactory(),
            }
        );

        view.render();
        mapFactory.map.setZoom(15);
        mapFactory.map.simulateClick([40.8518, 14.2681]);

        expect(logger.infoCalls.find(c => c.message === "map.empty_tap.noop")).toBeDefined();
        expect(logger.infoCalls.find(c => c.message === "map.empty_tap.start")).toBeUndefined();
        expect(mapFactory.map.lastPopup).toBeUndefined();
    });

    it("uses the area's __poi__ layer minZoom instead of the default when present", () => {
        const root = document.createElement("div");
        const mapFactory = new StubMapFactory();
        const logger = new StubLogger();

        setLogger(logger);

        // visible: false so renderLayerViews skips instantiating a real PoiLayerView
        // (it always uses the real Leaflet factory, which StubMap can't satisfy);
        // poiMinZoom() only needs to find the layer config, not render it.
        const poiLayer = new GeoLayer({ id: "__poi__", name: "POI", type: "__poi__", url: null, visible: false, style: { minZoom: 14 } });
        const area = { ...fakeArea, layers: [poiLayer] };

        const view = new DetailView(
            root,
            new StubActions(),
            area as any,
            fakeState as any,
            {
                mapFactory,
                layerFactory: new StubLayerFactory(),
                widgetFactory: new StubWidgetFactory(),
            }
        );

        view.render();
        mapFactory.map.setZoom(15);
        mapFactory.map.simulateClick([40.8518, 14.2681]);

        // zoom 15 is below the default 16 but above this area's configured minZoom of 14
        expect(logger.infoCalls.find(c => c.message === "map.empty_tap.start")).toBeDefined();
        expect(mapFactory.map.lastPopup).toBeDefined();
    });

    it("dismisses empty-space callout on second tap outside", () => {
        const root = document.createElement("div");
        const mapFactory = new StubMapFactory();
        const logger = new StubLogger();

        setLogger(logger);

        const view = new DetailView(
            root,
            new StubActions(),
            fakeArea as any,
            fakeState as any,
            {
                mapFactory,
                layerFactory: new StubLayerFactory(),
                widgetFactory: new StubWidgetFactory(),
            }
        );

        view.render();
        mapFactory.map.setZoom(18);
        mapFactory.map.simulateClick([40.8518, 14.2681]);
        const popup = mapFactory.map.lastPopup!;

        mapFactory.map.simulateClick([40.9000, 14.3000]);

        expect(popup.removed).toBe(true);
        expect(logger.infoCalls.find(c => c.message === "map.empty_tap.dismiss")).toBeDefined();
    });

    it("dismisses an open POI popup on next map click without opening the user-point callout", () => {
        const root = document.createElement("div");
        const mapFactory = new StubMapFactory();
        const logger = new StubLogger();

        setLogger(logger);

        const view = new DetailView(
            root,
            new StubActions(),
            fakeArea as any,
            fakeState as any,
            {
                mapFactory,
                layerFactory: new StubLayerFactory(),
                widgetFactory: new StubWidgetFactory(),
            }
        );

        view.render();
        mapFactory.map.setZoom(18);

        // PoiLayerView.render() always uses the real Leaflet-backed factory (not the
        // injected one), so it can't be exercised against StubMap in a unit test.
        // Construct it directly (without calling render()) and poke its private
        // popup field to simulate "a POI popup is currently open" — this is the
        // condition DetailView.onMapClick must react to.
        const poiLayer = new GeoLayer({ id: "__poi__", name: "POI", type: "__poi__", url: null, visible: true });
        const poiView = new PoiLayerView(mapFactory.map, poiLayer, [], new StubLayerFactory());
        (poiView as any)._activePopup = mapFactory.map.createPopup([40.8518, 14.2681], document.createElement("div"));
        const poiPopup = mapFactory.map.lastPopup!;

        (view as any)._layerViews.set("__poi__", poiView);

        (view as any).onMapClick([40.9000, 14.3000]);

        expect(logger.infoCalls.find(c => c.message === "map.poi_popup.dismiss_only")).toBeDefined();
        expect(logger.infoCalls.find(c => c.message === "map.empty_tap.start")).toBeUndefined();
        expect(poiPopup.removed).toBe(false); // dismissal of the actual popup is PoiLayerView's own click handler's job

        (poiView as any)._activePopup = undefined;
        (view as any).onMapClick([40.9000, 14.3000]);

        expect(logger.infoCalls.find(c => c.message === "map.empty_tap.start")).toBeDefined();
        expect(mapFactory.map.lastPopup).not.toBe(poiPopup);
    });

    it("navigates to summary when bbox pans off screen", () => {
        const root = document.createElement("div");
        const mapFactory = new StubMapFactory();
        const actions = new StubActions();

        const view = new DetailView(
            root,
            actions,
            fakeArea as any,
            fakeState as any,
            {
                mapFactory,
                layerFactory: new StubLayerFactory(),
                widgetFactory: new StubWidgetFactory(),
            }
        );

        view.render();
        // Viewport completely outside fakeArea bbox [west=14.25, south=40.84, east=14.28, north=40.86]
        mapFactory.map.boundsResult = { sw: [50, 0], ne: [60, 10] };
        mapFactory.map.simulateMoveEnd();

        expect(actions.openedSummary).toBe(true);
        expect(actions.openedSummaryCenter).toEqual([0, 0]);
    });

    it("stays in detail view when bbox is still visible after pan", () => {
        const root = document.createElement("div");
        const mapFactory = new StubMapFactory();
        const actions = new StubActions();

        const view = new DetailView(
            root,
            actions,
            fakeArea as any,
            fakeState as any,
            {
                mapFactory,
                layerFactory: new StubLayerFactory(),
                widgetFactory: new StubWidgetFactory(),
            }
        );

        view.render();
        // Viewport overlaps with fakeArea bbox [west=14.25, south=40.84, east=14.28, north=40.86]
        mapFactory.map.boundsResult = { sw: [40, 14], ne: [42, 15] };
        mapFactory.map.simulateMoveEnd();

        expect(actions.openedSummary).toBe(false);
    });

    const fakeUserLayer = {
        id: "__user__",
        type: "__user__",
        name: "My Trip",
        isVisible: () => true,
        isVirtual: () => true,
        style: { color: "#ff6600" },
    };

    const fakeAreaWithUser = { ...fakeArea, layers: [fakeUserLayer] };

    it("export calls getPoints on the user points store", async () => {
        const root = document.createElement("div");
        const mapFactory = new StubMapFactory();
        const widgetFactory = new StubWidgetFactory();
        const store = new StubUserPointsStore();
        store.setPoints([{ type: "Feature", geometry: { type: "Point", coordinates: [14.27, 40.85] }, properties: {} }]);

        vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");
        vi.spyOn(URL, "revokeObjectURL").mockReturnValue(undefined);

        const view = new DetailView(
            root,
            new StubActions(),
            fakeAreaWithUser as any,
            fakeState as any,
            {
                mapFactory,
                layerFactory: new StubLayerFactory(),
                widgetFactory,
                userPointsStore: store,
            }
        );

        view.render();
        await Promise.resolve(); // user layer getPoints resolves
        await Promise.resolve(); // .then → rebuildLayersWidget fires

        widgetFactory.lastExportUserPoints?.();
        await Promise.resolve();

        // export uses cached payload — store called once (by render), createObjectURL once (by download)
        expect(store.getPointsCallCount).toBe(1);
        expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    });

    it("export button is hidden when store is empty", async () => {
        const root = document.createElement("div");
        const mapFactory = new StubMapFactory();
        const widgetFactory = new StubWidgetFactory();
        const store = new StubUserPointsStore();
        const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");
        vi.spyOn(URL, "revokeObjectURL").mockReturnValue(undefined);

        const view = new DetailView(
            root,
            new StubActions(),
            fakeAreaWithUser as any,
            fakeState as any,
            {
                mapFactory,
                layerFactory: new StubLayerFactory(),
                widgetFactory,
                userPointsStore: store,
            }
        );

        view.render();
        await Promise.resolve(); // user layer getPoints resolves
        await Promise.resolve(); // .then → rebuildLayersWidget fires (hasUserPoints = false)

        // callback not set — button is hidden
        expect(widgetFactory.lastExportUserPoints).toBeUndefined();
        widgetFactory.lastExportUserPoints?.();

        expect(createObjectURL).not.toHaveBeenCalled();
    });

    it("deletes an existing user point via the callout's delete button", async () => {
        const root = document.createElement("div");
        const mapFactory = new StubMapFactory();
        const layerFactory = new StubLayerFactory();
        const logger = new StubLogger();
        const store = new StubUserPointsStore();
        store.setPoints([
            { type: "Feature", geometry: { type: "Point", coordinates: [14.2681, 40.8518] }, properties: {} },
        ]);

        setLogger(logger);

        const view = new DetailView(
            root,
            new StubActions(),
            fakeAreaWithUser as any,
            fakeState as any,
            {
                mapFactory,
                layerFactory,
                widgetFactory: new StubWidgetFactory(),
                userPointsStore: store,
            }
        );

        view.render();
        await Promise.resolve(); // user layer getPoints resolves
        await Promise.resolve(); // .then → rebuildLayersWidget fires

        expect(layerFactory.markers.length).toBe(1);
        layerFactory.markers[0].clickHandler?.();

        const popup = mapFactory.map.lastPopup!;
        const deleteBtn = popup.element.querySelector(".callout-delete-btn") as HTMLButtonElement | null;
        expect(deleteBtn).not.toBeNull();
        expect(popup.element.querySelector(".callout-bookmark-btn")).toBeNull();

        deleteBtn!.click();

        expect(layerFactory.markers[0].removeCalled).toBe(true);
        expect(popup.removed).toBe(true);
        expect(logger.infoCalls.find(c => c.message === "user_layer.marker_delete.end")).toBeDefined();
    });
});
