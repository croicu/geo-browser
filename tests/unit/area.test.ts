import { beforeEach, describe, expect, it, vi } from "vitest";
import { GeoArea } from "../../src/catalog/area";
import type { AreaSummary } from "../../src/protocols";

const summary: AreaSummary = {
    id: "napoli",
    name: "Napoli",
    bbox: [14.13, 40.74, 14.41, 40.96],
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

    it("returns stored bbox", () => {
        const area = new GeoArea(summary);
        expect(area.bbox).toEqual(summary.bbox);
    });

    it("computes center from bbox midpoint", () => {
        const area = new GeoArea(summary);
        const [west, south, east, north] = summary.bbox;
        const [lat, lng] = area.center;
        expect(lat).toBeCloseTo((south + north) / 2, 10);
        expect(lng).toBeCloseTo((west + east) / 2, 10);
    });

    it("throws if fetch fails", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

        const area = new GeoArea(summary);

        await expect(area.load()).rejects.toThrow();
    });
});
