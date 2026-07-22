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

    function dragEndAndConfirm(markerIndex: number, latLng: [number, number]): void {
        layerFactory.draggableMarkers[markerIndex].simulateDrag(latLng);
        layerFactory.draggableMarkers[markerIndex].simulateDragEnd(latLng);
        confirmBar().querySelector<HTMLButtonElement>("button:first-child")!.click();
    }

    function confirmBar(): HTMLElement {
        return map.getContainer().querySelector<HTMLElement>(".bbox-confirm-bar")!;
    }

    it("renders one rectangle and four corner handles", () => {
        const widget = makeWidget();
        widget.render();

        expect(layerFactory.rectangles.length).toBe(1);
        expect(layerFactory.draggableMarkers.length).toBe(4);
    });

    it("renders the rectangle as non-interactive so it never intercepts drags meant for the corner handles", () => {
        const widget = makeWidget();
        widget.render();

        expect(layerFactory.rectangles[0].options?.interactive).toBe(false);
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

        layerFactory.draggableMarkers[1].simulateDrag([41.5, 14.6]);

        expect(layerFactory.rectangles[0].lastBounds).toBeDefined();
    });

    it("syncs adjacent handles when a corner is dragged", () => {
        const widget = makeWidget([14.0, 40.7, 14.5, 41.0]);
        widget.render();

        layerFactory.draggableMarkers[0].simulateDrag([41.5, 13.8]);

        expect(layerFactory.draggableMarkers[1].latLng?.[0]).toBeCloseTo(41.5);
        expect(layerFactory.draggableMarkers[2].latLng?.[1]).toBeCloseTo(13.8);
    });

    it("shows confirm bar after drag end", () => {
        const widget = makeWidget([14.0, 40.7, 14.5, 41.0]);
        widget.render();

        layerFactory.draggableMarkers[3].simulateDragEnd([40.5, 14.6]);

        expect(confirmBar()).not.toBeNull();
    });

    it("does not fire SetAreaBbox on drag end alone", () => {
        const widget = makeWidget([14.0, 40.7, 14.5, 41.0]);
        widget.render();

        layerFactory.draggableMarkers[3].simulateDragEnd([40.5, 14.6]);

        expect(gateway.invocations.length).toBe(0);
    });

    it("fires SetAreaBbox when OK is clicked after drag end", () => {
        const widget = makeWidget([14.0, 40.7, 14.5, 41.0]);
        widget.render();

        dragEndAndConfirm(3, [40.5, 14.6]);

        expect(gateway.invocations.length).toBe(1);
        expect(gateway.invocations[0].id).toBe("__geo_set_area_bbox__");
    });

    it("hides confirm bar after OK is clicked", () => {
        const widget = makeWidget([14.0, 40.7, 14.5, 41.0]);
        widget.render();

        dragEndAndConfirm(3, [40.5, 14.6]);

        expect(map.getContainer().querySelector(".bbox-confirm-bar")).toBeNull();
    });

    it("shows saving overlay after OK is clicked", () => {
        const widget = makeWidget([14.0, 40.7, 14.5, 41.0]);
        widget.render();

        dragEndAndConfirm(3, [40.5, 14.6]);

        expect(map.getContainer().querySelector(".area-build-overlay")).not.toBeNull();
    });

    it("hides saving overlay when save response arrives", () => {
        const widget = makeWidget([14.0, 40.7, 14.5, 41.0]);
        widget.render();

        dragEndAndConfirm(3, [40.5, 14.6]);
        gateway.respond(0, { error: 0, errorDescription: null });

        expect(map.getContainer().querySelector(".area-build-overlay")).toBeNull();
    });

    it("reverts bbox and hides confirm bar on cancel", () => {
        const widget = makeWidget([14.0, 40.7, 14.5, 41.0]);
        widget.render();

        layerFactory.draggableMarkers[0].simulateDrag([42.0, 13.0]);
        layerFactory.draggableMarkers[0].simulateDragEnd([42.0, 13.0]);
        confirmBar().querySelector<HTMLButtonElement>("button:last-child")!.click();

        expect(map.getContainer().querySelector(".bbox-confirm-bar")).toBeNull();
        expect(gateway.invocations.length).toBe(0);
        expect(layerFactory.draggableMarkers[0].latLng?.[0]).toBeCloseTo(41.0);
        expect(layerFactory.draggableMarkers[0].latLng?.[1]).toBeCloseTo(14.0);
    });

    it("additional drags while editing do not open a second confirm bar", () => {
        const widget = makeWidget([14.0, 40.7, 14.5, 41.0]);
        widget.render();

        layerFactory.draggableMarkers[0].simulateDragEnd([41.5, 13.8]);
        layerFactory.draggableMarkers[1].simulateDragEnd([41.5, 14.7]);

        expect(map.getContainer().querySelectorAll(".bbox-confirm-bar").length).toBe(1);
    });

    it("calls onEditStart when edit mode begins", () => {
        let started = false;
        const widget = new BboxWidget(map, layerFactory, gateway, "napoli", [14.0, 40.7, 14.5, 41.0], {
            onEditStart: () => { started = true; },
        });
        widget.render();

        layerFactory.draggableMarkers[0].simulateDragEnd([41.5, 13.8]);

        expect(started).toBe(true);
    });

    it("calls onEditEnd when OK is clicked", () => {
        let ended = false;
        const widget = new BboxWidget(map, layerFactory, gateway, "napoli", [14.0, 40.7, 14.5, 41.0], {
            onEditEnd: () => { ended = true; },
        });
        widget.render();

        dragEndAndConfirm(0, [41.5, 13.8]);

        expect(ended).toBe(true);
    });

    it("calls onEditEnd when cancel is clicked", () => {
        let ended = false;
        const widget = new BboxWidget(map, layerFactory, gateway, "napoli", [14.0, 40.7, 14.5, 41.0], {
            onEditEnd: () => { ended = true; },
        });
        widget.render();

        layerFactory.draggableMarkers[0].simulateDragEnd([41.5, 13.8]);
        confirmBar().querySelector<HTMLButtonElement>("button:last-child")!.click();

        expect(ended).toBe(true);
    });

    it("hides rect and handles when bbox is too small on screen", () => {
        const widget = makeWidget();
        widget.render();

        map.simulateZoom(3);

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

    it("removes rectangle, handles, and overlays on destroy", () => {
        const widget = makeWidget();
        widget.render();

        layerFactory.draggableMarkers[0].simulateDragEnd([41.5, 13.8]);

        const rect = layerFactory.rectangles[0];
        const handles = [...layerFactory.draggableMarkers];

        widget.destroy();

        expect(rect.removed).toBe(true);
        for (const handle of handles) {
            expect(handle.removed).toBe(true);
        }
        expect(map.getContainer().querySelector(".bbox-confirm-bar")).toBeNull();
    });

    it("removes saving overlay on destroy", () => {
        const widget = makeWidget();
        widget.render();

        dragEndAndConfirm(3, [40.5, 14.6]);

        widget.destroy();

        expect(map.getContainer().querySelector(".area-build-overlay")).toBeNull();
    });
});
