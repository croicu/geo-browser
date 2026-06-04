import type { GeoArea } from "../../catalog/area";
import type { Mode } from "../../runtime/context";
import type { ControllerActions, GatewayService, GeoLocationService, LayerFactory, MapFactory, MapLayerHandle, MapPopupHandle, UserPointsStore, WidgetFactory, WidgetHandle, MapHandle, View } from "../../contracts";
import type { DetailViewState } from "../../state/detailViewState";
import { getLogger } from "../../services";
import { LocalStorageUserPointsStore, GatewayUserPointsStore } from "../../runtime/userPointsStore";
import { HeatLayerView } from "./heatLayerView";
import { LayerSelectionWidget } from "./layerSelectionWidget";
import { LayerView } from "./layerView";
import { DefaultLeafletLayerFactory, DefaultLeafletMapFactory, DefaultLeafletWidgetFactory } from "./leafletFactories";
import { PointLayerView } from "./pointLayerView";
import { PoiLayerView } from "./poiLayerView";
import type { PoiBakedFeature } from "./poiLayerView";
import { UserLayerView } from "./userLayerView";
import { VoidLayerView } from "./voidLayerView";
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
    userPointsStore?: UserPointsStore;
    mode?: Mode;
}

function poiBakedToProperties(f: PoiBakedFeature): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    if (f.name !== undefined)         result["name"] = f.name;
    if (f.amenity !== undefined)      result["amenity"] = f.amenity;
    if (f.cuisine !== undefined)      result["cuisine"] = f.cuisine;
    if (f.openingHours !== undefined) result["opening_hours"] = f.openingHours;
    if (f.address !== undefined)      result["address"] = f.address;
    if (f.website !== undefined)      result["website"] = f.website;
    return result;
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
    private _emptySpacePopup?: MapPopupHandle;

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

        this._userPointsStore = services.userPointsStore
            ?? (this._gateway
                ? new GatewayUserPointsStore(this._gateway)
                : new LocalStorageUserPointsStore(Context.Instance.storage));

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
                    this._paddedBounds,
                    Context.Instance.debug,
                    Context.Instance.headingService
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

            this.closeEmptySpacePopup();

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
        this._moveEndCleanup = this._map.onMoveEnd(() => this.onMapMoveEnd());

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
            if (layer.type === "__void__") {
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
                    this._layerFactory,
                    this._userPointsStore!,
                    this._area.id,
                    visible,
                    () => this.onUserPointDeleted(),
                );
                this._userLayerView = userView;
                this._userGeoLayer = layer;
                this._layerViews.set(layer.id, userView);
                void userView.render().then(() => {
                    this.rebuildLayersWidget();
                });
            } else {
                existing.setVisible(visible);
            }
            break;
        }

        // Void layer: recreate when first made visible or when sibling visibility changes.
        for (const layer of this._area.layers) {
            if (layer.type !== "__void__") continue;

            const visible = this._state.isLayerVisible(layer.id, layer.isVisible());
            const existing = this._layerViews.get(layer.id) as VoidLayerView | undefined;
            const visibleSources = this._area.layers.filter(
                l => !l.isVirtual() && this._state.isLayerVisible(l.id, l.isVisible())
            );

            if (visible) {
                if (!existing || existing.sourcesChanged(visibleSources)) {
                    if (existing) {
                        existing.destroy();
                        this._layerViews.delete(layer.id);
                    }
                    const voidView = new VoidLayerView(
                        this._map,
                        layer,
                        visibleSources,
                        this._area.bbox,
                        new DefaultLeafletLayerFactory()
                    );
                    this._layerViews.set(layer.id, voidView);
                    void voidView.render();
                }
            } else if (existing) {
                existing.destroy();
                this._layerViews.delete(layer.id);
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
        getLogger().info("detail.zoom", { zoom, areaId: this._area.id, lat: center?.[0], lng: center?.[1] });
        if (Date.now() < this._zoomCooldownUntil) {
            getLogger().info("detail.zoom_cooldown", { zoom });
            return;
        }
        this.renderLayerViews();
    }

    private onMapMoveEnd(): void {
        this.saveViewport();
        if (this._hasImageOverlay || this._mode === "design") {
            return;
        }
        if (!this.isBboxVisible()) {
            const map = this._map;
            getLogger().info("detail.pan_to_summary", { areaId: this._area.id });
            if (map) {
                this._actions.openSummary(map.getCenter(), map.getZoom());
            } else {
                this._actions.openSummary();
            }
        }
    }

    private isBboxVisible(): boolean {
        const map = this._map;
        if (!map) return true;
        const [bboxWest, bboxSouth, bboxEast, bboxNorth] = this._area.bbox;
        const vp = map.getBounds();
        return bboxWest < vp.ne[1] && bboxEast > vp.sw[1] &&
               bboxSouth < vp.ne[0] && bboxNorth > vp.sw[0];
    }

    private relaxBoundsForOverlay(): void {
        const map = this._map;
        if (!map) {
            return;
        }
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

    private exportUserPoints(): void {
        const log = getLogger();
        log.info("user_layer.export.start", { areaId: this._area.id });
        try {
            // Prefer synchronous read (localStorage) so navigator.share() is called
            // within the same call stack as the user gesture. Fall back to the
            // last-rendered payload for gateway-backed stores that have no sync path.
            const payload = this._userPointsStore?.getPointsSync?.(this._area.id)
                ?? this._userLayerView?.lastPayload;
            if (!payload) {
                log.info("user_layer.export.empty", { areaId: this._area.id });
                return;
            }
            const collection = payload as { type: string; features: unknown[] };
            if (!Array.isArray(collection.features) || collection.features.length === 0) {
                log.info("user_layer.export.empty", { areaId: this._area.id });
                return;
            }
            const filename = `${this._area.id}-user-points.geojson`;
            const json = JSON.stringify(payload, null, 2);
            const file = new File([json], filename, { type: "application/geo+json" });
            const nav = navigator as Navigator & { share?: (data: object) => Promise<void>; canShare?: (data: object) => boolean };
            if (nav.share) {
                // navigator.share() must be called synchronously on the click call stack.
                // iOS Safari revokes user gesture activation at the first await boundary,
                // so this method is intentionally not async.
                log.info("user_layer.export.share", { areaId: this._area.id, count: collection.features.length });
                const shareData = nav.canShare?.({ files: [file] })
                    ? { files: [file], title: "My Trip" }
                    : { text: json, title: "My Trip" };
                nav.share(shareData).catch((err) => {
                    log.info("user_layer.export.share_failed", { error: String(err) });
                    this.downloadFile(file, filename);
                });
            } else {
                this.downloadFile(file, filename);
            }
            log.info("user_layer.export.end", { areaId: this._area.id, count: collection.features.length });
        } catch (err) {
            log.error("user_layer.export.error", err);
        }
    }

    private downloadFile(file: File, filename: string): void {
        const url = URL.createObjectURL(file);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
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

        const poiProperties = this.findNearestPoiProperties(latLng[0], latLng[1]);
        void store.addPoint(this._area.id, latLng[0], latLng[1], pressure, poiProperties);

        this._userLayerView.addMarker(latLng, pressure);
        log.info("user_layer.add_point.marker_placed", { featureCount: this._userLayerView.featureCount });

        if (wasEmpty) {
            this.rebuildLayersWidget();
        }

        log.info("user_layer.add_point.end", { lat: latLng[0], lng: latLng[1] });
    }

    private onUserPointDeleted(): void {
        if (this._userLayerView && this._userLayerView.featureCount === 0) {
            this.rebuildLayersWidget();
        }
    }

    private findNearestPoiProperties(lat: number, lon: number): Record<string, unknown> | undefined {
        const log = getLogger();
        const THRESHOLD = 0.0005; // ~55 m in latitude; naive Euclidean degrees

        const poiView = this._layerViews.get("__poi__");
        if (!(poiView instanceof PoiLayerView)) return undefined;

        let best: { dist: number; feature: PoiBakedFeature } | undefined;

        for (const f of poiView.features) {
            const dLat = f.latLng[0] - lat;
            const dLon = f.latLng[1] - lon;
            const dist = Math.sqrt(dLat * dLat + dLon * dLon);
            if (dist < THRESHOLD && (!best || dist < best.dist)) {
                best = { dist, feature: f };
            }
        }

        if (!best) return undefined;

        log.info("user_layer.poi_snap", { dist: best.dist, name: best.feature.name });
        return poiBakedToProperties(best.feature);
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
            true,
            () => this.onUserPointDeleted(),
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
            layer => this._state.isLayerVisible(layer.id, layer.isVisible()),
            hasUserPoints ? () => this.exportUserPoints() : undefined
        );
        layersWidget.render();
        this._layersWidget = layersWidget;
    }

    private onMapClick(latLng: [number, number]): void {
        const log = getLogger();
        if (this._emptySpacePopup) {
            log.info("map.empty_tap.dismiss");
            this.closeEmptySpacePopup();
            return;
        }
        log.info("map.empty_tap.start", { lat: latLng[0], lng: latLng[1] });
        if (!this._map) return;
        const el = this.buildEmptySpacePopupElement(latLng);
        this._emptySpacePopup = this._map.createPopup(latLng, el);
        log.info("map.empty_tap.end");
    }

    private closeEmptySpacePopup(): void {
        this._emptySpacePopup?.remove();
        this._emptySpacePopup = undefined;
    }

    private buildEmptySpacePopupElement(latLng: [number, number]): HTMLElement {
        const root = document.createElement("div");
        root.className = "poi-popup";

        const coords = document.createElement("div");
        coords.className = "poi-coords";
        coords.textContent = `${latLng[0].toFixed(4)}, ${latLng[1].toFixed(4)}`;
        root.appendChild(coords);

        root.appendChild(document.createElement("br"));
        root.appendChild(this.buildMapLink(
            `https://maps.google.com/?q=${latLng[0]},${latLng[1]}`,
            "Open in Google Maps"
        ));
        root.appendChild(document.createElement("br"));
        root.appendChild(this.buildMapLink(
            `https://maps.apple.com/?q=${latLng[0]},${latLng[1]}`,
            "Open in Apple Maps"
        ));
        root.appendChild(document.createElement("br"));
        root.appendChild(this.buildMapLink(
            `https://maps.google.com/maps?q=&layer=c&cbll=${latLng[0]},${latLng[1]}`,
            "Open in Street View"
        ));

        return root;
    }

    private buildMapLink(href: string, label: string): HTMLElement {
        const a = document.createElement("a");
        a.className = "poi-website";
        a.href = href;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = label;
        return a;
    }
}