import { beforeEach, describe, expect, it } from "vitest";
import type {
    ClickableMapLayerHandle,
    ControllerActions,
    HeatLayerOptions,
    LayerFactory,
    MapHandle,
    MapLayerHandle,
} from "../../../src/contracts";
import { GeoArea } from "../../../src/catalog/area";
import { BubbleWidget } from "../../../src/view/summary/bubbleWidget";
import { HeatPoint } from "../../../src/protocols";

class StubMap implements MapHandle {
    remove(): void {
    }

    getZoom(): number {
        return 3;
    }

    onZoom(_handler: (zoom: number) => void): () => void {
        return () => {};
    }
}

class StubMarker implements ClickableMapLayerHandle {
    public addToMap?: MapHandle;
    public removeCalled = false;
    public clickHandler?: () => void;
    public radius?: number;

    addTo(map: MapHandle): void {
        this.addToMap = map;
    }

    remove(): void {
        this.removeCalled = true;
    }

    onClick(handler: () => void): void {
        this.clickHandler = handler;
    }

    setRadius(r: number): void {
        this.radius = r;
    }
}

class StubLayerGroup implements MapLayerHandle {
    addTo(): void {
    }

    remove(): void {
    }
}

class StubLayerFactory implements LayerFactory {
    public markers: StubMarker[] = [];

    createLayerGroup(): MapLayerHandle {
        return new StubLayerGroup();
    }

    createCircleMarker(): ClickableMapLayerHandle {
        const marker = new StubMarker();
        this.markers.push(marker);

        return marker;
    }

    createHeatLayer(
        points: HeatPoint[], 
        options: HeatLayerOptions
    ): MapLayerHandle {
        return new StubLayerGroup();
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

describe("BubbleWidget", () => {
    let map: StubMap;
    let actions: StubActions;
    let layerFactory: StubLayerFactory;

    beforeEach(() => {
        map = new StubMap();
        actions = new StubActions();
        layerFactory = new StubLayerFactory();
    });

    it("creates a circle marker for the area", () => {
        const area = createArea();
        const widget = new BubbleWidget(area, actions, {
            map,
            layerFactory,
        });

        widget.render();

        expect(layerFactory.markers.length).toBe(1);
        expect(layerFactory.markers[0].addToMap).toBe(map);
    });

    it("opens detail when marker is clicked", () => {
        const area = createArea();
        const widget = new BubbleWidget(area, actions, {
            map,
            layerFactory,
        });

        widget.render();

        const marker = layerFactory.markers[0];

        expect(marker.clickHandler).toBeDefined();

        marker.clickHandler?.();

        expect(actions.openedDetailAreaId).toBe("napoli");
    });

    it("does not create duplicate markers when rendered multiple times", () => {
        const area = createArea();
        const widget = new BubbleWidget(area, actions, {
            map,
            layerFactory,
        });

        widget.render();
        widget.render();

        expect(layerFactory.markers.length).toBe(1);
    });

    it("removes marker on destroy", () => {
        const area = createArea();
        const widget = new BubbleWidget(area, actions, {
            map,
            layerFactory,
        });

        widget.render();

        const marker = layerFactory.markers[0];

        widget.destroy();

        expect(marker.removeCalled).toBe(true);
    });
});

function createArea(): GeoArea {
    return new GeoArea({
        id: "napoli",
        name: "Napoli",
        center: [40.8518, 14.2681],
        radiusMeters: 12000,
        minRadiusPx: 16,
        maxRadiusPx: 64,
        liveMapRadiusPx: 256,
        manifestUrl: "/areas/napoli/manifest.json",
        images: [],
    });
}