import type { GeoArea } from "../../catalog/area";
import type { Mode } from "../../runtime/context";
import type { ControllerActions, GatewayService, GeoLocationService, LayerFactory, MapFactory, MapLayerHandle, UserPointsStore, WidgetFactory, WidgetHandle, MapHandle, View } from "../../contracts";
import type { DetailViewState } from "../../state/detailViewState";
import { getLogger } from "../../services";
import { LocalStorageUserPointsStore, GatewayUserPointsStore } from "../../runtime/userPointsStore";
import { HeatLayerView } from "./heatLayerView";
import { LayerSelectionWidget } from "./layerSelectionWidget";
import { LayerView } from "./layerView";
import { DefaultLeafletLayerFactory, DefaultLeafletMapFactory, DefaultLeafletWidgetFactory } from "./leafletFactories";
import { PointLayerView } from "./pointLayerView";
import { PoiLayerView } from "./poiLayerView";
import { UserLayerView } from "./userLayerView";
import { SummaryWidget } from "./summaryWidget";
import { BboxWidget } from "../summary/bboxWidget";
import { GeoLocationWidget } from "./geoLocationWidget";
import { ManifestEditorWidget } from "./manifestEditorWidget";
import { CodeMirrorJsonEditorFactory } from "./codeMirrorJsonEditorFactory";
import { ImageOverlayWidget } from "./imageOverlayWidget";
import { Context } from "../../runtime/context";
import { GeoLayer } from "../../catalog/layer";

export interface DetailViewServices {
    mapFactory?: MapFactory;
    layerFactory?: LayerFactory;
    widgetFactory?: WidgetFactory;
    gateway?: GatewayService | null;
    geoLocation?: GeoLocationService | null;
    mode?: Mode;
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
    private readonly _mode: Mode;

    private _element?: HTMLElement;
    private _mapRoot?: HTMLElement;
    private _map?: MapHandle;
    private _paddedBounds?: { sw: [number, number]; ne: [number, number] };
    private _bboxWidget?: BboxWidget;
    private _manifestEditorWidget?: ManifestEditorWidget;
    private _bboxHighlight?: MapLayerHandle;
    private _summaryWidget?: WidgetHandle;
    private _layersWidget?: LayerSelectionWidget;
    private _geoLocationWidget?: GeoLocationWidget;
    private _imageOverlayWidget?: ImageOverlayWidget;
    private _userPointsStore?: UserPointsStore;
    private _userLayerView?: UserLayerView;
    private _userGeoLayer?: GeoLayer;
    private _hasImageOverlay = false;

    private _clickCleanup?: () => void;
    private _contextMenuCleanup?: () => void;
    private _longPressCleanup?: () => void;
    private _moveEndCleanup?: () => void;
    private _zoomCleanup?: () => void;
    private _minZoom = 0;
    private _zoomCooldownUntil = 0;

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
        this._mode = services.mode ?? "browse";

