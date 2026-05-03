import { describe, expect, it } from "vitest";
import { GeoLayer } from "../../src/catalog/layer";
import type { Layer } from "../../src/protocols";

describe("GeoLayer", () => {
    it("reports visible layers", () => {
        const layer: Layer = {
            id: "debug-heat",
            name: "Debug Heat",
            type: "heatmap",
            url: "/areas/napoli/layers/debug-heat.geojson",
            visible: true,
        };

        const geo_layer = new GeoLayer(layer);

        expect(geo_layer.isVisible()).toBe(true);
    });

    it("reports hidden layers", () => {
        const layer: Layer = {
            id: "debug-heat",
            type: "heatmap",
            url: "/areas/napoli/layers/debug-heat.geojson",
            visible: false,
        };

        const geo_layer = new GeoLayer(layer);

        expect(geo_layer.isVisible()).toBe(false);
    });

    it("identifies heatmap layers", () => {
        const layer: Layer = {
            id: "debug-heat",
            type: "heatmap",
            url: "/areas/napoli/layers/debug-heat.geojson",
            visible: true,
        };

        const geo_layer = new GeoLayer(layer);

        expect(geo_layer.isHeatmap()).toBe(true);
    });

    it("rejects non-heatmap layers", () => {
        const layer: Layer = {
            id: "debug-points",
            type: "points",
            url: "/areas/napoli/layers/debug-points.geojson",
            visible: true,
        };

        const geo_layer = new GeoLayer(layer);

        expect(geo_layer.isHeatmap()).toBe(false);
    });
});