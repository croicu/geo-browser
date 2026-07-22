import { beforeEach, describe, expect, it } from "vitest";
import { GeoArea } from "../../../../src/catalog/area";
import { AreaMarkerView } from "../../../../src/view/map/areaMarkerView";
import { StubLayerFactory, StubMap } from "../../../stubs/stubLeafletFactories";

function createArea(): GeoArea {
    return new GeoArea({
        id: "napoli",
        name: "Napoli",
        bbox: [14.13, 40.74, 14.41, 40.96],
        minRadiusPx: 16,
        maxRadiusPx: 64,
        liveMapRadiusPx: 256,
        manifestUrl: "/areas/napoli/manifest.json",
        images: [],
    });
}

describe("AreaMarkerView", () => {
    let map: StubMap;
    let layerFactory: StubLayerFactory;

    beforeEach(() => {
        map = new StubMap();
        layerFactory = new StubLayerFactory();
    });

    it("renders a circle marker for the 'circle' kind and no outline", () => {
        const view = new AreaMarkerView(map, createArea(), layerFactory);
        view.render("circle");

        expect(layerFactory.markers.length).toBe(1);
        expect(layerFactory.markers[0].addToMap).toBe(map);
        expect(layerFactory.rectangles.length).toBe(0);
    });

    it("renders a bbox outline for the 'outline' kind and no circle", () => {
        const view = new AreaMarkerView(map, createArea(), layerFactory);
        view.render("outline");

        expect(layerFactory.rectangles.length).toBe(1);
        expect(layerFactory.rectangles[0].addedTo).toBe(map);
        expect(layerFactory.markers.length).toBe(0);
    });

    it("renders the outline as interactive so taps register anywhere inside it, not just on the border", () => {
        const view = new AreaMarkerView(map, createArea(), layerFactory);
        view.render("outline");

        expect(layerFactory.rectangles[0].options?.interactive).toBe(true);
    });

    it("renders nothing for the 'loaded' kind", () => {
        const view = new AreaMarkerView(map, createArea(), layerFactory);
        view.render("loaded");

        expect(layerFactory.markers.length).toBe(0);
        expect(layerFactory.rectangles.length).toBe(0);
    });

    it("switches from circle to outline on update() without duplicating objects", () => {
        const view = new AreaMarkerView(map, createArea(), layerFactory);
        view.render("circle");
        const circle = layerFactory.markers[0];

        view.update("outline");

        expect(circle.removeCalled).toBe(true);
        expect(layerFactory.rectangles.length).toBe(1);
    });

    it("reuses the same circle object across repeated circle updates (no rebuild)", () => {
        const view = new AreaMarkerView(map, createArea(), layerFactory);
        view.render("circle");
        view.update("outline");
        view.update("circle");

        // Still exactly one circle marker ever created, despite two "circle" renders.
        expect(layerFactory.markers.length).toBe(1);
        expect(layerFactory.markers[0].addToMap).toBe(map);
    });

    it("invokes onSelected when the circle marker is tapped", () => {
        const selected: string[] = [];
        const view = new AreaMarkerView(map, createArea(), layerFactory, {
            onSelected: area => selected.push(area.id),
        });
        view.render("circle");

        layerFactory.markers[0].clickHandler?.();

        expect(selected).toEqual(["napoli"]);
    });

    it("invokes onSelected when the outline is tapped", () => {
        const selected: string[] = [];
        const view = new AreaMarkerView(map, createArea(), layerFactory, {
            onSelected: area => selected.push(area.id),
        });
        view.render("outline");

        layerFactory.rectangles[0].clickHandler?.();

        expect(selected).toEqual(["napoli"]);
    });

    it("removes both circle and outline on destroy", () => {
        const view = new AreaMarkerView(map, createArea(), layerFactory);
        view.render("circle");
        view.update("outline");

        view.destroy();

        expect(layerFactory.markers[0].removeCalled).toBe(true);
        expect(layerFactory.rectangles[0].removed).toBe(true);
    });
});
