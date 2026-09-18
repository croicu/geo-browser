import { beforeEach, describe, expect, it, vi } from "vitest";
import { GeoLayer } from "../../src/catalog/layer";
import type { Layer } from "../../src/protocols";

describe("GeoLayer", () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
        vi.resetAllMocks();
    });


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

    // See catalog.test.ts's equivalent -- a raw network rejection needs the URL attached before
    // it propagates, or an offline startup failure is undiagnosable (geo-browser#107).
    it("includes the layer URL when the fetch itself rejects", async () => {
        const layer: Layer = {
            id: "debug-heat",
            type: "heatmap",
            url: "/areas/napoli/layers/debug-heat.geojson",
            visible: true,
        };
        vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Load failed")));

        const geo_layer = new GeoLayer(layer);

        await expect(geo_layer.load()).rejects.toThrow("/areas/napoli/layers/debug-heat.geojson");
    });
});