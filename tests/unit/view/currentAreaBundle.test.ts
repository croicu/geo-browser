import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CurrentAreaBundle } from "../../../src/view/detail/currentAreaBundle";
import type { CurrentAreaBundleOptions } from "../../../src/view/detail/currentAreaBundle";
import { DestinationWidget } from "../../../src/view/detail/destinationWidget";
import type { UserPointsStore, DestinationStore } from "../../../src/contracts";
import { GeoLayer } from "../../../src/catalog/layer";
import { PoiLayerView } from "../../../src/view/detail/poiLayerView";
import { StubActions } from "../../stubs/stubActions";
import { StubLogger } from "../../stubs/stubLogger";
import { StubLayerFactory, StubMap, StubWidgetFactory } from "../../stubs/stubLeafletFactories";
import { StubDestinationStore } from "../../stubs/stubDestinationStore";
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

// Mirrors the construction dance MapView performs: DestinationWidget must be
// built before CurrentAreaBundle (it's injected in), but its onMarkerTapped
// callback needs to dispatch into whichever bundle currently exists — so the
// callback closes over a mutable reference assigned right after.
function buildBundle(
    area: unknown,
    state: unknown,
    overrides: Partial<CurrentAreaBundleOptions> & { map?: StubMap } = {}
): {
    view: CurrentAreaBundle;
    map: StubMap;
    layerFactory: StubLayerFactory;
    widgetFactory: StubWidgetFactory;
    destinationStore: DestinationStore;
} {
    const map = overrides.map ?? new StubMap();
    const layerFactory = overrides.layerFactory as StubLayerFactory ?? new StubLayerFactory();
    const widgetFactory = overrides.widgetFactory as StubWidgetFactory ?? new StubWidgetFactory();
    const destinationStore = overrides.destinationStore ?? new StubDestinationStore();

    let view: CurrentAreaBundle | undefined;
    const destinationWidget = new DestinationWidget(map, layerFactory, destinationStore, {
        onMarkerTapped: point => view?.onDestinationMarkerTapped(point),
    });
    destinationWidget.render();

    view = new CurrentAreaBundle(
        map,
        new StubActions(),
        area as any,
        state as any,
        {
            layerFactory,
            widgetFactory,
            flyout: widgetFactory.flyout,
            userPointsStore: overrides.userPointsStore ?? new StubUserPointsStore(),
            destinationStore,
            destinationWidget,
            ...overrides,
        }
    );

    return { view, map, layerFactory, widgetFactory, destinationStore };
}

