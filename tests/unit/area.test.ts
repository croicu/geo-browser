import { beforeEach, describe, expect, it, vi } from "vitest";
import { GeoArea } from "../../src/catalog/area";
import type { AreaSummary } from "../../src/protocols";

const summary: AreaSummary = {
    id: "napoli",
    name: "Napoli",
    center: [40.8518, 14.2681],
    radiusMeters: 12000,
    minRadiusPx: 32,
    maxRadiusPx: 512,
    liveMapRadiusPx: 640,
    manifestUrl: "http://localhost:3000/areas/napoli/manifest.json",
    images: [],
};

const manifestPayload = {
    version: 1,
    layers: [
        {
            id: "overpass_1",
            type: "heatmap",
            url: "./layers/overpass_1.geojson",
            visible: true,
        },
    ],
};

describe("GeoArea", () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
        vi.resetAllMocks();
    });

    it("starts unloaded", () => {
        const area = new GeoArea(summary);

        expect(area.isLoaded()).toBe(false);
    });

    it("fetches manifest with no-store cache", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => manifestPayload,
        });

        vi.stubGlobal("fetch", fetchMock);

        const area = new GeoArea(summary);
        await area.load();

        expect(fetchMock).toHaveBeenCalledWith(
            summary.manifestUrl,
            { cache: "no-store" },
        );
    });

    it("does not refetch if already loaded", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => manifestPayload,
        });

        vi.stubGlobal("fetch", fetchMock);

        const area = new GeoArea(summary);
        await area.load();
        await area.load();

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("resolves relative layer url against the manifest url", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
            ok: true,
            json: async () => manifestPayload,
        }));

        const area = new GeoArea(summary);
        await area.load();

        expect(area.layers[0].url)
            .toBe("http://localhost:3000/areas/napoli/layers/overpass_1.geojson");
    });

    it("throws if accessing layers before load", () => {
        const area = new GeoArea(summary);

        expect(() => area.layers).toThrow();
    });

    it("computes bbox from center and radius", () => {
        const area = new GeoArea(summary);
        const [west, south, east, north] = area.bbox;

        expect(west).toBeLessThan(summary.center[1]);
        expect(east).toBeGreaterThan(summary.center[1]);
        expect(south).toBeLessThan(summary.center[0]);
        expect(north).toBeGreaterThan(summary.center[0]);

        // width and height should be symmetric around center
        expect(summary.center[1] - west).toBeCloseTo(east - summary.center[1], 5);
        expect(summary.center[0] - south).toBeCloseTo(north - summary.center[0], 5);
    });

    it("throws if fetch fails", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

        const area = new GeoArea(summary);

        await expect(area.load()).rejects.toThrow();
    });
});
