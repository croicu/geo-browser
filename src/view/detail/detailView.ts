import type { GeoArea } from "../../catalog/area";
import type { ControllerActions, GatewayService, LayerFactory, MapFactory, WidgetFactory, WidgetHandle, MapHandle, View } from "../../contracts";
import type { DetailViewState } from "../../state/detailViewState";
import { getLogger } from "../../services";
import { HeatLayerView } from "./heatLayerView";
import { LayerSelectionWidget } from "./layerSelectionWidget";
import { LayerView } from "./layerView";
import { DefaultLeafletLayerFactory, DefaultLeafletMapFactory, DefaultLeafletWidgetFactory } from "./leafletFactories";
import { PointLayerView } from "./pointLayerView";
import { SummaryWidget } from "./summaryWidget";
import { BboxWidget } from "../summary/bboxWidget";

export interface DetailViewServices {
    mapFactory?: MapFactory;
    layerFactory?: LayerFactory;
    widgetFactory?: WidgetFactory;
    gateway?: GatewayService | null;
}

export class DetailView implements View {
    private readonly _root: HTMLElement;
    private readonly _actions: ControllerActions;
    private readonly _area: GeoArea;
    private readonly _state: DetailViewState;
    private readonly _mapFactory: MapFactory;
    private readonly _layerFactory: LayerFactory;
    private readonly _widgetFactory: WidgetFactory;
    private readonly _layerViews = new Map<string, LayerView>();

    private readonly _gateway: GatewayService | null;

    private _element?: HTMLElement;
    private _mapRoot?: HTMLElement;
    private _map?: MapHandle;
    private _bboxWidget?: BboxWidget;
    private _summaryWidget?: WidgetHandle;
    private _layersWidget?: LayerSelectionWidget;
    private _clickCleanup?: () => void;
    private _moveEndCleanup?: () => void;

    constructor(
        root: HTMLElement,
        actions: ControllerActions,
        area: GeoArea,
        state: DetailViewState,
        services: DetailViewServices = {}
    ) {
        this._root = root;
        this._actions = actions;
        this._area = area;
        this._state = state;
        this._mapFactory = services.mapFactory ?? new DefaultLeafletMapFactory();
        this._layerFactory = services.layerFactory ?? new DefaultLeafletLayerFactory();
        this._widgetFactory = services.widgetFactory ?? new DefaultLeafletWidgetFactory();
        this._gateway = services.gateway ?? null;

        void this._actions;
    }

    create(): void {
        this._element = document.createElement("div");
        this._element.className = "detail-view";

        this._mapRoot = document.createElement("div");
        this._mapRoot.className = "detail-map";

        this._element.appendChild(this._mapRoot);
        this._root.appendChild(this._element);
    }

    render(): void {
        if (!this._mapRoot) {
            this.create();
        }

        if (!this._map) {
            this.createMap();
        }

        const map = this._map;

        if (!map) {
            return;
        }

        if (!this._summaryWidget) {
            const summaryWidget = new SummaryWidget(map, this._actions, this._widgetFactory);
            const layersWidget = new LayerSelectionWidget(
                map,
                this._actions,
                this._widgetFactory,
                this._area.id,
                this._area.layers
            );

            summaryWidget.render();
            layersWidget.render();

            this._summaryWidget = summaryWidget;
            this._layersWidget = layersWidget;
            this._clickCleanup = map.onClick(latLng => this.onMapClick(latLng));
        }

        this.renderLayerViews();
    }

    destroy(): void {
        this.destroyLayerViews();

        if (this._map) {
            this.saveViewport();

            this._bboxWidget?.destroy();
            this._bboxWidget = undefined;

            this._clickCleanup?.();
            this._clickCleanup = undefined;

            this._moveEndCleanup?.();
            this._moveEndCleanup = undefined;

            this._map.remove();
            this._map = undefined;

            this._summaryWidget?.remove();
            this._layersWidget?.remove();

            this._summaryWidget = undefined;
            this._layersWidget = undefined;
        }

        if (this._element) {
            this._element.remove();
            this._element = undefined;
        }

        this._mapRoot = undefined;
    }

    private createMap(): void {
        let center;
        let zoom;

        if (!this._mapRoot) {
            return;
        }

        if (this._state) {
            center = this._state.center;
            zoom = this._state.zoom;
        } else {
            center = this._area.summary.center;
            zoom = 12;
        }

        this._map = this._mapFactory.createMap(this._mapRoot, center, zoom);
        this._moveEndCleanup = this._map.onMoveEnd(() => this.saveViewport());

        if (this._gateway) {
            const bboxWidget = new BboxWidget(
                this._map,
                this._layerFactory,
                this._gateway,
                this._area.id,
                this._area.bbox
            );
            bboxWidget.render();
            this._bboxWidget = bboxWidget;
        }
    }

    private renderLayerViews(): void {
        if (!this._map) {
            return;
        }

        for (const layer of this._area.layers) {
            const existing = this._layerViews.get(layer.id);
            const visible = this._state.isLayerVisible(layer.id);

            if (visible && !existing) {
                let layerView: LayerView;

                if (layer.type === "heatmap") {
                    layerView = new HeatLayerView(
                        this._map,
                        layer,
                        new DefaultLeafletLayerFactory()
                    );
                } else if (layer.type === "circle") {
                    layerView = new PointLayerView(
                        this._map,
                        layer,
                        new DefaultLeafletLayerFactory()
                    );
                } else {
                    continue;
                }
                this._layerViews.set(layer.id, layerView);

                void layerView.render();

                continue;
            }

            if (!visible && existing) {
                existing.destroy();
                this._layerViews.delete(layer.id);
            }
        }
    }

    private destroyLayerViews(): void {
        for (const layerView of this._layerViews.values()) {
            layerView.destroy();
        }

        this._layerViews.clear();
    }

    private saveViewport(): void {
        if (!this._map) {
            return;
        }
        this._actions.saveDetailViewport(this._area.id, this._map.getCenter(), this._map.getZoom());
    }

    private onMapClick(latLng: [number, number]): void {
        getLogger().diagnostic("map.click", { lat: latLng[0], lng: latLng[1] });
    }
}