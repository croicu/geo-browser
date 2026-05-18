import { beforeEach, describe, expect, it } from "vitest";
import { BboxWidget } from "../../../src/view/summary/bboxWidget";
import { StubLayerFactory, StubMap } from "../../stubs/stubLeafletFactories";
import { StubGateway } from "../../stubs/stubGateway";

describe("BboxWidget", () => {
    let map: StubMap;
    let layerFactory: StubLayerFactory;
    let gateway: StubGateway;

    beforeEach(() => {
        map = new StubMap();
        layerFactory = new StubLayerFactory();
        gateway = new StubGateway();
    });

    function makeWidget(bbox: [number, number, number, number] = [14.0, 40.7, 14.5, 41.0]): BboxWidget {
        return new BboxWidget(map, layerFactory, gateway, "napoli", bbox);
    }

    it("renders one rectangle and four corner handles", () => {
        const widget = makeWidget();
        widget.render();

        expect(layerFactory.rectangles.length).toBe(1);
        expect(layerFactory.draggableMarkers.length).toBe(4);
    });

    it("adds rectangle and handles to the map", () => {
        const widget = makeWidget();
        widget.render();

        expect(layerFactory.rectangles[0].addedTo).toBe(map);
        for (const handle of layerFactory.draggableMarkers) {
            expect(handle.addedTo).toBe(map);
        }
    });

    it("is idempotent — render twice creates one rect", () => {
        const widget = makeWidget();
        widget.render();
        widget.render();

        expect(layerFactory.rectangles.length).toBe(1);
        expect(layerFactory.draggableMarkers.length).toBe(4);
    });

    it("updates rectangle bounds when a corner is dragged", () => {
        const widget = makeWidget([14.0, 40.7, 14.5, 41.0]);
        widget.render();

        // drag NE corner (index 1) northward
        layerFactory.draggableMarkers[1].simulateDrag([41.5, 14.6]);

        expect(layerFactory.rectangles[0].lastBounds).toBeDefined();
    });

    it("syncs adjacent handles when a corner is dragged", () => {
        const widget = makeWidget([14.0, 40.7, 14.5, 41.0]);
        widget.render();

        // drag NW corner (index 0) — north and west change
        layerFactory.draggableMarkers[0].simulateDrag([41.5, 13.8]);

        // NE (index 1) should receive new north lat
        expect(layerFactory.draggableMarkers[1].latLng?.[0]).toBeCloseTo(41.5);
        // SW (index 2) should receive new west lng
        expect(layerFactory.draggableMarkers[2].latLng?.[1]).toBeCloseTo(13.8);
    });

    it("fires SetAreaBbox on drag end", () => {
        const widget = makeWidget([14.0, 40.7, 14.5, 41.0]);
        widget.render();

        layerFactory.draggableMarkers[3].simulateDragEnd([40.5, 14.6]);

        expect(gateway.invocations.length).toBe(1);
        expect(gateway.invocations[0].id).toBe("__geo_set_area_bbox__");
    });

    it("hides rect and handles when bbox is too small on screen", () => {
        const widget = makeWidget();
        widget.render();

        map.simulateZoom(3); // bbox shrinks to a few pixels

        expect(layerFactory.rectangles[0].removed).toBe(true);
        for (const handle of layerFactory.draggableMarkers) {
            expect(handle.removed).toBe(true);
        }
    });

    it("does not add rect to map when too small on initial render", () => {
        map.simulateZoom(3);
        const widget = makeWidget();
        widget.render();

        expect(layerFactory.rectangles[0].addedTo).toBeUndefined();
    });

    it("removes rectangle and handles on destroy", () => {
        const widget = makeWidget();
        widget.render();

        const rect = layerFactory.rectangles[0];
        const handles = [...layerFactory.draggableMarkers];

        widget.destroy();

        expect(rect.removed).toBe(true);
        for (const handle of handles) {
            expect(handle.removed).toBe(true);
        }
    });
});
