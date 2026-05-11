import { vi, beforeEach, describe, expect, it } from "vitest";
import type {
    ClickableMapLayerHandle,
    ControllerActions,
    HeatLayerOptions,
    LayerFactory,
    Logger,
    MapFactory,
    MapHandle,
    MapLayerHandle,
} from "../../../src/contracts";
import { setLogger } from "../../../src/services";
import { GeoCatalog } from "../../../src/catalog/catalog";
import { SummaryView } from "../../../src/view/summary/summaryView";
import { SummaryViewState } from "../../../src/state/summaryViewState";
import { HeatPoint } from "../../../src/protocols";

class StubLogger implements Logger {
    public readonly calls: Array<{ message: string; props?: Record<string, unknown> }> = [];

    diagnostic(message: string, props?: Record<string, unknown>): void {
        this.calls.push({ message, props });
    }

    info(): void {}
    warning(): void {}
    error(): void {}
    fatal(): void {}
}

class StubMap implements MapHandle {
    public removeCalled = false;
    private _clickHandler?: (latLng: [number, number]) => void;

    remove(): void {
        this.removeCalled = true;
    }

    getZoom(): number {
        return 3;
    }

    onZoom(_handler: (zoom: number) => void): () => void {
        return () => {};
    }

    onClick(handler: (latLng: [number, number]) => void): () => void {
        this._clickHandler = handler;
        return () => { this._clickHandler = undefined; };
    }

    simulateClick(latLng: [number, number]): void {
        this._clickHandler?.(latLng);
    }
}

class StubMapFactory implements MapFactory {
    public map = new StubMap();
    public root?: HTMLElement;
    public center?: [number, number];
    public zoom?: number;

    createMap(
        root: HTMLElement,
        center: [number, number],
        zoom: number
    ): MapHandle {
        this.root = root;
        this.center = center;
        this.zoom = zoom;

        return this.map;
    }
}

class StubMarker implements ClickableMapLayerHandle {
    public addToMap?: MapHandle;
    public removeCalled = false;
    public clickHandler?: () => void;

    addTo(map: MapHandle): void {
        this.addToMap = map;
    }

    remove(): void {
        this.removeCalled = true;
    }

    onClick(handler: () => void): void {
        this.clickHandler = handler;
    }

    setRadius(_r: number): void {
    }
}

class StubLayerFactory implements LayerFactory {
    public markers: StubMarker[] = [];

    createLayerGroup(): ClickableMapLayerHandle {
        const marker = new StubMarker();
        this.markers.push(marker);
        return marker;
    }

    createCircleMarker(): ClickableMapLayerHandle {
        const marker = new StubMarker();
        this.markers.push(marker);
        return marker;
    }

    createHeatLayer(_points: HeatPoint[], _options: HeatLayerOptions): MapLayerHandle {
        throw new Error("Method not implemented.");
    }
}

class StubActions implements ControllerActions {
    public openedDetailAreaId?: string;

    openSummary(): void {
    }

    openDetail(areaId: string): void {
        this.openedDetailAreaId = areaId;
    }

    zoomIn(): void {
    }

    zoomOut(): void {
    }

    setZoom(): void {
    }

    setLayerVisible(): void {
    }
}

