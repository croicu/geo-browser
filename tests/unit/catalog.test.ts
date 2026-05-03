import { beforeEach, describe, expect, it, vi } from "vitest";
import { GeoCatalog } from "../../src/catalog/catalog";
import type { Catalog } from "../../src/protocols";

describe("GeoCatalog", () => {
    const catalogPayload: Catalog = {
        version: 1,
        createdAt: "2026-05-03T00:00:00Z",
        areas: [
            {
                id: "napoli",
                name: "Napoli",
                center: [40.8518, 14.2681],
                radiusMeters: 12000,
                minRadiusPx: 32,
                maxRadiusPx: 512,
                liveMapRadiusPx: 640,
                manifestUrl: "/areas/napoli/manifest.json",
                images: [
                    {
                        sizePx: 64,
                        url: "/areas/napoli/intro/happy_r_64.png",
                    },
                ],
            },
        ],
    };

    beforeEach(() => {
        vi.unstubAllGlobals();
        vi.resetAllMocks();
    });

    it("starts unloaded", () => {
        const catalog = new GeoCatalog("/catalogs/catalog.debug.json");

        expect(catalog.isLoaded()).toBe(false);
    });

    it("loads areas from catalog payload", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
            ok: true,
            json: async () => catalogPayload,
        }));

        const catalog = new GeoCatalog("/catalogs/catalog.debug.json");

        await catalog.load();

        expect(catalog.isLoaded()).toBe(true);
        expect(catalog.areas.length).toBe(1);
        expect(catalog.areas[0].id).toBe("napoli");
        expect(catalog.areas[0].name).toBe("Napoli");
    });

    it("fetches the catalog url with no-store cache", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => catalogPayload,
        });

        vi.stubGlobal("fetch", fetchMock);

        const catalog = new GeoCatalog("/catalogs/catalog.debug.json");

        await catalog.load();

        expect(fetchMock).toHaveBeenCalledWith(
            "/catalogs/catalog.debug.json",
            { cache: "no-store" },
        );
    });

    it("does not refetch if already loaded", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => catalogPayload,
        });

        vi.stubGlobal("fetch", fetchMock);

        const catalog = new GeoCatalog("/catalogs/catalog.debug.json");

        await catalog.load();
        await catalog.load();

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("throws if fetch fails", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
            ok: false,
        }));

        const catalog = new GeoCatalog("/catalogs/catalog.debug.json");

        await expect(catalog.load()).rejects.toThrow();
    });

    it("throws if accessing areas before load", () => {
        const catalog = new GeoCatalog("/catalogs/catalog.debug.json");

        expect(() => catalog.areas).toThrow();
    });
});