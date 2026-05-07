import { afterEach, describe, expect, it, vi } from "vitest";

import type {
    CircleMarkerOptions,
    LeafletLayerFactory,
    MapHandle,
    MapLayerHandle,
} from "../../../src/contracts";
import { GeoLayer } from "../../../src/catalog/layer";
import { LayerView } from "../../../src/view/detail/layerView";
import { stubFetch } from "../../fakes/fakeFetch";

class FakeMap implements MapHandle{
    remove(): void {
    }
}

class FakeLayerHandle implements MapLayerHandle {
    public addedTo?: MapHandle;
    public removed = false;

    addTo(target: MapHandle): void {
        this.addedTo = target;
    }

    remove(): void {
        this.removed = true;
    }
}

class FakeLeafletLayerFactory implements LeafletLayerFactory {
    public readonly group = new FakeLayerHandle();
    public readonly markers: FakeLayerHandle[] = [];
    public readonly markerLatLngs: [number, number][] = [];
    public readonly markerOptions: CircleMarkerOptions[] = [];

    createLayerGroup(): MapLayerHandle {
        return this.group;
    }

    createCircleMarker(
        latLng: [number, number],
        options: CircleMarkerOptions
    ): MapLayerHandle {
        const marker = new FakeLayerHandle();

        this.markers.push(marker);
        this.markerLatLngs.push(latLng);
        this.markerOptions.push(options);

        return marker;
    }
}

const layer_data = {
    id: "test-layer",
    name: "Test Layer",
    type: "heatmap",
    url: "/test/layer.geojson",
    visible: true,
    style: {
        color: "#ff0000",
        opacity: 0.7,
        radiusScale: 2,
    },
}

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
}

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
        const map = new FakeMap();
        const factory = new FakeLeafletLayerFactory();

        const view = new LayerView(map, layer, factory);

        await view.render();

        expect(factory.markers.length).toBe(2);

        expect(factory.markerLatLngs[0]).toEqual([40.8518, 14.2681]);
        expect(factory.markerLatLngs[1]).toEqual([40.84, 14.25]);

        expect(factory.markers[0].addedTo).toBe(factory.group);
        expect(factory.markers[1].addedTo).toBe(factory.group);

        expect(factory.group.addedTo).toBe(map);
    });

    it("applies layer style to circle markers", async () => {

        stubFetch(one_point);
        const map = new FakeMap();
        const layer = new GeoLayer(layer_data);
        const factory = new FakeLeafletLayerFactory();

        const view = new LayerView(map, layer, factory);

        await view.render();

        expect(factory.markerOptions[0].color).toBe("#ff0000");
        expect(factory.markerOptions[0].opacity).toBe(0.7);
        expect(factory.markerOptions[0].fillOpacity).toBe(0.5);
        expect(factory.markerOptions[0].radius).toBe(10);
    });

    it("ignores unsupported features", async () => {

        stubFetch(one_line);
        const map = new FakeMap();
        const layer = new GeoLayer(layer_data);
        const factory = new FakeLeafletLayerFactory();

        const view = new LayerView(map, layer, factory);

        await view.render();

        expect(factory.markers.length).toBe(0);
        expect(factory.group.addedTo).toBe(map);
    });

    it("removes the rendered group on destroy", async () => {

        stubFetch(one_line);
        const map = new FakeMap();
        const layer = new GeoLayer(layer_data);
        const factory = new FakeLeafletLayerFactory();

        const view = new LayerView(map, layer, factory);

        await view.render();
        view.destroy();

        expect(factory.group.removed).toBe(true);
    });
});