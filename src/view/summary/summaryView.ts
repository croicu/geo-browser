// view/summary/summaryView.ts

import type {
    ControllerActions,
    LayerFactory,
    MapFactory,
    MapHandle,
    View,
} from "../../contracts";
import { GeoCatalog } from "../../catalog/catalog";
import { SummaryViewState } from "../../state/summaryViewState";
import { BubbleWidget } from "./bubbleWidget";
import { DefaultLeafletLayerFactory, DefaultLeafletMapFactory } from "../detail/leafletFactories";

export interface SummaryViewServices {
    mapFactory?: MapFactory;
    layerFactory?: LayerFactory;
}

export class SummaryView implements View {
    private readonly _root: HTMLElement;
    private readonly _actions: ControllerActions;
    private readonly _catalog: GeoCatalog;
    private readonly _state: SummaryViewState;
    private readonly _mapFactory: MapFactory;
    private readonly _layerFactory: LayerFactory;

    private _main?: HTMLElement;
    private _mapRoot?: HTMLElement;
    private _map?: MapHandle;
    private _moveEndCleanup?: () => void;
    private readonly _bubbleWidgets: BubbleWidget[] = [];

    constructor(
        root: HTMLElement,
        actions: ControllerActions,
        catalog: GeoCatalog,
        state: SummaryViewState,
        services: SummaryViewServices = {}
    ) {
        this._root = root;
        this._actions = actions;
        this._catalog = catalog;
        this._state = state;
        this._mapFactory = services.mapFactory ?? new DefaultLeafletMapFactory();
        this._layerFactory = services.layerFactory ?? new DefaultLeafletLayerFactory();
    }

    create(): void {
        if (this._main) {
            return;
        }

        this._main = document.createElement("main");
        this._main.className = "summary-view";

        this._mapRoot = document.createElement("div");
        this._mapRoot.className = "summary-map";

        this._main.appendChild(this._mapRoot);
        this._root.appendChild(this._main);

        const map = this._mapFactory.createMap(
            this._mapRoot,
            this._state.center,
            this._state.zoom
        );

        this._map = map;
        this._moveEndCleanup = map.onMoveEnd(() => this.saveViewport());

        this.createBubbleWidgets();
    }

    render(): void {
        if (!this._main) {
            this.create();
        }

        for (const bubbleWidget of this._bubbleWidgets) {
            bubbleWidget.render();
        }
    }

    destroy(): void {
        this.saveViewport();

        for (const bubbleWidget of this._bubbleWidgets) {
            bubbleWidget.destroy();
        }

        this._bubbleWidgets.length = 0;

        this._moveEndCleanup?.();
        this._moveEndCleanup = undefined;

        this._map?.remove();
        this._map = undefined;

        this._main?.remove();
        this._main = undefined;
        this._mapRoot = undefined;
    }

    private saveViewport(): void {
        if (!this._map) {
            return;
        }
        this._actions.saveSummaryViewport(this._map.getCenter(), this._map.getZoom());
    }

    private createBubbleWidgets(): void {
        const map = this._map;

        if (!map) {
            return;
        }

        this._bubbleWidgets.length = 0;

        for (const area of this._catalog.areas) {
            const bubbleWidget = new BubbleWidget(
                area,
                this._actions,
                {
                    map,
                    layerFactory: this._layerFactory,
                }
            );

            this._bubbleWidgets.push(bubbleWidget);
        }
    }
}