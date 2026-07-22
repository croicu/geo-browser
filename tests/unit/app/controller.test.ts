import { beforeEach, describe, expect, it, vi } from "vitest";

import { Controller } from "../../../src/app/controller";
import { setLogger } from "../../../src/services";
import { StubStorage } from "../../stubs/stubStorage";

import type { AreaSummary } from "../../../src/protocols";

const napoliSummary: AreaSummary = {
    id: "napoli",
    name: "Napoli",
    bbox: [14.13, 40.74, 14.41, 40.96],
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
};

function fakeArea(load: () => Promise<void> = async () => {}) {
    return {
        id: "napoli",
        name: "Napoli",
        summary: napoliSummary,
        bbox: napoliSummary.bbox,
        center: [40.85, 14.27] as [number, number],
        radiusMeters: 12000,
        minRadiusPx: napoliSummary.minRadiusPx,
        layers: [],
        load,
    };
}

// A single-area catalog always satisfies the empty-viewport fallback pin
// (tasks/layer_lifecycle.md) — the one area is always "nearest" — so its
// GeoArea.load() legitimately fires even at a maximally zoomed-out viewport.
// This is intentional new behavior (something is always kept warm so the map
// is never fully inert), not eager over-fetching: it's a single manifest
// fetch for the whole catalog, not per-layer GeoJSON.
function fakeCatalog(areas: ReturnType<typeof fakeArea>[]) {
    const catalog = {
        load: vi.fn(async () => {}),
        areas,
        getArea: (id: string) => {
            const area = areas.find(a => a.id === id);
            if (!area) throw new Error(`area not found: ${id}`);
            return area;
        },
    };
    return catalog;
}

describe("Controller", () => {
    const logger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();

        setLogger(logger as any);
        document.body.innerHTML = `<div id="app"></div>`;
    });

    it("loads catalog and renders the unified map view", async () => {
        const catalog = fakeCatalog([fakeArea()]);

        const controller = new Controller({
            catalog: catalog as any,
            storage: new StubStorage(),
        });

        await controller.start();

        expect(catalog.load).toHaveBeenCalledTimes(1);

        expect(document.querySelector(".map-view")).not.toBeNull();
        expect(document.querySelector(".shared-map")).not.toBeNull();
    });

    it("throws if #app is missing", async () => {
        document.body.innerHTML = "";

        const catalog = fakeCatalog([]);

        const controller = new Controller({
            catalog: catalog as any,
            storage: new StubStorage(),
        });

        await expect(controller.start()).rejects.toThrow("Missing #app element.");
    });

    it("fetches the sole catalog area's manifest via the empty-viewport fallback pin, not per-layer GeoJSON", async () => {
        const areaLoad = vi.fn(async () => {});
        const catalog = fakeCatalog([fakeArea(areaLoad)]);

        const controller = new Controller({
            catalog: catalog as any,
            storage: new StubStorage(),
        });

        await controller.start();

        expect(catalog.load).toHaveBeenCalledTimes(1);
        // The fallback pin means the area's own manifest legitimately loads —
        // MapView dedupes the base-layer toLoad path and the current-area
        // bundle build path (both want the same area loaded in the same
        // tick) down to a single GeoArea.load() call.
        expect(areaLoad).toHaveBeenCalledTimes(1);
    });
});
