import { afterEach, describe, expect, it, vi } from "vitest";

import type {
    HeatLayerOptions,
    LayerFactory,
    MapHandle,
    MapLayerHandle,
} from "../../../src/contracts";
import { HeatPoint } from "../../../src/protocols"
import { GeoLayer } from "../../../src/catalog/layer";
import { HeatLayerView } from "../../../src/view/detail/heatLayerView";

class StubMap implements MapHandle {
    remove(): void {
    }
}

class StubMapLayerHandle implements MapLayerHandle {
    public addedTo?: MapHandle;
    public removed = false;

    addTo(map: MapHandle): void {
        this.addedTo = map;
    }

    remove(): void {
        this.removed = true;
    }
}

class StubLayerFactory implements LayerFactory {
    public heatPoints?: HeatPoint[];
    public heatOptions?: HeatLayerOptions;
    public heatLayer = new StubMapLayerHandle();

    createLayerGroup(): MapLayerHandle {
        return new StubMapLayerHandle();
    }

    createCircleMarker(): MapLayerHandle {
        return new StubMapLayerHandle();
    }

    createHeatLayer(
        points: HeatPoint[],
        options: HeatLayerOptions
    ): MapLayerHandle {
        this.heatPoints = points;
        this.heatOptions = options;

        return this.heatLayer;
    }
}

function stubFetch(payload: unknown): void {
    vi.stubGlobal("fetch", async () => {
        return {
            ok: true,
            json: async () => payload,
        };
    });
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
        const factory = new StubLayerFactory();

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
            {
                latLng: [40.8518, 14.2681],
                weight: 0.9,
            },
            {
                latLng: [40.84, 14.25],
                weight: 0.7,
            },
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
        const factory = new StubLayerFactory();

        const layer = new GeoLayer({
            id: "debug-heat",
            type: "heatmap",
            url: "/areas/napoli/layers/flickr.geojson",
            visible: true,
        });

        const view = new HeatLayerView(map, layer, factory);

        await view.render();

        expect(factory.heatPoints).toEqual([
            {
                latLng: [40.8518, 14.2681],
                weight: 1.0,
            },
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
        const factory = new StubLayerFactory();

        const layer = new GeoLayer({
            id: "debug-heat",
            type: "heatmap",
            url: "/areas/napoli/layers/flickr.geojson",
            visible: true,
        });

        const view = new HeatLayerView(map, layer, factory);

        await view.render();

        expect(factory.heatPoints).toEqual([
            {
                latLng: [40.86, 14.28],
                weight: 0.5,
            },
        ]);
    });

    it("destroys rendered heat layer", async () => {
        const payload = {
            type: "FeatureCollection",
            features: [],
        };

        stubFetch(payload);

        const map = new StubMap();
        const factory = new StubLayerFactory();

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
});