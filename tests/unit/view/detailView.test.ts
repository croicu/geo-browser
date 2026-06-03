import { beforeEach, describe, expect, it } from "vitest";
import { DetailView } from "../../../src/view/detail/detailView";
import { StubActions } from "../../stubs/stubActions";
import { StubLogger } from "../../stubs/stubLogger";
import { StubLayerFactory, StubMapFactory, StubWidgetFactory } from "../../stubs/stubLeafletFactories";
import { setLogger } from "../../../src/services";

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
};

describe("DetailView", () => {
    beforeEach(() => {
        setLogger(new StubLogger());
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

    it("logs GPS coordinates on map click", () => {
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
        mapFactory.map.simulateClick([40.8518, 14.2681]);

        expect(logger.calls).toHaveLength(1);
        expect(logger.calls[0].message).toBe("map.click");
        expect(logger.calls[0].props).toEqual({ lat: 40.8518, lng: 14.2681 });
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
});
