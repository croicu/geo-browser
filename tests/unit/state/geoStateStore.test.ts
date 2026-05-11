import { describe, expect, it } from "vitest";
import { GeoStateStore } from "../../../src/state/geoStateStore";
import { StubStorage } from "../../stubs/stubStorage";
import { DEFAULT_CENTER, DEFAULT_ZOOM } from "../../../src/state/summaryViewState";
import { DetailViewState } from "../../../src/state/detailViewState";

describe("GeoStateStore", () => {
    describe("SummaryViewState", () => {
        it("returns defaults when nothing is stored", () => {
            const store = new GeoStateStore(new StubStorage());
            const state = store.loadSummaryViewState();

            expect(state.center).toEqual(DEFAULT_CENTER);
            expect(state.zoom).toBe(DEFAULT_ZOOM);
        });

        it("roundtrips save and load", () => {
            const storage = new StubStorage();
            const store = new GeoStateStore(storage);

            const state = store.loadSummaryViewState();
            state.center = [40.8518, 14.2681];
            state.zoom = 7;
            state.selectedAreaId = "napoli";
            store.saveSummaryViewState(state);

            const restored = new GeoStateStore(storage).loadSummaryViewState();

            expect(restored.center).toEqual([40.8518, 14.2681]);
            expect(restored.zoom).toBe(7);
            expect(restored.selectedAreaId).toBe("napoli");
        });

        it("falls back to defaults when stored JSON is invalid", () => {
            const storage = new StubStorage();
            storage.setItem("geo-browser.summaryViewState", "{bad json");

            const state = new GeoStateStore(storage).loadSummaryViewState();

            expect(state.center).toEqual(DEFAULT_CENTER);
            expect(state.zoom).toBe(DEFAULT_ZOOM);
        });
    });

    describe("DetailViewState", () => {
        it("returns undefined when nothing is stored for an area", () => {
            const store = new GeoStateStore(new StubStorage());

            expect(store.loadDetailViewState("napoli")).toBeUndefined();
        });

        it("roundtrips save and load per area", () => {
            const storage = new StubStorage();
            const store = new GeoStateStore(storage);

            const state = new DetailViewState({
                areaId: "napoli",
                center: [40.8518, 14.2681],
                zoom: 13,
                visibleLayers: { flickr: true, instagram: false },
            });
            store.saveDetailViewState(state);

            const restored = new GeoStateStore(storage).loadDetailViewState("napoli");

            expect(restored).not.toBeUndefined();
            expect(restored!.center).toEqual([40.8518, 14.2681]);
            expect(restored!.zoom).toBe(13);
            expect(restored!.isLayerVisible("flickr", false)).toBe(true);
            expect(restored!.isLayerVisible("instagram", true)).toBe(false);
        });

        it("keeps areas isolated from each other", () => {
            const storage = new StubStorage();
            const store = new GeoStateStore(storage);

            store.saveDetailViewState(new DetailViewState({ areaId: "napoli", zoom: 12 }));
            store.saveDetailViewState(new DetailViewState({ areaId: "roma", zoom: 9 }));

            expect(store.loadDetailViewState("napoli")!.zoom).toBe(12);
            expect(store.loadDetailViewState("roma")!.zoom).toBe(9);
        });

        it("falls back to undefined when stored JSON is invalid", () => {
            const storage = new StubStorage();
            storage.setItem("geo-browser.detailViewState.napoli", "{bad json");

            expect(new GeoStateStore(storage).loadDetailViewState("napoli")).toBeUndefined();
        });
    });
});
