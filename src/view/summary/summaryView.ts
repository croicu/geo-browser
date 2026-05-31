// view/summary/summaryView.ts

import type {
    ControllerActions,
    GatewayService,
    LayerFactory,
    MapFactory,
    MapHandle,
    RectangleHandle,
    View,
    WidgetFactory,
    WidgetHandle,
} from "../../contracts";
import { GeoCatalog } from "../../catalog/catalog";
import { SummaryViewState } from "../../state/summaryViewState";
import { getLogger } from "../../services";
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
    private _zoomCleanup?: () => void;
    private _zoomCooldownUntil = 0;
    private readonly _bubbleWidgets: BubbleWidget[] = [];
    private _designToolbar?: WidgetHandle;
    private _drawInteraction?: DrawAreaInteraction;
    private _namePopup?: WidgetHandle;
    private _pendingRect?: RectangleHandle;
    private _buildOverlay?: HTMLElement;

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
        this._zoomCooldownUntil = Date.now() + 500;
        this._moveEndCleanup = map.onMoveEnd(() => this.saveViewport());
        this._zoomCleanup = map.onZoom(zoom => this.onZoomChange(zoom));

        this.createBubbleWidgets();

        if (this._gateway) {
            this._designToolbar = this._widgetFactory.createDesignToolbar([
                { iconUrl: "/icons/design-new.svg", title: "New area", onClick: (setActive: (active: boolean) => void) => this.newArea(setActive) },
            ]);
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

        this._namePopup?.remove();
        this._namePopup = undefined;

        this._pendingRect?.remove();
        this._pendingRect = undefined;

        this._buildOverlay?.remove();
        this._buildOverlay = undefined;

        this._designToolbar?.remove();
        this._designToolbar = undefined;

        for (const bubbleWidget of this._bubbleWidgets) {
            bubbleWidget.destroy();
        }

        this._bubbleWidgets.length = 0;

        this._moveEndCleanup?.();
        this._moveEndCleanup = undefined;

        this._zoomCleanup?.();
        this._zoomCleanup = undefined;

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
        const map = this._map;
        if (!map) {
            return;
        }

        const [west, south, east, north] = bbox;
        this._pendingRect = this._layerFactory.createRectangle(
            [[south, west], [north, east]],
            { color: "#22c55e", weight: 2, fillColor: "#22c55e", fillOpacity: 0.12 }
        );
        this._pendingRect.addTo(map);

        const centerLat = (south + north) / 2;
        const centerLng = (west + east) / 2;

        this._namePopup = this._widgetFactory.createNamePromptPopup(
            [centerLat, centerLng],
            name => this.onCommit(bbox, name),
            () => this.onDiscard()
        );
        this._namePopup.addTo(map);
    }

    private onCommit(bbox: [number, number, number, number], name: string): void {
        this._namePopup?.remove();
        this._namePopup = undefined;
        this._pendingRect?.remove();
        this._pendingRect = undefined;
        this.showBuildOverlay(name);
        this._actions.commitArea(bbox, name);
    }

    private showBuildOverlay(areaName: string): void {
        if (!this._main) {
            return;
        }

        const overlay = document.createElement("div");
        overlay.className = "area-build-overlay";

        const content = document.createElement("div");
        content.className = "area-build-overlay-content";

        const ring = document.createElement("div");
        ring.className = "area-build-spinner-ring";

        const label = document.createElement("div");
        label.className = "area-build-overlay-label";
        label.textContent = `Building "${areaName}"…`;

        content.appendChild(ring);
        content.appendChild(label);
        overlay.appendChild(content);
        this._main.appendChild(overlay);
        this._buildOverlay = overlay;
    }

    private onDiscard(): void {
        this._namePopup?.remove();
        this._namePopup = undefined;
        this._pendingRect?.remove();
        this._pendingRect = undefined;
        this._actions.discardArea();
    }

    private onZoomChange(zoom: number): void {
        const log = getLogger();
        const center = this._map?.getCenter();
        log.info("summary.zoom", { zoom, lat: center?.[0], lng: center?.[1] });
        if (Date.now() < this._zoomCooldownUntil) {
            log.info("summary.zoom_cooldown", { zoom });
            return;
        }
        if (zoom < 11) {
            return;
        }
        const map = this._map;
        if (!map) {
            return;
        }
        const area = this.findAreaInBounds(map.getBounds(), map.getCenter());
        if (area) {
            log.info("summary.zoom_to_detail", { areaId: area.id, zoom, lat: center?.[0], lng: center?.[1] });
            this._actions.openDetail(area.id, map.getCenter(), map.getZoom());
        } else {
            log.info("summary.zoom_no_area", { zoom, lat: center?.[0], lng: center?.[1] });
        }
    }

    private findAreaInBounds(
        bounds: { sw: [number, number]; ne: [number, number] },
        center: [number, number]
    ) {
        let best: (typeof this._catalog.areas)[0] | undefined;
        let bestDist = Infinity;

        for (const area of this._catalog.areas) {
            const [west, south, east, north] = area.bbox;
            if (south > bounds.ne[0] || north < bounds.sw[0]
                || west > bounds.ne[1] || east < bounds.sw[1]) {
                continue;
            }
            const dist = distSquared(area.center, center);
            if (dist < bestDist) {
                bestDist = dist;
                best = area;
            }
        }

        return best;
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

function distSquared(a: [number, number], b: [number, number]): number {
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
}