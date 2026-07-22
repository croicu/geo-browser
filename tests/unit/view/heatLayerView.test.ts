import { afterEach, describe, expect, it, vi } from "vitest";

import type {
    HeatLayerOptions,
    LayerFactory,
    MapLayerHandle,
} from "../../../src/contracts";
import { HeatPoint } from "../../../src/protocols";
import { GeoLayer } from "../../../src/catalog/layer";
import { HeatLayerView } from "../../../src/view/detail/heatLayerView";
import { StubMap, StubMapLayerHandle } from "../../stubs/stubLeafletFactories";
import { stubFetch } from "../../fakes/fakeFetch";

class FakeHeatLayerFactory implements LayerFactory {
    public heatPoints?: HeatPoint[];
    public heatOptions?: HeatLayerOptions;
    public readonly heatLayer = new StubMapLayerHandle();

    createLayerGroup(): MapLayerHandle {
        return new StubMapLayerHandle();
    }

    createCircleMarker(): never {
        throw new Error("Method not implemented.");
    }

    createHeatLayer(points: HeatPoint[], options: HeatLayerOptions): MapLayerHandle {
        this.heatPoints = points;
        this.heatOptions = options;
        return this.heatLayer;
    }
}

describe("HeatLayerView", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("renders GeoJSON point features as heat points", async () => {
        const payload = {
            type: "FeatureCollection",
            features: [
                {
                    type: "Feature",
                    properties: { weight: 0.9 },
                    geometry: {
                        type: "Point",
                        coordinates: [14.2681, 40.8518],
                    },
                },
                {
                    type: "Feature",
                    properties: { weight: 0.7 },
                    geometry: {
                        type: "Point",
                        coordinates: [14.25, 40.84],
                    },
                },
            ],
        };

        stubFetch(payload);

        const map = new StubMap();
        const factory = new FakeHeatLayerFactory();

        const layer = new GeoLayer({
            id: "debug-heat",
            name: "Debug Heat",
            type: "heatmap",
            url: "/areas/napoli/layers/flickr.geojson",
            visible: true,
            style: {
                color: "#ff0000",
                radius: 25,
                blur: 18,
                opacity: 0.6,
            },
        });

        const view = new HeatLayerView(map, layer, factory);

        await view.render();

        expect(factory.heatPoints).toEqual([
            { latLng: [40.8518, 14.2681], weight: 0.9 },
            { latLng: [40.84, 14.25], weight: 0.7 },
        ]);

        expect(factory.heatOptions).toEqual({
            radius: 25,
            blur: 18,
            opacity: 0.6,
            color: "#ff0000",
        });

        expect(factory.heatLayer.addedTo).toBe(map);
    });

    it("uses default heat style values", async () => {
        const payload = {
            type: "FeatureCollection",
            features: [
                {
                    type: "Feature",
                    properties: {},
                    geometry: {
                        type: "Point",
                        coordinates: [14.2681, 40.8518],
                    },
                },
            ],
        };

        stubFetch(payload);

        const map = new StubMap();
        const factory = new FakeHeatLayerFactory();

        const layer = new GeoLayer({
            id: "debug-heat",
            type: "heatmap",
            url: "/areas/napoli/layers/flickr.geojson",
            visible: true,
        });

        const view = new HeatLayerView(map, layer, factory);

        await view.render();

        expect(factory.heatPoints).toEqual([
            { latLng: [40.8518, 14.2681], weight: 1.0 },
        ]);

        expect(factory.heatOptions).toEqual({
            radius: 25,
            blur: 18,
            opacity: 0.6,
            color: undefined,
        });
    });

    it("ignores unsupported features", async () => {
        const payload = {
            type: "FeatureCollection",
            features: [
                {
                    type: "Feature",
                    geometry: {
                        type: "LineString",
                        coordinates: [
                            [14.2681, 40.8518],
                            [14.25, 40.84],
                        ],
                    },
                },
                {
                    type: "Feature",
                    properties: { weight: 0.5 },
                    geometry: {
                        type: "Point",
                        coordinates: [14.28, 40.86],
                    },
                },
            ],
        };

        stubFetch(payload);

        const map = new StubMap();
        const factory = new FakeHeatLayerFactory();

        const layer = new GeoLayer({
            id: "debug-heat",
            type: "heatmap",
            url: "/areas/napoli/layers/flickr.geojson",
            visible: true,
        });

        const view = new HeatLayerView(map, layer, factory);

        await view.render();

        expect(factory.heatPoints).toEqual([
            { latLng: [40.86, 14.28], weight: 0.5 },
        ]);
    });

    it("destroys rendered heat layer", async () => {
        const payload = {
            type: "FeatureCollection",
            features: [],
        };

        stubFetch(payload);

        const map = new StubMap();
        const factory = new FakeHeatLayerFactory();

        const layer = new GeoLayer({
            id: "debug-heat",
            type: "heatmap",
            url: "/areas/napoli/layers/flickr.geojson",
            visible: true,
        });

        const view = new HeatLayerView(map, layer, factory);

        await view.render();
        view.destroy();

        expect(factory.heatLayer.removed).toBe(true);
    });

    it("hides and re-shows the heat layer without rebuilding", async () => {
        const payload = { type: "FeatureCollection", features: [] };
        stubFetch(payload);

        const map = new StubMap();
        const factory = new FakeHeatLayerFactory();
        const layer = new GeoLayer({
            id: "debug-heat",
            type: "heatmap",
            url: "/areas/napoli/layers/flickr.geojson",
            visible: true,
        });

        const view = new HeatLayerView(map, layer, factory);
        await view.render();

        view.hide();
        expect(factory.heatLayer.removed).toBe(true);

        view.show();
        expect(factory.heatLayer.addedTo).toBe(map);
    });
});
