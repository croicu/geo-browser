import { describe, expect, it } from "vitest";

import type {
    ControllerActions,
    WidgetFactory,
    WidgetHandle,
    LayerSelectionWidgetItem,
} from "../../../src/contracts";

import { LayerSelectionWidget } from "../../../src/view/detail/layerSelectionWidget";
import type { MapHandle } from "../../../src/contracts";
import type { GeoLayer } from "../../../src/catalog/layer";

class StubMapHandle implements MapHandle {
    remove(): void {
    }
}

class StubWidgetHandle implements WidgetHandle {
    public addedTo?: MapHandle;
    public removed = false;

    addTo(map: MapHandle): void {
        this.addedTo = map;
    }

    remove(): void {
        this.removed = true;
    }
}

class StubWidgetFactory implements WidgetFactory {
    public layers?: LayerSelectionWidgetItem[];
    public onToggle?: (layerId: string, visible: boolean) => void;
    public handle = new StubWidgetHandle();

    createSummaryWidget(label: string, onClick: () => void): WidgetHandle {
        void onClick;
        
        return new StubWidgetHandle();
    }

    createLayerSelectionWidget(
        layers: LayerSelectionWidgetItem[],
        onToggle: (layerId: string, visible: boolean) => void
    ): WidgetHandle {
        this.layers = layers;
        this.onToggle = onToggle;

        return this.handle;
    }
}

class FakeActions implements ControllerActions {
    public layerAreaId?: string;
    public layerId?: string;
    public layerVisible?: boolean;

    openSummary(): void {
    }

    openDetail(_areaId: string): void {
    }

    zoomIn(): void {
    }

    zoomOut(): void {
    }

    setZoom(_zoomLevel: number): void {
    }

    setLayerVisible(
        areaId: string,
        layerId: string,
        visible: boolean
    ): void {
        this.layerAreaId = areaId;
        this.layerId = layerId;
        this.layerVisible = visible;
    }
}

class FakeGeoLayer {
    public readonly id: string;
    public readonly name: string;
    public readonly style: { color?: string };
    private readonly _visible: boolean;

    constructor(
        id: string,
        name: string,
        color: string,
        visible: boolean
    ) {
        this.id = id;
        this.name = name;
        this.style = { color };
        this._visible = visible;
    }

    isVisible(): boolean {
        return this._visible;
    }
}

describe("LayerSelectionWidget", () => {
    it("creates a layer selection widget from area layers", () => {
        const map = new StubMapHandle();
        const actions = new FakeActions();
        const factory = new StubWidgetFactory();

        const layers = [
            new FakeGeoLayer("flickr", "Flickr", "#ff0000", true),
            new FakeGeoLayer("instagram", "Instagram", "#00ff00", false),
        ];

        const widget = new LayerSelectionWidget(
            map,
            actions,
            factory,
            "napoli",
            layers as unknown as readonly GeoLayer[]
        );

        widget.render();

        expect(factory.layers).toEqual([
            {
                id: "flickr",
                name: "Flickr",
                color: "#ff0000",
                visible: true,
            },
            {
                id: "instagram",
                name: "Instagram",
                color: "#00ff00",
                visible: false,
            },
        ]);

        expect(factory.handle.addedTo).toBe(map);
    });

    it("emits setLayerVisible with area id when toggled", () => {
        const map = new StubMapHandle();
        const actions = new FakeActions();
        const factory = new StubWidgetFactory();

        const layers = [
            new FakeGeoLayer("flickr", "Flickr", "#ff0000", true),
        ];

        const widget = new LayerSelectionWidget(
            map,
            actions,
            factory,
            "napoli",
            layers as unknown as readonly GeoLayer[]
        );

        widget.render();

        factory.onToggle?.("flickr", false);

        expect(actions.layerAreaId).toBe("napoli");
        expect(actions.layerId).toBe("flickr");
        expect(actions.layerVisible).toBe(false);
    });

    it("removes the widget on destroy", () => {
        const map = new StubMapHandle();
        const actions = new FakeActions();
        const factory = new StubWidgetFactory();

        const layers = [
            new FakeGeoLayer("flickr", "Flickr", "#ff0000", true),
        ];

        const widget = new LayerSelectionWidget(
            map,
            actions,
            factory,
            "napoli",
            layers as unknown as readonly GeoLayer[]
        );

        widget.render();
        widget.destroy();

        expect(factory.handle.removed).toBe(true);
    });
});