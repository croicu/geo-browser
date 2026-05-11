import { beforeEach, describe, expect, it } from "vitest";
import { DetailView } from "../../../src/view/detail/detailView";
import type { ControllerActions, Logger, MapFactory, MapHandle } from "../../../src/contracts";
import { StubMapFactory, StubWidgetFactory } from "../../stubs/stubLeafletFactories";
import { setLogger } from "../../../src/services";

class FakeMap implements MapHandle {
    private _clickHandler?: (latLng: [number, number]) => void;

    remove(): void {}
    getZoom(): number { return 13; }
    onZoom(_handler: (zoom: number) => void): () => void { return () => {}; }

    onClick(handler: (latLng: [number, number]) => void): () => void {
        this._clickHandler = handler;
        return () => { this._clickHandler = undefined; };
    }

    simulateClick(latLng: [number, number]): void {
        this._clickHandler?.(latLng);
    }
}

class FakeMapFactory implements MapFactory {
    public readonly map = new FakeMap();

    createMap(): MapHandle {
        return this.map;
    }
}

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

class FakeActions implements ControllerActions {
    openSummary(): void {}
    openDetail(_areaId: string): void {}
    setLayerVisible(areaId: string, layerId: string, visible: boolean): void {}
    zoomIn(): void {}
    zoomOut(): void {}
    setZoom(_zoomLevel: number): void {}
}

const fakeArea = {
    id: "napoli",
    summary: {
        id: "napoli",
        name: "Napoli",
        center: [40.8518, 14.2681],
        radiusMeters: 1000,
        minRadiusPx: 32,
        maxRadiusPx: 256,
        liveMapRadiusPx: 128,
        manifestUrl: "/areas/napoli/manifest.json",
        images: [],
    },
    isLoaded: () => true,
    layers: [],
};

const fakeState = {
    center: [40.8518, 14.2681],
    zoom: 13,
};

describe("DetailView", () => {
    beforeEach(() => {
        setLogger(new StubLogger());
    });

    it("renders detail map root", () => {
        const root = document.createElement("div");

        const view = new DetailView(
            root,
            new FakeActions(),
            fakeArea as any,
            fakeState as any,
            {
                mapFactory: new StubMapFactory(),
                widgetFactory: new StubWidgetFactory()
            }
        );

        view.render();

        expect(root.querySelector(".detail-view")).not.toBeNull();
        expect(root.querySelector(".detail-map")).not.toBeNull();
    });

    it("destroy removes detail view", () => {
        const root = document.createElement("div");

        const view = new DetailView(
            root,
            new FakeActions(),
            fakeArea as any,
            fakeState as any,
            {
                mapFactory: new StubMapFactory(),
                widgetFactory: new StubWidgetFactory()
            }
        );

        view.render();
        view.destroy();

        expect(root.querySelector(".detail-view")).toBeNull();
    });

    it("render is idempotent", () => {
        const root = document.createElement("div");

        const view = new DetailView(
            root,
            new FakeActions(),
            fakeArea as any,
            fakeState as any,
            {
                mapFactory: new StubMapFactory(),
                widgetFactory: new StubWidgetFactory()
            }
        );

        view.render();
        view.render();

        expect(root.querySelectorAll(".detail-view").length).toBe(1);
        expect(root.querySelectorAll(".detail-map").length).toBe(1);
    });

    it("logs GPS coordinates on map click", () => {
        const root = document.createElement("div");
        const mapFactory = new FakeMapFactory();
        const logger = new StubLogger();

        setLogger(logger);

        const view = new DetailView(
            root,
            new FakeActions(),
            fakeArea as any,
            fakeState as any,
            {
                mapFactory,
                widgetFactory: new StubWidgetFactory(),
            }
        );

        view.render();
        mapFactory.map.simulateClick([40.8518, 14.2681]);

        expect(logger.calls).toHaveLength(1);
        expect(logger.calls[0].message).toBe("map.click");
        expect(logger.calls[0].props).toEqual({ lat: 40.8518, lng: 14.2681 });
    });
});