describe("SummaryView", () => {
    let root: HTMLElement;
    let actions: StubActions;
    let mapFactory: StubMapFactory;
    let layerFactory: StubLayerFactory;

    beforeEach(() => {
        document.body.innerHTML = '<div id="app"></div>';

        const app = document.getElementById("app");
        if (!app) {
            throw new Error("Missing #app.");
        }

        root = app;
        actions = new StubActions();
        mapFactory = new StubMapFactory();
        layerFactory = new StubLayerFactory();
        setLogger(new StubLogger());
    });

    it("creates a leaflet-backed summary map", async () => {
        const catalog = await createCatalog();
        const state = new SummaryViewState({
            center: [0, 0],
            zoom: 2,
        });

        const view = new SummaryView(root, actions, catalog, state, {
            mapFactory,
            layerFactory,
        });

        view.create();

        expect(root.querySelector(".summary-view")).not.toBeNull();
        expect(root.querySelector(".summary-map")).not.toBeNull();

        expect(mapFactory.root).toBe(root.querySelector(".summary-map"));
        expect(mapFactory.center).toEqual([0, 0]);
        expect(mapFactory.zoom).toBe(2);
    });

    it("renders one bubble marker per catalog area", async () => {
        const catalog = await createCatalog();
        const state = new SummaryViewState({
            center: [0, 0],
            zoom: 2,
        });

        const view = new SummaryView(root, actions, catalog, state, {
            mapFactory,
            layerFactory,
        });

        view.render();

        expect(layerFactory.markers.length).toBe(2);

        for (const marker of layerFactory.markers) {
            expect(marker.addToMap).toBe(mapFactory.map);
        }
    });

    it("opens detail when a bubble marker is clicked", async () => {
        const catalog = await createCatalog();
        const state = new SummaryViewState({
            center: [0, 0],
            zoom: 2,
        });

        const view = new SummaryView(root, actions, catalog, state, {
            mapFactory,
            layerFactory,
        });

        view.render();

        const firstMarker = layerFactory.markers[0];
        expect(firstMarker.clickHandler).toBeDefined();

        firstMarker.clickHandler?.();

        expect(actions.openedDetailAreaId).toBe("napoli");
    });

    it("destroys markers and map", async () => {
        const catalog = await createCatalog();
        const state = new SummaryViewState({
            center: [0, 0],
            zoom: 2,
        });

        const view = new SummaryView(root, actions, catalog, state, {
            mapFactory,
            layerFactory,
        });

        view.render();
        view.destroy();

        expect(mapFactory.map.removeCalled).toBe(true);

        for (const marker of layerFactory.markers) {
            expect(marker.removeCalled).toBe(true);
        }

        expect(root.querySelector(".summary-view")).toBeNull();
    });

    it("logs GPS coordinates on map click", async () => {
        const catalog = await createCatalog();
        const state = new SummaryViewState({
            center: [0, 0],
            zoom: 2,
        });
        const logger = new StubLogger();

        setLogger(logger);

        const view = new SummaryView(root, actions, catalog, state, {
            mapFactory,
            layerFactory,
        });

        view.render();
        mapFactory.map.simulateClick([40.8518, 14.2681]);

        expect(logger.calls).toHaveLength(1);
        expect(logger.calls[0].message).toBe("map.click");
        expect(logger.calls[0].props).toEqual({ lat: 40.8518, lng: 14.2681 });
    });
});

async function createCatalog(): Promise<GeoCatalog> {
    const catalog = new GeoCatalog("/catalog.json");

    vi.stubGlobal("fetch", async (url: string) => {
        if (url === "/catalog.json") {
            return {
                ok: true,
                json: async () => ({
                    version: 1,
                    createdAt: "2026-01-01T00:00:00Z",
                    areas: [
                        {
                            id: "napoli",
                            name: "Napoli",
                            center: [40.8518, 14.2681],
                            radiusMeters: 12000,
                            minRadiusPx: 16,
                            maxRadiusPx: 64,
                            liveMapRadiusPx: 256,
                            detailUrl: "/areas/napoli/manifest.json",
                            images: [],
                        },
                        {
                            id: "rome",
                            name: "Rome",
                            center: [41.9028, 12.4964],
                            radiusMeters: 12000,
                            minRadiusPx: 16,
                            maxRadiusPx: 64,
                            liveMapRadiusPx: 256,
                            detailUrl: "/areas/rome/manifest.json",
                            images: [],
                        },
                    ],
                }),
            };
        }

        throw new Error(`Unexpected URL: ${url}`);
    });

    await catalog.load();

    vi.unstubAllGlobals();

    return catalog;
}