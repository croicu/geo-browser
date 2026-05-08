import type { GeoLayer } from "../../catalog/layer";
import {
    type ControllerActions,
    type WidgetHandle,
    type WidgetFactory,
    type MapHandle,
    type LayerSelectionWidgetItem,
} from "../../contracts";

import { fail } from "../../errors";

export class LayerSelectionWidget implements WidgetHandle {
    private readonly _map: MapHandle;
    private readonly _areaId: string;
    private readonly _layers: LayerSelectionWidgetItem[];
    private readonly _actions: ControllerActions;
    private readonly _factory: WidgetFactory;

    private _widget?: WidgetHandle;

    constructor(
        map: MapHandle,
        actions: ControllerActions,
        factory: WidgetFactory,
        areaId: string,
        layers: readonly GeoLayer[]
    ) {
        this._map = map;
        this._areaId = areaId;
        this._actions = actions;
        this._factory = factory;

        this._layers = [];

        for (const layer of layers) {
            this._layers.push({
                id: layer.id,
                name: layer.name ?? layer.id,
                color: layer.style?.color ?? "#888888",
                visible: layer.isVisible(),
            });
        }
    }

    addTo(map: MapHandle): void {
        if (!this._widget) {
            fail(
                "layerSelection_widget.not_created",
                "LayerSelectionWidget has not been created."
            );
        }

        this._widget.addTo(map);
    }

    remove(): void {
        if (!this._widget) {
            fail(
                "layerSelection_widget.not_created",
                "LayerSelectionWidget has not been created."
            );
        }

        this._widget.remove();
    }

    render(): void {
        if (!this._widget) {
            this._widget = this._factory.createLayerSelectionWidget(
                this._layers,
                (layerId: string, visible: boolean) => {
                    this._actions.setLayerVisible(this._areaId, layerId, visible);
                }
            );

            this._widget.addTo(this._map);
        }
    }

    destroy(): void {
        if (!this._widget) {
            fail(
                "layerSelection_widget.not_created",
                "LayerSelectionWidget has not been created."
            );
        }

        this._widget.remove();
        this._widget = undefined;
    }
}