describe("CurrentAreaBundle", () => {
    beforeEach(() => {
        setLogger(new StubLogger());
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("synthesizes the search control when the manifest has no __search__ layer", () => {
        const logger = new StubLogger();
        setLogger(logger);

        // fakeArea.layers is [] — no __search__ layer, same as an area created
        // by geo-builder's AddArea pipeline, which has no knowledge of __search__.
        const { view, map, widgetFactory } = buildBundle(fakeArea, fakeState);

        view.attach();

        expect(widgetFactory.lastSearchControl).toBeDefined();
        expect(widgetFactory.lastSearchControl?.addedTo).toBe(map);
        expect(logger.warningCalls.find(c => c.message === "search_layer.synthesize")).toBeDefined();
    });

    it("opens empty-space callout on map click", () => {
        const logger = new StubLogger();
        setLogger(logger);

        const { view, map } = buildBundle(fakeArea, fakeState);
        view.attach();
        map.setZoom(18);
        map.simulateClick([40.8518, 14.2681]);

        const startCall = logger.infoCalls.find(c => c.message === "map.empty_tap.start");
        expect(startCall).toBeDefined();
        expect(startCall?.props).toEqual({ lat: 40.8518, lng: 14.2681 });

        expect(map.lastPopup).toBeDefined();
        expect(map.lastPopup?.latLng).toEqual([40.8518, 14.2681]);
    });

    it("does not open the empty-space callout when below the POI min zoom", () => {
        const logger = new StubLogger();
        setLogger(logger);

        const { view, map } = buildBundle(fakeArea, fakeState);
        view.attach();
        map.setZoom(15);
        map.simulateClick([40.8518, 14.2681]);

        expect(logger.infoCalls.find(c => c.message === "map.empty_tap.noop")).toBeDefined();
        expect(logger.infoCalls.find(c => c.message === "map.empty_tap.start")).toBeUndefined();
        expect(map.lastPopup).toBeUndefined();
    });

    it("uses the area's __poi__ layer minZoom instead of the default when present", () => {
        const logger = new StubLogger();
        setLogger(logger);

        // visible: false so renderLayerViews skips instantiating a real PoiLayerView
        // (it always uses the real Leaflet factory, which StubMap can't satisfy);
        // poiMinZoom() only needs to find the layer config, not render it.
        const poiLayer = new GeoLayer({ id: "__poi__", name: "POI", type: "__poi__", url: null, visible: false, style: { minZoom: 14 } });
        const area = { ...fakeArea, layers: [poiLayer] };

        const { view, map } = buildBundle(area, fakeState);
        view.attach();
        map.setZoom(15);
        map.simulateClick([40.8518, 14.2681]);

        // zoom 15 is below the default 16 but above this area's configured minZoom of 14
        expect(logger.infoCalls.find(c => c.message === "map.empty_tap.start")).toBeDefined();
        expect(map.lastPopup).toBeDefined();
    });

    it("dismisses empty-space callout on second tap outside", () => {
        const logger = new StubLogger();
        setLogger(logger);

        const { view, map } = buildBundle(fakeArea, fakeState);
        view.attach();
        map.setZoom(18);
        map.simulateClick([40.8518, 14.2681]);
        const popup = map.lastPopup!;

        map.simulateClick([40.9000, 14.3000]);

        expect(popup.removed).toBe(true);
        expect(logger.infoCalls.find(c => c.message === "map.empty_tap.dismiss")).toBeDefined();
    });

    it("dismisses an open POI popup on next map click without opening the user-point callout", () => {
        const logger = new StubLogger();
        setLogger(logger);

        const { view, map, layerFactory } = buildBundle(fakeArea, fakeState);
        view.attach();
        map.setZoom(18);

        // PoiLayerView.render() always uses the real Leaflet-backed factory (not the
        // injected one), so it can't be exercised against StubMap in a unit test.
        // Construct it directly (without calling render()) and poke its private
        // popup field to simulate "a POI popup is currently open" — this is the
        // condition CurrentAreaBundle.onMapClick must react to.
        const poiLayer = new GeoLayer({ id: "__poi__", name: "POI", type: "__poi__", url: null, visible: true });
        const poiView = new PoiLayerView(map, poiLayer, [], layerFactory);
        (poiView as any)._activePopup = map.createPopup([40.8518, 14.2681], document.createElement("div"));
        const poiPopup = map.lastPopup!;

        (view as any)._layerViews.set("__poi__", poiView);

        (view as any).onMapClick([40.9000, 14.3000]);

        expect(logger.infoCalls.find(c => c.message === "map.poi_popup.dismiss_only")).toBeDefined();
        expect(logger.infoCalls.find(c => c.message === "map.empty_tap.start")).toBeUndefined();
        expect(poiPopup.removed).toBe(false); // dismissal of the actual popup is PoiLayerView's own click handler's job

        (poiView as any)._activePopup = undefined;
        (view as any).onMapClick([40.9000, 14.3000]);

        expect(logger.infoCalls.find(c => c.message === "map.empty_tap.start")).toBeDefined();
        expect(map.lastPopup).not.toBe(poiPopup);
    });

    it("hides and re-shows without rebuilding layer views", () => {
        const { view } = buildBundle(fakeArea, fakeState);
        view.attach();

        const layerViews = (view as any)._layerViews as Map<string, unknown>;
        const sizeBefore = layerViews.size;

        view.hide();
        view.show();

        expect(layerViews.size).toBe(sizeBefore);
    });

    it("hide() is a no-op before attach(), show() is a no-op while attached", () => {
        const { view } = buildBundle(fakeArea, fakeState);

        expect(() => view.hide()).not.toThrow();

        view.attach();
        expect(() => view.show()).not.toThrow();
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
        const widgetFactory = new StubWidgetFactory();
        const store = new StubUserPointsStore();
        store.setPoints([{ type: "Feature", geometry: { type: "Point", coordinates: [14.27, 40.85] }, properties: {} }]);

        vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");
        vi.spyOn(URL, "revokeObjectURL").mockReturnValue(undefined);

        const { view } = buildBundle(fakeAreaWithUser, fakeState, { widgetFactory, userPointsStore: store });
        view.attach();
        await Promise.resolve(); // user layer getPoints resolves
        await Promise.resolve(); // .then → rebuildLayersWidget fires

        widgetFactory.lastExportUserPoints?.();
        await Promise.resolve();

        // export uses cached payload — store called once (by attach), createObjectURL once (by download)
        expect(store.getPointsCallCount).toBe(1);
        expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    });

    it("export button is hidden when store is empty", async () => {
        const widgetFactory = new StubWidgetFactory();
        const store = new StubUserPointsStore();
        const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fake");
        vi.spyOn(URL, "revokeObjectURL").mockReturnValue(undefined);

        const { view } = buildBundle(fakeAreaWithUser, fakeState, { widgetFactory, userPointsStore: store });
        view.attach();
        await Promise.resolve();
        await Promise.resolve();

        // callback not set — button is hidden
        expect(widgetFactory.lastExportUserPoints).toBeUndefined();
        widgetFactory.lastExportUserPoints?.();

        expect(createObjectURL).not.toHaveBeenCalled();
    });

    it("deletes an existing user point via the callout's delete button", async () => {
        const logger = new StubLogger();
        setLogger(logger);
        const layerFactory = new StubLayerFactory();
        const store = new StubUserPointsStore();
        store.setPoints([
            { type: "Feature", geometry: { type: "Point", coordinates: [14.2681, 40.8518] }, properties: {} },
        ]);

        const { view, map } = buildBundle(fakeAreaWithUser, fakeState, { layerFactory, userPointsStore: store });
        view.attach();
        await Promise.resolve();
        await Promise.resolve();

        expect(layerFactory.markers.length).toBe(1);
        layerFactory.markers[0].clickHandler?.();

        const popup = map.lastPopup!;
        const deleteBtn = popup.element.querySelector(".callout-delete-btn") as HTMLButtonElement | null;
        expect(deleteBtn).not.toBeNull();
        expect(popup.element.querySelector(".callout-bookmark-btn")).toBeNull();

        deleteBtn!.click();

        expect(layerFactory.markers[0].removeCalled).toBe(true);
        expect(popup.removed).toBe(true);
        expect(logger.infoCalls.find(c => c.message === "user_layer.marker_delete.end")).toBeDefined();
    });

    describe("destination", () => {
        it("sets a destination via the empty-space callout's destination button", () => {
            setLogger(new StubLogger());
            const layerFactory = new StubLayerFactory();
            const store = new StubDestinationStore();

            const { view, map } = buildBundle(fakeArea, fakeState, { layerFactory, destinationStore: store });
            view.attach();
            map.setZoom(18);
            map.simulateClick([40.8518, 14.2681]);

            const popup = map.lastPopup!;
            const destBtn = popup.element.querySelector(".callout-destination-btn") as HTMLButtonElement | null;
            expect(destBtn).not.toBeNull();
            expect(destBtn!.classList.contains("active")).toBe(false);

            destBtn!.click();

            expect(store.get()).toEqual({ lat: 40.8518, lng: 14.2681, label: null });
            expect(layerFactory.destinationMarkers).toHaveLength(1);
            expect(layerFactory.destinationMarkers[0].removed).toBe(false);
        });

        it("shows the destination button as active when re-tapping the exact destination coordinates", () => {
            setLogger(new StubLogger());
            const layerFactory = new StubLayerFactory();
            const store = new StubDestinationStore();
            store.set({ lat: 40.8518, lng: 14.2681 });

            const { view, map } = buildBundle(fakeArea, fakeState, { layerFactory, destinationStore: store });
            view.attach();
            map.setZoom(18);
            map.simulateClick([40.8518, 14.2681]);

            const popup = map.lastPopup!;
            const destBtn = popup.element.querySelector(".callout-destination-btn") as HTMLButtonElement;
            expect(destBtn.classList.contains("active")).toBe(true);

            destBtn.click();

            expect(store.get()).toBeNull();
        });

        it("renders a tappable destination pin, kept below the GPS marker's pane", () => {
            setLogger(new StubLogger());
            const layerFactory = new StubLayerFactory();
            const store = new StubDestinationStore();
            store.set({ lat: 40.8518, lng: 14.2681, label: "Ithaca, Royal Palace, Front Entrance" });

            const { view, map } = buildBundle(fakeArea, fakeState, { layerFactory, destinationStore: store });
            view.attach();

            expect(layerFactory.destinationMarkers).toHaveLength(1);
            expect(layerFactory.destinationMarkers[0].addedTo).toBe(map);
        });

        it("tapping the destination pin reuses the empty-space callout, keeping star and bookmark actions", () => {
            setLogger(new StubLogger());
            const layerFactory = new StubLayerFactory();
            const store = new StubDestinationStore();
            store.set({ lat: 40.8518, lng: 14.2681 });

            const { view, map } = buildBundle(fakeArea, fakeState, { layerFactory, destinationStore: store });
            view.attach();
            layerFactory.destinationMarkers[0].clickHandler?.();

            const popup = map.lastPopup!;
            expect(popup.latLng).toEqual([40.8518, 14.2681]);
            const destBtn = popup.element.querySelector(".callout-destination-btn");
            expect(destBtn).not.toBeNull();
            expect(destBtn?.classList.contains("active")).toBe(true);
            expect(popup.element.querySelector(".star-rating--interactive")).not.toBeNull();
            expect(popup.element.querySelector(".callout-bookmark-btn")).not.toBeNull();
            expect(popup.element.querySelector(".callout-delete-btn")).toBeNull();
        });

        it("rating the destination point from the pin's callout clears its destination status", () => {
            setLogger(new StubLogger());
            const layerFactory = new StubLayerFactory();
            const store = new StubDestinationStore();
            store.set({ lat: 40.8518, lng: 14.2681 });

            const { view, map } = buildBundle(fakeArea, fakeState, { layerFactory, destinationStore: store });
            view.attach();
            layerFactory.destinationMarkers[0].clickHandler?.();

            const popup = map.lastPopup!;
            const stars = popup.element.querySelectorAll<HTMLImageElement>(".star-rating-star");
            stars[2].click(); // 3rd star

            expect(store.get()).toBeNull();
        });

        it("tapping the destination pin at an existing __user__ point shows that point's own callout (delete, not bookmark)", async () => {
            const layerFactory = new StubLayerFactory();
            const userStore = new StubUserPointsStore();
            userStore.setPoints([
                { type: "Feature", geometry: { type: "Point", coordinates: [14.2681, 40.8518] }, properties: { stars: 4 } },
            ]);
            const destinationStore = new StubDestinationStore();
            destinationStore.set({ lat: 40.8518, lng: 14.2681 });

            setLogger(new StubLogger());

            const { view, map } = buildBundle(fakeAreaWithUser, fakeState, {
                layerFactory,
                userPointsStore: userStore,
                destinationStore,
            });
            view.attach();
            await Promise.resolve();
            await Promise.resolve();

            layerFactory.destinationMarkers[0].clickHandler?.();

            const popup = map.lastPopup!;
            expect(popup.element.querySelector(".callout-delete-btn")).not.toBeNull();
            expect(popup.element.querySelector(".callout-bookmark-btn")).toBeNull();
            expect(popup.element.querySelector(".star-rating--interactive")).toBeNull();
        });

        it("removes the destination when the pin's own callout button is clicked", () => {
            setLogger(new StubLogger());
            const layerFactory = new StubLayerFactory();
            const store = new StubDestinationStore();
            store.set({ lat: 40.8518, lng: 14.2681 });

            const { view, map } = buildBundle(fakeArea, fakeState, { layerFactory, destinationStore: store });
            view.attach();
            layerFactory.destinationMarkers[0].clickHandler?.();

            const popup = map.lastPopup!;
            const destBtn = popup.element.querySelector(".callout-destination-btn") as HTMLButtonElement;
            destBtn.click();

            expect(store.get()).toBeNull();
            expect(layerFactory.destinationMarkers[0].removed).toBe(true);
            expect(popup.removed).toBe(true);
        });
    });
});
