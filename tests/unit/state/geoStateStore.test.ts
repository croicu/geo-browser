import { describe, expect, it } from "vitest";
import { GeoStateStore } from "../../../src/state/geoStateStore";
import { StubStorage } from "../../stubs/stubStorage";
import { DEFAULT_CENTER, DEFAULT_ZOOM } from "../../../src/state/mapViewState";
import { AreaViewState } from "../../../src/state/areaViewState";

describe("GeoStateStore", () => {
    describe("MapViewState", () => {
        it("returns defaults when nothing is stored", () => {
            const store = new GeoStateStore(new StubStorage());
            const state = store.loadMapViewState();

            expect(state.center).toEqual(DEFAULT_CENTER);
            expect(state.zoom).toBe(DEFAULT_ZOOM);
        });

        it("roundtrips save and load", () => {
            const storage = new StubStorage();
            const store = new GeoStateStore(storage);

            const state = store.loadMapViewState();
            state.center = [40.8518, 14.2681];
            state.zoom = 7;
            store.saveMapViewState(state);

            const restored = new GeoStateStore(storage).loadMapViewState();

            expect(restored.center).toEqual([40.8518, 14.2681]);
            expect(restored.zoom).toBe(7);
        });

        it("falls back to defaults when stored JSON is invalid", () => {
            const storage = new StubStorage();
            storage.setItem("geo-browser.mapViewState", "{bad json");

            const state = new GeoStateStore(storage).loadMapViewState();

            expect(state.center).toEqual(DEFAULT_CENTER);
            expect(state.zoom).toBe(DEFAULT_ZOOM);
        });
    });

    describe("AreaViewState", () => {
        it("returns undefined when nothing is stored for an area", () => {
            const store = new GeoStateStore(new StubStorage());

            expect(store.loadAreaViewState("napoli")).toBeUndefined();
        });

        it("roundtrips save and load per area", () => {
            const storage = new StubStorage();
            const store = new GeoStateStore(storage);

            const state = new AreaViewState({
                areaId: "napoli",
                visibleLayers: { flickr: true, instagram: false },
            });
            store.saveAreaViewState(state);

            const restored = new GeoStateStore(storage).loadAreaViewState("napoli");

            expect(restored).not.toBeUndefined();
            expect(restored!.isLayerVisible("flickr", false)).toBe(true);
            expect(restored!.isLayerVisible("instagram", true)).toBe(false);
        });

        it("keeps areas isolated from each other", () => {
            const storage = new StubStorage();
            const store = new GeoStateStore(storage);

            store.saveAreaViewState(new AreaViewState({ areaId: "napoli", visibleLayers: { flickr: true } }));
            store.saveAreaViewState(new AreaViewState({ areaId: "roma", visibleLayers: { flickr: false } }));

            expect(store.loadAreaViewState("napoli")!.isLayerVisible("flickr", false)).toBe(true);
            expect(store.loadAreaViewState("roma")!.isLayerVisible("flickr", true)).toBe(false);
        });

        it("falls back to undefined when stored JSON is invalid", () => {
            const storage = new StubStorage();
            storage.setItem("geo-browser.areaViewState.napoli", "{bad json");

            expect(new GeoStateStore(storage).loadAreaViewState("napoli")).toBeUndefined();
        });
    });
});
