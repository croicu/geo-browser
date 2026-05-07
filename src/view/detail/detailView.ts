import type { GeoArea } from "../../catalog/area";
import type { ControllerActions, MapFactory, WidgetFactory, WidgetHandle, MapHandle, View } from "../../contracts";
import type { DetailViewState } from "../../state/detailViewState";
import { LayerView } from "./layerView";
import { DefaultLeafletLayerFactory, DefaultLeafletMapFactory, DefaultLeafletWidgetFactory } from "./leafletFactories";
import { SummaryWidget } from "./summaryWidget";

export interface DetailViewServices {
    mapFactory?: MapFactory;
    widgetFactory?: WidgetFactory;
}

export class DetailView implements View {
    private readonly _root: HTMLElement;
    private readonly _actions: ControllerActions;
    private readonly _area: GeoArea;
    private readonly _state: DetailViewState;
    private readonly _mapFactory: MapFactory;
    private readonly _widgetFactory: WidgetFactory;
    private _layerViews: LayerView[] = [];

    private _element?: HTMLElement;
    private _mapRoot?: HTMLElement;
    private _map?: MapHandle;
    private _summaryWidget?: WidgetHandle;

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
        this._mapFactory = services.mapFactory?? new DefaultLeafletMapFactory();
        this._widgetFactory = services.widgetFactory?? new DefaultLeafletWidgetFactory();

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
            const summaryWidget = new SummaryWidget(
                this._map,
                this._actions,
                this._widgetFactory
            );
            summaryWidget.render();

            this._summaryWidget = summaryWidget;
        }

        this.destroyLayerViews();

        for (const layer of this._area.layers) {
            if (!layer.isVisible()) {
                continue;
            }

            const layerView = new LayerView(this._map, layer, new DefaultLeafletLayerFactory());
            this._layerViews.push(layerView);

            void layerView.render();
        }
    }

    destroy(): void {
        this.destroyLayerViews();

        if (this._map) {
            this._map.remove();
            this._map = undefined;

            this._summaryWidget.remove();
            this._summaryWidget = undefined;
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
    }

    private destroyLayerViews(): void {
        for (const layerView of this._layerViews) {
            layerView.destroy();
        }

        this._layerViews = [];
    }
}