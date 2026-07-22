import { afterEach, describe, expect, it, vi } from "vitest";

import type {
    CircleMarkerOptions,
    ClickableMapLayerHandle,
    HeatLayerOptions,
    LayerFactory,
    MapLayerHandle,
} from "../../../src/contracts";
import { GeoLayer } from "../../../src/catalog/layer";
import { PointLayerView } from "../../../src/view/detail/pointLayerView";
import { stubFetch } from "../../fakes/fakeFetch";
import { HeatPoint } from "../../../src/protocols";
import { StubMap, StubMapLayerHandle, StubMarker } from "../../stubs/stubLeafletFactories";

class FakeLeafletLayerFactory implements LayerFactory {
    public readonly markers: StubMarker[] = [];
    public readonly markerLatLngs: [number, number][] = [];
    public readonly markerOptions: CircleMarkerOptions[] = [];

    createCircleMarker(
        latLng: [number, number],
        options: CircleMarkerOptions
    ): ClickableMapLayerHandle {
        const marker = new StubMarker();
        this.markers.push(marker);
        this.markerLatLngs.push(latLng);
        this.markerOptions.push(options);
        return marker;
    }

    createLayerGroup(): MapLayerHandle {
        return new StubMapLayerHandle();
    }

    createHeatLayer(_points: HeatPoint[], _options: HeatLayerOptions): MapLayerHandle {
        throw new Error("Method not implemented.");
    }
}

const layer_data = {
    id: "test-layer",
    name: "Test Layer",
    type: "circle",
    url: "/test/layer.geojson",
    visible: true,
    style: {
        color: "#ff0000",
        opacity: 0.7,
        radiusScale: 2,
    },
};

const one_point = {
    type: "FeatureCollection",
    features: [
        {
            type: "Feature",
            properties: { weight: 0.5 },
            geometry: {
                type: "Point",
                coordinates: [14.2681, 40.8518],
            },
        },
    ],
};

const two_points = {
    type: "FeatureCollection",
    features: [
        {
            type: "Feature",
            properties: { weight: 0.5 },
            geometry: {
                type: "Point",
                coordinates: [14.2681, 40.8518],
            },
        },
        {
            type: "Feature",
            properties: { weight: 1.0 },
            geometry: {
                type: "Point",
                coordinates: [14.25, 40.84],
            },
        },
    ],
};

const one_line = {
    type: "FeatureCollection",
    features: [
        {
            type: "Feature",
            properties: { weight: 1 },
            geometry: {
                type: "LineString",
                coordinates: [
                    [14.2681, 40.8518],
                    [14.25, 40.84],
                ],
            },
        },
    ],
};

describe("LayerView", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("renders GeoJSON point features as circle markers", async () => {
        stubFetch(two_points);

        const layer = new GeoLayer(layer_data);
        const map = new StubMap();
        const factory = new FakeLeafletLayerFactory();

        const view = new PointLayerView(map, layer, factory);

        await view.render();

        expect(factory.markers.length).toBe(2);

        expect(factory.markerLatLngs[0]).toEqual([40.8518, 14.2681]);
        expect(factory.markerLatLngs[1]).toEqual([40.84, 14.25]);

        expect(factory.markers[0].addToMap).toBe(map);
        expect(factory.markers[1].addToMap).toBe(map);
    });

    it("applies layer style to circle markers", async () => {
        stubFetch(one_point);

        const map = new StubMap();
        const layer = new GeoLayer(layer_data);
        const factory = new FakeLeafletLayerFactory();

        const view = new PointLayerView(map, layer, factory);

        await view.render();

        expect(factory.markerOptions[0].color).toBe("#ff0000");
        expect(factory.markerOptions[0].opacity).toBe(0.7);
        expect(factory.markerOptions[0].radius).toBe(20);
    });

    it("ignores unsupported features", async () => {
        stubFetch(one_line);

        const map = new StubMap();
        const layer = new GeoLayer(layer_data);
        const factory = new FakeLeafletLayerFactory();

        const view = new PointLayerView(map, layer, factory);

        await view.render();

        expect(factory.markers.length).toBe(0);
    });

    it("removes markers on destroy", async () => {
        stubFetch(two_points);

        const map = new StubMap();
        const layer = new GeoLayer(layer_data);
        const factory = new FakeLeafletLayerFactory();

        const view = new PointLayerView(map, layer, factory);

        await view.render();
        view.destroy();

        expect(factory.markers[0].removeCalled).toBe(true);
        expect(factory.markers[1].removeCalled).toBe(true);
    });

    it("hides and re-shows markers without rebuilding", async () => {
        stubFetch(two_points);

        const map = new StubMap();
        const layer = new GeoLayer(layer_data);
        const factory = new FakeLeafletLayerFactory();

        const view = new PointLayerView(map, layer, factory);
        await view.render();

        view.hide();
        expect(factory.markers[0].removeCalled).toBe(true);
        expect(factory.markers[1].removeCalled).toBe(true);

        view.show();
        expect(factory.markers[0].addToMap).toBe(map);
        expect(factory.markers[1].addToMap).toBe(map);
        // No re-fetch/re-scan: still exactly the two markers built by render().
        expect(factory.markers.length).toBe(2);
    });
});
