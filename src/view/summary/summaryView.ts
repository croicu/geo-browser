// view/summary/summaryView.ts

import type {
    ControllerActions,
    DesignToolbarButton,
    DesignToolbarHandle,
    GatewayService,
    LayerFactory,
    MapFactory,
    MapHandle,
    RectangleHandle,
    View,
    WidgetFactory,
} from "../../contracts";
import { GeoCatalog } from "../../catalog/catalog";
import { SummaryViewState } from "../../state/summaryViewState";
import { BubbleWidget } from "./bubbleWidget";
import { DrawAreaInteraction } from "./drawAreaInteraction";
import { DefaultLeafletLayerFactory, DefaultLeafletMapFactory, DefaultLeafletWidgetFactory } from "../detail/leafletFactories";

export interface SummaryViewServices {
    mapFactory?: MapFactory;
    layerFactory?: LayerFactory;
    widgetFactory?: WidgetFactory;
    gateway?: GatewayService | null;
}

export class SummaryView implements View {
    private readonly _root: HTMLElement;
    private readonly _actions: ControllerActions;
    private readonly _catalog: GeoCatalog;
    private readonly _state: SummaryViewState;
    private readonly _mapFactory: MapFactory;
    private readonly _layerFactory: LayerFactory;
    private readonly _gateway: GatewayService | null;

    private readonly _widgetFactory: WidgetFactory;

    private _main?: HTMLElement;
    private _mapRoot?: HTMLElement;
    private _map?: MapHandle;
    private _moveEndCleanup?: () => void;
    private readonly _bubbleWidgets: BubbleWidget[] = [];
    private _normalButtons: DesignToolbarButton[] = [];
    private _designToolbar?: DesignToolbarHandle;
    private _drawInteraction?: DrawAreaInteraction;
    private _pendingBbox?: [number, number, number, number];
    private _pendingRect?: RectangleHandle;

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
        this._widgetFactory = services.widgetFactory ?? new DefaultLeafletWidgetFactory();
        this._gateway = services.gateway ?? null;
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

        if (this._gateway) {
            this._normalButtons = [
                { iconUrl: "/icons/design-new.svg", title: "New area", onClick: setActive => this.newArea(setActive) },
            ];
            this._designToolbar = this._widgetFactory.createDesignToolbar(this._normalButtons);
            this._designToolbar.addTo(map);
        }
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

        this._drawInteraction?.stop();
        this._drawInteraction = undefined;

        this._pendingRect?.remove();
        this._pendingRect = undefined;
        this._pendingBbox = undefined;

        this._designToolbar?.remove();
        this._designToolbar = undefined;

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

    private newArea(setActive: (active: boolean) => void): void {
        if (this._drawInteraction) {
            this._drawInteraction.stop();
            this._drawInteraction = undefined;
            setActive(false);
            return;
        }

        const map = this._map;
        if (!map) {
            return;
        }

        setActive(true);

        this._drawInteraction = new DrawAreaInteraction(
            map,
            this._layerFactory,
            bbox => {
                this._drawInteraction = undefined;
                setActive(false);
                this.onDrawComplete(bbox);
            }
        );
        this._drawInteraction.start();
    }

    private onDrawComplete(bbox: [number, number, number, number]): void {
        this._pendingBbox = bbox;

        const map = this._map;
        if (map) {
            const [west, south, east, north] = bbox;
            this._pendingRect = this._layerFactory.createRectangle(
                [[south, west], [north, east]],
                { color: "#22c55e", weight: 2, fillColor: "#22c55e", fillOpacity: 0.12 }
            );
            this._pendingRect.addTo(map);
        }

        this._designToolbar?.setButtons([
            { iconUrl: "/icons/design-ok.svg", title: "Commit area", onClick: _ => this.commitArea() },
            { iconUrl: "/icons/design-cancel.svg", title: "Discard area", onClick: _ => this.discardArea() },
        ]);
    }

    private commitArea(): void {
        const bbox = this._pendingBbox;
        this._pendingBbox = undefined;
        this._pendingRect?.remove();
        this._pendingRect = undefined;
        this._designToolbar?.setButtons(this._normalButtons);
        if (bbox) {
            this._actions.commitArea(bbox);
        }
    }

    private discardArea(): void {
        this._pendingBbox = undefined;
        this._pendingRect?.remove();
        this._pendingRect = undefined;
        this._designToolbar?.setButtons(this._normalButtons);
        this._actions.discardArea();
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
                    gateway: this._gateway,
                }
            );

            this._bubbleWidgets.push(bubbleWidget);
        }
    }
}