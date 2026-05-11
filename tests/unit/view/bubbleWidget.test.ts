import { beforeEach, describe, expect, it } from "vitest";
import { GeoArea } from "../../../src/catalog/area";
import { BubbleWidget } from "../../../src/view/summary/bubbleWidget";
import {
    StubActions,
} from "../../stubs/stubActions";
import {
    StubLayerFactory,
    StubMap,
} from "../../stubs/stubLeafletFactories";

describe("BubbleWidget", () => {
    let map: StubMap;
    let actions: StubActions;
    let layerFactory: StubLayerFactory;

    beforeEach(() => {
        map = new StubMap();
        actions = new StubActions();
        layerFactory = new StubLayerFactory();
    });

    it("creates a circle marker for the area", () => {
        const area = createArea();
        const widget = new BubbleWidget(area, actions, {
            map,
            layerFactory,
        });

        widget.render();

        expect(layerFactory.markers.length).toBe(1);
        expect(layerFactory.markers[0].addToMap).toBe(map);
    });

    it("opens detail when marker is clicked", () => {
        const area = createArea();
        const widget = new BubbleWidget(area, actions, {
            map,
            layerFactory,
        });

        widget.render();

        const marker = layerFactory.markers[0];

        expect(marker.clickHandler).toBeDefined();

        marker.clickHandler?.();

        expect(actions.openedDetailAreaId).toBe("napoli");
    });

    it("does not create duplicate markers when rendered multiple times", () => {
        const area = createArea();
        const widget = new BubbleWidget(area, actions, {
            map,
            layerFactory,
        });

        widget.render();
        widget.render();

        expect(layerFactory.markers.length).toBe(1);
    });

    it("removes marker on destroy", () => {
        const area = createArea();
        const widget = new BubbleWidget(area, actions, {
            map,
            layerFactory,
        });

        widget.render();

        const marker = layerFactory.markers[0];

        widget.destroy();

        expect(marker.removeCalled).toBe(true);
    });
});

function createArea(): GeoArea {
    return new GeoArea({
        id: "napoli",
        name: "Napoli",
        center: [40.8518, 14.2681],
        radiusMeters: 12000,
        minRadiusPx: 16,
        maxRadiusPx: 64,
        liveMapRadiusPx: 256,
        manifestUrl: "/areas/napoli/manifest.json",
        images: [],
    });
}
