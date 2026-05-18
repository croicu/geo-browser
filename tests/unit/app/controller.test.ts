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

    it("loads catalog and renders summary UI", async () => {
        const catalog = {
            load: vi.fn(async () => {}),
            areas: [
                {
                    id: "napoli",
                    name: "Napoli",
                    summary: napoliSummary,
                    center: [40.85, 14.27] as [number, number],
                    radiusMeters: 12000,
                },
            ],
        };

        const controller = new Controller({
            catalog: catalog as any,
            storage: new StubStorage(),
        });

        await controller.start();

        expect(catalog.load).toHaveBeenCalledTimes(1);

        expect(document.querySelector(".summary-view")).not.toBeNull();
        expect(document.querySelector(".summary-map")).not.toBeNull();
    });

    it("throws if #app is missing", async () => {
        document.body.innerHTML = "";

        const catalog = {
            load: vi.fn(async () => {}),
            areas: [],
        };

        const controller = new Controller({
            catalog: catalog as any,
            storage: new StubStorage(),
        });

        await expect(controller.start()).rejects.toThrow("Missing #app element.");
    });

    it("does not eagerly load area detail", async () => {
        const areaLoad = vi.fn(async () => {});

        const catalog = {
            load: vi.fn(async () => {}),
            areas: [
                {
                    id: "napoli",
                    name: "Napoli",
                    summary: napoliSummary,
                    center: [40.85, 14.27] as [number, number],
                    radiusMeters: 12000,
                    load: areaLoad,
                },
            ],
        };

        const controller = new Controller({
            catalog: catalog as any,
            storage: new StubStorage(),
        });

        await controller.start();

        expect(catalog.load).toHaveBeenCalledTimes(1);
        expect(areaLoad).not.toHaveBeenCalled();
    });
});
