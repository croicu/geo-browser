// view/summary/bubbleWidget.ts

import type {
    ControllerActions,
    GatewayService,
    LayerFactory,
    MapHandle,
    CircleMarkerOptions,
    ClickableMapLayerHandle,
} from "../../contracts";
import { GeoArea } from "../../catalog/area";
import { BboxWidget } from "./bboxWidget";

export interface BubbleWidgetOptions {
    map: MapHandle;
    layerFactory: LayerFactory;
    gateway?: GatewayService | null;
}

export class BubbleWidget {
    private readonly _area: GeoArea;
    private readonly _actions: ControllerActions;
    private readonly _map: MapHandle;
    private readonly _layerFactory: LayerFactory;
    private readonly _gateway: GatewayService | null;

    private _marker?: ClickableMapLayerHandle;
    private _bboxWidget?: BboxWidget;
    private _zoomCleanup?: () => void;

    constructor(
        area: GeoArea,
        actions: ControllerActions,
        options: BubbleWidgetOptions
    ) {
        this._area = area;
        this._actions = actions;
        this._map = options.map;
        this._layerFactory = options.layerFactory;
        this._gateway = options.gateway ?? null;
    }

    render(): void {
        if (!this._marker) {
            this.createMarker();
        }
    }

    destroy(): void {
        this._zoomCleanup?.();
        this._zoomCleanup = undefined;
        this._bboxWidget?.destroy();
        this._bboxWidget = undefined;
        this._marker?.remove();
        this._marker = undefined;
    }

    private createMarker(): void {
        const style = this.getCircleMarkerOptions();

        this._marker = this._layerFactory.createCircleMarker(
            this._area.center,
            style
        );

        this._marker.addTo(this._map);
        this._marker.onClick(this.handleClick);

        this._zoomCleanup = this._map.onZoom(zoom => this.updateRadius(zoom));

        if (this._gateway) {
            const bboxWidget = new BboxWidget(
                this._map,
                this._layerFactory,
                this._gateway,
                this._area.id,
                this._area.bbox,
                {
                    onEditStart: () => this._marker?.remove(),
                    onEditEnd: () => { if (this._marker) { this._marker.addTo(this._map); } },
                }
            );
            bboxWidget.render();
            this._bboxWidget = bboxWidget;
        }
    }

    private handleClick = (): void => {
        this._actions.openDetail(this._area.id);
    };

    private updateRadius(zoom: number): void {
        this._marker?.setRadius(this.computeRadius(zoom));
    }

    private computeRadius(zoom: number): number {
        const lat = this._area.center[0];
        const metersPerPixel =
            40075016.686 * Math.abs(Math.cos(lat * Math.PI / 180)) / Math.pow(2, zoom + 8);
        const radiusPx = this._area.radiusMeters / metersPerPixel;
        return Math.max(this._area.summary.minRadiusPx, radiusPx);
    }

    private getCircleMarkerOptions(): CircleMarkerOptions {
        return {
            radius: this.computeRadius(this._map.getZoom()),
            color: "#3388ff",
            fillColor: "#3388ff",
            opacity: 0.5,
            weight: 2,
            title: this._area.summary.name,
            label: this._area.summary.name,
        };
    }
}
