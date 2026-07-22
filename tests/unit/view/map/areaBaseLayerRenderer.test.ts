import { afterEach, describe, expect, it, vi } from "vitest";

import { GeoArea } from "../../../../src/catalog/area";
import { GeoLayer } from "../../../../src/catalog/layer";
import { AreaBaseLayerRenderer } from "../../../../src/view/map/areaBaseLayerRenderer";
import { StubLayerFactory, StubMap } from "../../../stubs/stubLeafletFactories";
import { stubFetch } from "../../../fakes/fakeFetch";

const featureCollection = {
    type: "FeatureCollection",
    features: [
        {
            type: "Feature",
            properties: { weight: 0.5 },
            geometry: { type: "Point", coordinates: [14.2681, 40.8518] },
        },
    ],
};

function buildArea(layers: GeoLayer[]): GeoArea {
    const area = {
        id: "napoli",
        layers,
        load: async () => {},
    };
    return area as unknown as GeoArea;
}

describe("AreaBaseLayerRenderer", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("renders visible heatmap and circle layers, skipping non-source (virtual) layers", async () => {
        stubFetch(featureCollection);

        const heat = new GeoLayer({ id: "flickr", type: "heatmap", url: "/l/flickr.geojson", visible: true });
        const points = new GeoLayer({ id: "osm", type: "circle", url: "/l/osm.geojson", visible: true });
        const poi = new GeoLayer({ id: "__poi__", type: "__poi__", url: null, visible: true });
        const area = buildArea([heat, points, poi]);

        const map = new StubMap();
        const factory = new StubLayerFactory();
        const renderer = new AreaBaseLayerRenderer(map, area, factory);

        await renderer.render();

        // One heat group + one circle marker; __poi__ untouched by this class entirely.
        expect(factory.markers.length).toBe(1);
    });

    it("does not build a layer whose visibility resolver returns false", async () => {
        stubFetch(featureCollection);

        const points = new GeoLayer({ id: "osm", type: "circle", url: "/l/osm.geojson", visible: true });
        const area = buildArea([points]);

        const map = new StubMap();
        const factory = new StubLayerFactory();
        const renderer = new AreaBaseLayerRenderer(map, area, factory, {
            isLayerVisible: () => false,
        });

        await renderer.render();

        expect(factory.markers.length).toBe(0);
    });

    it("respects a layer's minZoom, building it only once zoom crosses the threshold", async () => {
        stubFetch(featureCollection);

        const points = new GeoLayer({
            id: "osm",
            type: "circle",
            url: "/l/osm.geojson",
            visible: true,
            style: { minZoom: 14 },
        });
        const area = buildArea([points]);

        const map = new StubMap();
        map.setZoom(10);
        const factory = new StubLayerFactory();
        const renderer = new AreaBaseLayerRenderer(map, area, factory);

        await renderer.render();
        expect(factory.markers.length).toBe(0);

        // setZoom (unlike simulateZoom) only updates state without firing the
        // registered onZoom handler, so this await deterministically drives
        // the single rebuild pass without racing the handler's own fire-and-forget sync().
        map.setZoom(14);
        await renderer.sync();
        expect(factory.markers.length).toBe(1);
    });

    it("also rebuilds automatically via the registered onZoom handler", async () => {
        stubFetch(featureCollection);

        const points = new GeoLayer({
            id: "osm",
            type: "circle",
            url: "/l/osm.geojson",
            visible: true,
            style: { minZoom: 14 },
        });
        const area = buildArea([points]);

        const map = new StubMap();
        map.setZoom(10);
        const factory = new StubLayerFactory();
        const renderer = new AreaBaseLayerRenderer(map, area, factory);
        await renderer.render();

        map.simulateZoom(14);
        // Flush the fire-and-forget sync() triggered by the zoom handler
        // (a macrotask boundary guarantees every pending microtask has run).
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(factory.markers.length).toBe(1);
    });

    it("does not rebuild a minZoom-gated layer via its own zoom listener while hidden", async () => {
        stubFetch(featureCollection);

        const points = new GeoLayer({
            id: "osm",
            type: "circle",
            url: "/l/osm.geojson",
            visible: true,
            style: { minZoom: 14 },
        });
        const area = buildArea([points]);

        const map = new StubMap();
        map.setZoom(10); // below minZoom — never built yet
        const factory = new StubLayerFactory();
        const renderer = new AreaBaseLayerRenderer(map, area, factory);
        await renderer.render();
        expect(factory.markers.length).toBe(0);

        // Area leaves the viewport before ever crossing minZoom.
        renderer.hide();

        // Crosses minZoom while still hidden — the renderer's own zoom
        // listener must not rebuild/reattach anything in this state.
        map.simulateZoom(14);
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(factory.markers.length).toBe(0);

        // Re-entering the area: show()'s own catch-up sync() picks it up.
        renderer.show();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(factory.markers.length).toBe(1);
    });

    it("hides and re-shows all layers without rebuilding", async () => {
        stubFetch(featureCollection);

        const points = new GeoLayer({ id: "osm", type: "circle", url: "/l/osm.geojson", visible: true });
        const area = buildArea([points]);

        const map = new StubMap();
        const factory = new StubLayerFactory();
        const renderer = new AreaBaseLayerRenderer(map, area, factory);
        await renderer.render();

        renderer.hide();
        expect(factory.markers[0].removeCalled).toBe(true);

        renderer.show();
        expect(factory.markers[0].addToMap).toBe(map);
        expect(factory.markers.length).toBe(1); // no rebuild
    });

    it("destroy() tears down every LayerView and invalidates every area layer (including non-source ones)", async () => {
        stubFetch(featureCollection);

        const points = new GeoLayer({ id: "osm", type: "circle", url: "/l/osm.geojson", visible: true });
        const poi = new GeoLayer({ id: "__poi__", type: "__poi__", url: null, visible: true });
        const invalidateSpy = vi.spyOn(poi, "invalidate");
        const area = buildArea([points, poi]);

        const map = new StubMap();
        const factory = new StubLayerFactory();
        const renderer = new AreaBaseLayerRenderer(map, area, factory);
        await renderer.render();

        renderer.destroy();

        expect(factory.markers[0].removeCalled).toBe(true);
        expect(invalidateSpy).toHaveBeenCalled();
        expect(points.isLoaded()).toBe(false);
    });
});
