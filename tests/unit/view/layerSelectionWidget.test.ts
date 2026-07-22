import { describe, expect, it } from "vitest";

import type { ControllerActions, LayerSelectionWidgetItem } from "../../../src/contracts";
import { LayerSelectionWidget } from "../../../src/view/detail/layerSelectionWidget";
import type { GeoLayer } from "../../../src/catalog/layer";
import { StubMapLayerFlyoutHandle } from "../../stubs/stubLeafletFactories";

class FakeActions implements ControllerActions {
    public layerAreaId?: string;
    public layerId?: string;
    public layerVisible?: boolean;

    setLayerVisible(areaId: string, layerId: string, visible: boolean): void {
        this.layerAreaId = areaId;
        this.layerId = layerId;
        this.layerVisible = visible;
    }

    newArea(): void {}
    commitArea(): void {}
    discardArea(): void {}
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
    it("sets the flyout's layer list from area layers", () => {
        const flyout = new StubMapLayerFlyoutHandle();
        const actions = new FakeActions();

        const layers = [
            new FakeGeoLayer("flickr", "Flickr", "#ff0000", true),
            new FakeGeoLayer("instagram", "Instagram", "#00ff00", false),
        ];

        const widget = new LayerSelectionWidget(
            flyout,
            actions,
            "napoli",
            layers as unknown as readonly GeoLayer[]
        );

        widget.render();

        expect(flyout.layers).toEqual([
            { id: "flickr", name: "Flickr", color: "#ff0000", visible: true },
            { id: "instagram", name: "Instagram", color: "#00ff00", visible: false },
        ] satisfies LayerSelectionWidgetItem[]);
    });

    it("emits setLayerVisible with area id when toggled", () => {
        const flyout = new StubMapLayerFlyoutHandle();
        const actions = new FakeActions();

        const layers = [new FakeGeoLayer("flickr", "Flickr", "#ff0000", true)];

        const widget = new LayerSelectionWidget(
            flyout,
            actions,
            "napoli",
            layers as unknown as readonly GeoLayer[]
        );

        widget.render();
        flyout.onToggle("flickr", false);

        expect(actions.layerAreaId).toBe("napoli");
        expect(actions.layerId).toBe("flickr");
        expect(actions.layerVisible).toBe(false);
    });

    it("reverts the flyout to an empty (map-type-only) layer list on destroy", () => {
        const flyout = new StubMapLayerFlyoutHandle();
        const actions = new FakeActions();

        const layers = [new FakeGeoLayer("flickr", "Flickr", "#ff0000", true)];

        const widget = new LayerSelectionWidget(
            flyout,
            actions,
            "napoli",
            layers as unknown as readonly GeoLayer[]
        );

        widget.render();
        widget.destroy();

        expect(flyout.layers).toEqual([]);
        // The flyout control itself is never removed/recreated.
        expect(flyout.removed).toBe(false);
    });
});