        this._userPointsStore = this._gateway
            ? new GatewayUserPointsStore(this._gateway)
            : new LocalStorageUserPointsStore(Context.Instance.storage);

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
                this._area.layers.filter(l => l.type !== "__user__"),
                layer => this._state.isLayerVisible(layer.id, layer.isVisible())
            );

            summaryWidget.render();
            layersWidget.render();

            this._summaryWidget = summaryWidget;
            this._layersWidget = layersWidget;
            this._clickCleanup = map.onClick(latLng => this.onMapClick(latLng));
            this._contextMenuCleanup = map.onContextMenu(latLng => this.onUserPoint(latLng, 0.5));
            this._longPressCleanup = map.onLongPress((latLng, pressure) => this.onUserPoint(latLng, pressure));

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

            const imageOverlay = new ImageOverlayWidget(map, {
                areaBbox: this._area.bbox,
                onImageLoaded: () => { this._hasImageOverlay = true; this.relaxBoundsForOverlay(); },
                onImageRemoved: () => { this._hasImageOverlay = false; this.restoreBoundsAfterOverlay(); },
                getCurrentLatLng: () => this._geoLocationWidget?.getLastPosition(),
            });
            imageOverlay.render();
            this._imageOverlayWidget = imageOverlay;
        }

        this.renderLayerViews();
    }

    destroy(): void {
        this.destroyLayerViews();

        if (this._map) {
            this.saveViewport();

            this._bboxWidget?.destroy();
            this._bboxWidget = undefined;

            this._manifestEditorWidget?.destroy();
            this._manifestEditorWidget = undefined;

            this._geoLocationWidget?.destroy();
            this._geoLocationWidget = undefined;

            this._imageOverlayWidget?.destroy();
            this._imageOverlayWidget = undefined;

            this._clickCleanup?.();
            this._clickCleanup = undefined;

            this._contextMenuCleanup?.();
            this._contextMenuCleanup = undefined;

            this._longPressCleanup?.();
            this._longPressCleanup = undefined;

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
        this._zoomCleanup = this._map.onZoom(zoom => this.onZoomChange(zoom));
        this.addBboxHighlight();
        this._moveEndCleanup = this._map.onMoveEnd(() => this.saveViewport());

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

            const manifestEditor = new ManifestEditorWidget(
                this._map,
                this._gateway,
                this._area.id,
                {
                    editorFactory: new CodeMirrorJsonEditorFactory(),
                    onReload: () => this.reloadLayers(),
                }
            );
            manifestEditor.render();
            this._manifestEditorWidget = manifestEditor;
        }
    }

    private renderLayerViews(): void {
        if (!this._map) {
            return;
        }

        const zoom = this._map.getZoom();

        for (const layer of this._area.layers) {
            if (layer.type === "__poi__" && !layer.isVisible()) {
                continue;
            }
            if (layer.type === "__user__") {
                continue;
            }

            const existing = this._layerViews.get(layer.id);
            const minZoom = layer.style?.minZoom;
            const visible = this._state.isLayerVisible(layer.id)
                && (minZoom === undefined || zoom >= minZoom);

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
                } else if (layer.type === "__poi__") {
                    layerView = new PoiLayerView(
                        this._map,
                        layer,
                        this._area.layers,
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

        // User layer: always create regardless of visibility so the toolbar
        // toggle persists even when hidden; never auto-destroyed by the loop above.
        for (const layer of this._area.layers) {
            if (layer.type !== "__user__") {
                continue;
            }
            const minZoom = layer.style?.minZoom;
            const visible = this._state.isLayerVisible(layer.id, layer.isVisible())
                && (minZoom === undefined || zoom >= minZoom);
            const existing = this._layerViews.get(layer.id) as UserLayerView | undefined;

            if (!existing) {
                const userView = new UserLayerView(
                    this._map,
                    layer,
                    new DefaultLeafletLayerFactory(),
                    this._userPointsStore!,
                    this._area.id,
                    visible,
                );
                this._userLayerView = userView;
                this._userGeoLayer = layer;
                this._layerViews.set(layer.id, userView);
                void userView.render().then(() => {
                    if (this._userLayerView && this._userLayerView.featureCount > 0) {
                        this.rebuildLayersWidget();
                    }
                });
            } else {
                existing.setVisible(visible);
            }
            break;
        }

        this.syncPoiSourceVisibility();
    }

    private syncPoiSourceVisibility(): void {
        const poiView = this._layerViews.get("__poi__");
        if (!(poiView instanceof PoiLayerView)) {
            return;
        }
        for (const layer of this._area.layers) {
            if (!layer.isVirtual()) {
                poiView.setSourceVisible(
                    layer.id,
                    this._state.isLayerVisible(layer.id, layer.isVisible())
                );
            }
        }
    }

    private reloadLayers(): void {
        void this.doReloadLayers();
    }

    private async doReloadLayers(): Promise<void> {
        const log = getLogger();
        log.info("detail.reload_layers.start", { areaId: this._area.id });
        await this._area.reload();

        for (const layer of this._area.layers) {
            const visible = this._state.isLayerVisible(layer.id, layer.isVisible());
            this._state.setLayerVisible(layer.id, visible);
        }

        // Preserve the user layer — it's managed incrementally and must not be re-fetched on every AreaChanged
        for (const [id, layerView] of this._layerViews) {
            if (id !== "__user__") layerView.destroy();
        }
        for (const id of [...this._layerViews.keys()]) {
            if (id !== "__user__") this._layerViews.delete(id);
        }

        this.rebuildLayersWidget();
        this.renderLayerViews();
    }

    private destroyLayerViews(): void {
        for (const layerView of this._layerViews.values()) {
            layerView.destroy();
        }

        this._layerViews.clear();
    }

    private onZoomChange(zoom: number): void {
        const map = this._map;
        const center = map?.getCenter();
        getLogger().info("detail.zoom", { zoom, minZoom: this._minZoom, areaId: this._area.id, lat: center?.[0], lng: center?.[1] });
        if (Date.now() < this._zoomCooldownUntil) {
            getLogger().info("detail.zoom_cooldown", { zoom });
            return;
        }
        if (zoom < this._minZoom) {
            if (map) {
                const summaryZoom = Math.min(map.getZoom(), 10);
                getLogger().info("detail.zoom_to_summary", { zoom, summaryZoom, lat: center?.[0], lng: center?.[1] });
                // Clamp to 10 so the summary never opens at zoom ≥ 11, which would
                // immediately re-trigger openDetail and create a bounce loop.
                // Pass coordinates directly — do not save to storage so the stored
                // summary position is preserved for toolbar-triggered transitions.
                this._actions.openSummary(map.getCenter(), summaryZoom);
            } else {
                this._actions.openSummary();
            }
            return;
        }
        this.renderLayerViews();
    }

    private relaxBoundsForOverlay(): void {
        const map = this._map;
        if (!map) {
            return;
        }
        map.setMaxBounds([-90, -180], [90, 180]);
        map.setMinZoom(1);
    }

    private restoreBoundsAfterOverlay(): void {
        this.applyMaxBounds();
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
        if (this._mode !== "design") {
            map.setMaxBounds(sw, ne);
        }
        const fitZoom = map.getBoundsZoom(sw, ne);
        this._minZoom = Math.max(11, Math.floor(fitZoom) - 1);
        this._zoomCooldownUntil = Date.now() + 500;
        getLogger().info("detail.min_zoom", { fitZoom, minZoom: this._minZoom, areaId: this._area.id });
        // Snap to minZoom without animation if the current zoom is below it.
        // This happens when entering from summary at a low zoom (e.g. 11) while
        // minZoom may be 15. Without the snap, Leaflet fires a zoomend after the
        // cooldown expires while the map is still at the low zoom, which incorrectly
        // triggers the zoom-to-summary exit. The snap is safe here because onZoom
        // is registered after applyMaxBounds returns, so no handler fires.
        if (map.getZoom() < this._minZoom) {
            map.setZoom(this._minZoom);
        }
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

    private onUserPoint(latLng: [number, number], pressure: number): void {
        void this.doOnUserPoint(latLng, pressure);
    }

    private async doOnUserPoint(latLng: [number, number], pressure: number): Promise<void> {
        const log = getLogger();
        log.info("user_layer.add_point.start", { lat: latLng[0], lng: latLng[1], pressure });

        if (this._hasImageOverlay) {
            log.info("user_layer.add_point.suppressed", { reason: "image_overlay_active" });
            return;
        }

        if (!this._userLayerView) {
            log.warning("user_layer.add_point.synthesize", {
                reason: "__user__ layer missing from manifest — synthesizing defaults",
                areaId: this._area.id,
            });
            await this.synthesizeUserLayerView();
        }

        if (!this._userLayerView || !this._map) return;

        const store = this._userPointsStore;
        if (!store) return;

        const wasEmpty = this._userLayerView.featureCount === 0;

        void store.addPoint(this._area.id, latLng[0], latLng[1], pressure);

        this._userLayerView.addMarker(latLng, pressure);
        log.info("user_layer.add_point.marker_placed", { featureCount: this._userLayerView.featureCount });

        if (wasEmpty) {
            this.rebuildLayersWidget();
        }

        log.info("user_layer.add_point.end", { lat: latLng[0], lng: latLng[1] });
    }

    private async synthesizeUserLayerView(): Promise<void> {
        if (!this._map || !this._userPointsStore) return;

        const syntheticLayer = new GeoLayer({
            id: "__user__",
            name: "My Trip",
            type: "__user__",
            url: null,
            visible: true,
            style: { color: "#5f5f5f", opacity: 0.7, radius: 40, minZoom: 12 },
        });

        const userView = new UserLayerView(
            this._map,
            syntheticLayer,
            new DefaultLeafletLayerFactory(),
            this._userPointsStore,
            this._area.id,
        );

        this._userLayerView = userView;
        this._userGeoLayer = syntheticLayer;
        this._layerViews.set("__user__", userView);
        await userView.render();
    }

    private rebuildLayersWidget(): void {
        if (!this._map) return;

        this._layersWidget?.remove();
        this._layersWidget = undefined;

        const hasUserPoints = this._userLayerView !== undefined && this._userLayerView.featureCount > 0;

        const sourceLayers = [...this._area.layers];
        const manifestHasUser = sourceLayers.some(l => l.type === "__user__");
        if (!manifestHasUser && hasUserPoints && this._userGeoLayer) {
            sourceLayers.push(this._userGeoLayer);
        }

        const visibleLayers = sourceLayers.filter(layer => {
            if (layer.type === "__user__") return hasUserPoints;
            if (layer.type === "__poi__") return layer.isVisible();
            return true;
        });

        const layersWidget = new LayerSelectionWidget(
            this._map,
            this._actions,
            this._widgetFactory,
            this._area.id,
            visibleLayers,
            layer => this._state.isLayerVisible(layer.id, layer.isVisible())
        );
        layersWidget.render();
        this._layersWidget = layersWidget;
    }

    private onMapClick(latLng: [number, number]): void {
        getLogger().diagnostic("map.click", { lat: latLng[0], lng: latLng[1] });
    }
}