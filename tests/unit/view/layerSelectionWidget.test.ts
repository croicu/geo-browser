import { describe, expect, it } from "vitest";

import type {
    ControllerActions,
    LayerSelectionWidgetItem,
    MapHandle,
    WidgetFactory,
    WidgetHandle,
} from "../../../src/contracts";
import { LayerSelectionWidget } from "../../../src/view/detail/layerSelectionWidget";
import type { GeoLayer } from "../../../src/catalog/layer";
import { StubMap, StubWidget } from "../../stubs/stubLeafletFactories";

class FakeWidgetFactory implements WidgetFactory {
    public layers?: LayerSelectionWidgetItem[];
    public onToggle?: (layerId: string, visible: boolean) => void;

    private readonly _handle = new StubWidget();

    createSummaryWidget(_label: string, _onClick: () => void): WidgetHandle {
        return new StubWidget();
    }

    createMapLayerFlyout(
        layers: LayerSelectionWidgetItem[],
        onToggle: (layerId: string, visible: boolean) => void
    ): WidgetHandle {
        this.layers = layers;
        this.onToggle = onToggle;
        return this._handle;
    }

    get handle(): StubWidget {
        return this._handle;
    }
}

class FakeActions implements ControllerActions {
    public layerAreaId?: string;
    public layerId?: string;
    public layerVisible?: boolean;

    openSummary(): void {}
    openDetail(_areaId: string): void {}
    saveSummaryViewport(_center: [number, number], _zoom: number): void {}
    saveDetailViewport(_areaId: string, _center: [number, number], _zoom: number): void {}
    zoomIn(): void {}
    zoomOut(): void {}
    setZoom(_zoomLevel: number): void {}

    setLayerVisible(areaId: string, layerId: string, visible: boolean): void {
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

    constructor(id: string, name: string, color: string, visible: boolean) {
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
        const map = new StubMap();
        const actions = new FakeActions();
        const factory = new FakeWidgetFactory();

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
            { id: "flickr", name: "Flickr", color: "#ff0000", visible: true },
            { id: "instagram", name: "Instagram", color: "#00ff00", visible: false },
        ]);

        expect(factory.handle.addedTo).toBe(map);
    });

    it("emits setLayerVisible with area id when toggled", () => {
        const map = new StubMap();
        const actions = new FakeActions();
        const factory = new FakeWidgetFactory();

        const layers = [new FakeGeoLayer("flickr", "Flickr", "#ff0000", true)];

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
        const map = new StubMap();
        const actions = new FakeActions();
        const factory = new FakeWidgetFactory();

        const layers = [new FakeGeoLayer("flickr", "Flickr", "#ff0000", true)];

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
