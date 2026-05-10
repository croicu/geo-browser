// tests/unit/app/controller.test.ts

import { beforeEach, describe, expect, it, vi } from "vitest";

import { Controller } from "../../../src/app/controller";
import { setLogger } from "../../../src/services";
import { SummaryViewState } from "../../../src/state/summaryViewState";

import type { AreaSummary } from "../../../src/protocols";

const napoliSummary: AreaSummary = {
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
        localStorage.clear();
    });

    it("loads catalog and renders summary UI", async () => {
        const catalog = {
            load: vi.fn(async () => {}),
            areas: [
                {
                    id: "napoli",
                    name: "Napoli",
                    summary: napoliSummary,
                },
            ],
        };

        const state = new SummaryViewState();

        const controller = new Controller({
            catalog: catalog as any,
            summaryViewState: state,
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
            summaryViewState: new SummaryViewState(),
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
                    load: areaLoad,
                },
            ],
        };

        const controller = new Controller({
            catalog: catalog as any,
            summaryViewState: new SummaryViewState(),
        });

        await controller.start();

        expect(catalog.load).toHaveBeenCalledTimes(1);
        expect(areaLoad).not.toHaveBeenCalled();
    });
});