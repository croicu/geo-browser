// view/summary/bubbleWidget.ts

import type {
    ControllerActions,
    LayerFactory,
    MapHandle,
    MapLayerHandle,
    CircleMarkerOptions,
    ClickableMapLayerHandle,
} from "../../contracts";
import { GeoArea } from "../../catalog/area";

export interface BubbleWidgetOptions {
    map: MapHandle;
    layerFactory: LayerFactory;
}

export class BubbleWidget {
    private readonly _area: GeoArea;
    private readonly _actions: ControllerActions;
    private readonly _map: MapHandle;
    private readonly _layerFactory: LayerFactory;

    private _marker?: ClickableMapLayerHandle;

    constructor(
        area: GeoArea,
        actions: ControllerActions,
        options: BubbleWidgetOptions
    ) {
        this._area = area;
        this._actions = actions;
        this._map = options.map;
        this._layerFactory = options.layerFactory;
    }

    render(): void {
        if (!this._marker) {
            this.createMarker();
        }
    }

    destroy(): void {
        this._marker?.remove();
        this._marker = undefined;
    }

    private createMarker(): void {
        const summary = this._area.summary;
        const style = this.getCircleMarkerOptions();

        this._marker = this._layerFactory.createCircleMarker(
            summary.center,
            style
        );

        this._marker.addTo(this._map);
        this._marker.onClick(this.handleClick);
    }

    private handleClick = (): void => {
        this._actions.openDetail(this._area.id);
    };

    private summaryRadius(area: GeoArea["summary"]): number {
        return area.minRadiusPx;
    }

    private getCircleMarkerOptions(): CircleMarkerOptions {
        return {
            radius: this.summaryRadius(this._area.summary),
            color: "#3388ff",
            fillColor: "#3388ff",
            opacity: 0.5,
            weight: 2,
            title: this._area.summary.name,
        };
    }
}
