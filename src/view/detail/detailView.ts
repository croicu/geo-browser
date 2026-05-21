import type { GeoArea } from "../../catalog/area";
import type { ControllerActions, GatewayService, GeoLocationService, LayerFactory, MapFactory, MapLayerHandle, WidgetFactory, WidgetHandle, MapHandle, View } from "../../contracts";
import type { DetailViewState } from "../../state/detailViewState";
import { getLogger } from "../../services";
import { HeatLayerView } from "./heatLayerView";
import { LayerSelectionWidget } from "./layerSelectionWidget";
import { LayerView } from "./layerView";
import { DefaultLeafletLayerFactory, DefaultLeafletMapFactory, DefaultLeafletWidgetFactory } from "./leafletFactories";
import { PointLayerView } from "./pointLayerView";
import { SummaryWidget } from "./summaryWidget";
import { BboxWidget } from "../summary/bboxWidget";
import { GeoLocationWidget } from "./geoLocationWidget";

export interface DetailViewServices {
    mapFactory?: MapFactory;
    layerFactory?: LayerFactory;
    widgetFactory?: WidgetFactory;
    gateway?: GatewayService | null;
    geoLocation?: GeoLocationService | null;
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
    private readonly _geoLocation: GeoLocationService | null;

    private _element?: HTMLElement;
    private _mapRoot?: HTMLElement;
    private _map?: MapHandle;
    private _paddedBounds?: { sw: [number, number]; ne: [number, number] };
    private _bboxWidget?: BboxWidget;
    private _bboxHighlight?: MapLayerHandle;
    private _summaryWidget?: WidgetHandle;
    private _layersWidget?: LayerSelectionWidget;
    private _geoLocationWidget?: GeoLocationWidget;
    private _clickCleanup?: () => void;
    private _moveEndCleanup?: () => void;
    private _zoomCleanup?: () => void;
    private _minZoom = 0;

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
        this._geoLocation = services.geoLocation ?? null;

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

            if (this._geoLocation) {
                const geoWidget = new GeoLocationWidget(
                    map,
                    this._geoLocation,
                    this._widgetFactory,
                    this._layerFactory,
                    this._paddedBounds
                );
                geoWidget.render();
                this._geoLocationWidget = geoWidget;
            }
        }

        this.renderLayerViews();
    }

    destroy(): void {
        this.destroyLayerViews();

        if (this._map) {
            this.saveViewport();

            this._bboxWidget?.destroy();
            this._bboxWidget = undefined;

            this._geoLocationWidget?.destroy();
            this._geoLocationWidget = undefined;

            this._clickCleanup?.();
            this._clickCleanup = undefined;

            this._moveEndCleanup?.();
            this._moveEndCleanup = undefined;

            this._zoomCleanup?.();
            this._zoomCleanup = undefined;

            this._bboxHighlight?.remove();
            this._bboxHighlight = undefined;

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
            center = this._area.center;
            zoom = 12;
        }

        this._map = this._mapFactory.createMap(this._mapRoot, center, zoom);
        this.applyMaxBounds();
        this.addBboxHighlight();
        this._moveEndCleanup = this._map.onMoveEnd(() => this.saveViewport());
        this._zoomCleanup = this._map.onZoom(zoom => this.onZoomChange(zoom));

        if (this._gateway) {
            const bboxWidget = new BboxWidget(
                this._map,
                this._layerFactory,
                this._gateway,
                this._area.id,
                this._area.bbox,
                {
                    onSaveSuccess: () => {
                        for (const layer of this._area.layers) {
                            layer.invalidate();
                        }
                        this.destroyLayerViews();
                        this.renderLayerViews();
                    },
                }
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

    private onZoomChange(zoom: number): void {
        if (zoom <= this._minZoom) {
            this._actions.openSummary();
        }
    }

    private applyMaxBounds(): void {
        const map = this._map;
        if (!map) {
            return;
        }
        const [west, south, east, north] = this._area.bbox;
        const padLat = (north - south) / 2;
        const padLng = (east - west) / 2;
        const sw: [number, number] = [south - padLat, west - padLng];
        const ne: [number, number] = [north + padLat, east + padLng];
        this._paddedBounds = { sw, ne };
        map.setMaxBounds(sw, ne);
        const fitZoom = map.getBoundsZoom(sw, ne);
        this._minZoom = Math.max(1, Math.floor(fitZoom) - 1);
        map.setMinZoom(this._minZoom);
    }

    private addBboxHighlight(): void {
        const map = this._map;
        if (!map) {
            return;
        }
        const [west, south, east, north] = this._area.bbox;
        const highlight = this._layerFactory.createRectangle(
            [[south, west], [north, east]],
            { color: "#3388ff", weight: 1, fillColor: "#3388ff", fillOpacity: 0.05 }
        );
        highlight.addTo(map);
        this._bboxHighlight = highlight;
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