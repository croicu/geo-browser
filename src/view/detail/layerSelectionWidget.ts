import type { GeoLayer } from "../../catalog/layer";
import {
    type ControllerActions,
    type MapLayerFlyoutHandle,
    type LayerSelectionWidgetItem,
} from "../../contracts";

// Thin adapter over an injected, session-persistent MapLayerFlyoutHandle
// (owned by MapView) — never creates or destroys the flyout control itself,
// only swaps its "Map Details" layer list via setLayers(). The flyout's tile
// layer must survive current-area attach/hide transitions; recreating the
// control on every transition was flashing the whole map's tiles (see
// MapLayerFlyoutHandle's doc comment in contracts.ts).
export class LayerSelectionWidget {
    private readonly _flyout: MapLayerFlyoutHandle;
    private readonly _areaId: string;
    private readonly _layers: LayerSelectionWidgetItem[];
    private readonly _actions: ControllerActions;
    private readonly _onExportUserPoints?: () => void;

    constructor(
        flyout: MapLayerFlyoutHandle,
        actions: ControllerActions,
        areaId: string,
        layers: readonly GeoLayer[],
        getVisible?: (layer: GeoLayer) => boolean,
        onExportUserPoints?: () => void
    ) {
        this._flyout = flyout;
        this._areaId = areaId;
        this._actions = actions;
        this._onExportUserPoints = onExportUserPoints;

        this._layers = [];

        for (const layer of layers) {
            this._layers.push({
                id: layer.id,
                name: layer.name ?? layer.id,
                color: layer.style?.color ?? "#888888",
                visible: getVisible ? getVisible(layer) : layer.isVisible(),
            });
        }
    }

    render(): void {
        this._flyout.setLayers(
            this._layers,
            (layerId: string, visible: boolean) => {
                this._actions.setLayerVisible(this._areaId, layerId, visible);
            },
            this._onExportUserPoints
        );
    }

    // Reverts the shared flyout to its map-type-only panel.
    destroy(): void {
        this._flyout.setLayers([], () => {});
    }
}
