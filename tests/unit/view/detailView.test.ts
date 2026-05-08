import { describe, expect, it } from "vitest";
import { DetailView, DetailViewServices } from "../../../src/view/detail/detailView";
import type { ControllerActions, MapFactory, MapHandle } from "../../../src/contracts";
import { StubMapFactory, StubWidgetFactory } from "../../stubs/stubLeafletFactories"

class FakeActions implements ControllerActions {
    openSummary(): void {}
    openDetail(_areaId: string): void {}
    setLayerVisible(areaId: string, layerId: string, visible: boolean): void {}
    zoomIn(): void {}
    zoomOut(): void {}
    setZoom(_zoomLevel: number): void {}
}

const fakeArea = {
    id: "napoli",
    summary: {
        id: "napoli",
        name: "Napoli",
        center: [40.8518, 14.2681],
        radiusMeters: 1000,
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
};

describe("DetailView", () => {
    it("renders detail map root", () => {
        const root = document.createElement("div");

        const view = new DetailView(
            root,
            new FakeActions(),
            fakeArea as any,
            fakeState as any,
            {
                mapFactory: new StubMapFactory(),
                widgetFactory: new StubWidgetFactory()
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
            new FakeActions(),
            fakeArea as any,
            fakeState as any,
            {
                mapFactory: new StubMapFactory(),
                widgetFactory: new StubWidgetFactory()
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
            new FakeActions(),
            fakeArea as any,
            fakeState as any,
            {
                mapFactory: new StubMapFactory(),
                widgetFactory: new StubWidgetFactory()
            }
        );

        view.render();
        view.render();

        expect(root.querySelectorAll(".detail-view").length).toBe(1);
        expect(root.querySelectorAll(".detail-map").length).toBe(1);
    });
});