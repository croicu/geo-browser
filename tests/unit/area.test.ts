import { describe, expect, it, vi, beforeEach } from "vitest";
import { GeoArea } from "../../src/catalog/area";
import type { AreaSummary, AreaDetail } from "../../src/protocols";

describe("GeoArea", () => {
    const summary: AreaSummary = {
        id: "napoli",
        name: "Napoli",
        center: [40.8518, 14.2681],
        radiusMeters: 12000,
        minRadiusPx: 32,
        maxRadiusPx: 512,
        liveMapRadiusPx: 640,
        manifestUrl: "/areas/napoli/manifest.json",
        images: [],
    };

    const detail: AreaDetail = {
        id: "napoli",
        layers: [
            {
                id: "debug-heat",
                type: "heatmap",
                url: "/areas/napoli/layers/debug-heat.geojson",
                visible: true,
            },
        ],
    };

    beforeEach(() => {
        vi.resetAllMocks();
    });

    it("exposes summary fields", () => {
        const area = new GeoArea(summary);

        expect(area.id).toBe("napoli");
        expect(area.name).toBe("Napoli");
        expect(area.center).toEqual([40.8518, 14.2681]);
        expect(area.radiusMeters).toBe(12000);
        expect(area.isLoaded()).toBe(false);
    });

    it("loads detail and creates layers", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
            ok: true,
            json: async () => detail,
        }));

        const area = new GeoArea(summary);

        await area.load();

        expect(area.isLoaded()).toBe(true);
        expect(area.layers.length).toBe(1);
        expect(area.layers[0].isHeatmap()).toBe(true);
    });

    it("does not refetch if already loaded", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => detail,
        });

        vi.stubGlobal("fetch", fetchMock);

        const area = new GeoArea(summary);

        await area.load();
        await area.load();

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("throws if fetch fails", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
            ok: false,
        }));

        const area = new GeoArea(summary);

        await expect(area.load()).rejects.toThrow();
    });

    it("throws if accessing layers before load", () => {
        const area = new GeoArea(summary);

        expect(() => area.layers).toThrow();
    });
});