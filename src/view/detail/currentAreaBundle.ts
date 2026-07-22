import type { GeoArea } from "../../catalog/area";
import type { ControllerActions, DestinationPoint, DestinationStore, GatewayService, LayerFactory, MapLayerFlyoutHandle, MapPopupHandle, UserPointsStore, WidgetFactory, WidgetHandle, MapHandle } from "../../contracts";
import type { AreaViewState } from "../../state/areaViewState";
import { getLogger } from "../../services";
import { DestinationWidget } from "./destinationWidget";
import { ImageOverlayWidget } from "./imageOverlayWidget";
import { LayerSelectionWidget } from "./layerSelectionWidget";
import { LayerView } from "./layerView";
import { DefaultLeafletLayerFactory, DefaultLeafletWidgetFactory } from "./leafletFactories";
import { PoiLayerView } from "./poiLayerView";
import type { PoiBakedFeature } from "./poiLayerView";
import { UserLayerView } from "./userLayerView";
import { VoidLayerView } from "./voidLayerView";
import { VoidVariantResolver } from "./voidVariantResolver";
import type { VoidVariant } from "./voidVariantResolver";
import { BboxWidget } from "../summary/bboxWidget";
import { ManifestEditorWidget } from "./manifestEditorWidget";
import { CodeMirrorJsonEditorFactory } from "./codeMirrorJsonEditorFactory";
import { SearchLayerView } from "./searchLayerView";
import { EmptyCalloutWidget } from "./emptyCalloutWidget";
import type { EmptyCalloutWidgetOptions } from "./emptyCalloutWidget";
import type { StarCount } from "./starRatingControl";
import { GeoLayer } from "../../catalog/layer";

const POI_MIN_ZOOM_DEFAULT = 16;

export interface CurrentAreaBundleOptions {
    layerFactory?: LayerFactory;
    widgetFactory?: WidgetFactory;
    gateway?: GatewayService | null;
    // Session-persistent flyout owned by MapView — see LayerSelectionWidget's
    // doc comment for why this must be injected rather than created here.
    flyout: MapLayerFlyoutHandle;
    userPointsStore: UserPointsStore;
    destinationStore: DestinationStore;
    destinationWidget: DestinationWidget;
    // GeoLocationWidget itself stays a MapView-owned session singleton (GPS
    // position doesn't depend on the current area); this is the one thing
    // ImageOverlayWidget needs from it. Defaults to "no position available".
    getCurrentLatLng?: () => [number, number] | undefined;
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

// The singleton "current area" virtual-layer bundle (tasks/layer_lifecycle.md):
// __poi__/__user__/__void__/__search__ views, the detail toolbox, the search
// control, and the image-overlay toolbar, for whichever one area is current.
// Renamed/slimmed from the old DetailView — map ownership, GeoLocationWidget/
// DestinationWidget construction, and viewport persistence all moved to
// MapView (session-level singletons / single shared viewport), since exactly
// one shared Leaflet map now exists instead of one per area. ImageOverlayWidget
// stays here (not hoisted to MapView) specifically so its paste/image toolbar
// only exists while an area is current — it briefly lived at the MapView
// level and showed up with no current area at all, which is wrong: the
// feature is inherently area-scoped (areaBbox gates its pin/lucky-detect
// checks), even though its session-level snapshot mechanism already lets it
// survive attach/hide/show/rebuild cycles unchanged. Base data layers
// (heatmap/circle) moved to AreaBaseLayerRenderer, which can have many
// concurrent instances (one per resident area) — this class handles only the
// parts that stay exclusive to the current area.
export class CurrentAreaBundle {
    private readonly _map: MapHandle;
    private readonly _actions: ControllerActions;
    private readonly _area: GeoArea;
    private readonly _state: AreaViewState;
    private readonly _layerFactory: LayerFactory;
    private readonly _widgetFactory: WidgetFactory;
    private readonly _flyout: MapLayerFlyoutHandle;
    private readonly _layerViews = new Map<string, LayerView>();

    private readonly _gateway: GatewayService | null;
    private readonly _userPointsStore: UserPointsStore;
    private readonly _destinationStore: DestinationStore;
    private readonly _destinationWidget: DestinationWidget;
    private readonly _getCurrentLatLng: () => [number, number] | undefined;

    private _attached = false;
    private _bboxWidget?: BboxWidget;
    private _manifestEditorWidget?: ManifestEditorWidget;
    private _layersWidget?: LayerSelectionWidget;
    private _userLayerView?: UserLayerView;
    private _userGeoLayer?: GeoLayer;
    private _searchWidget?: WidgetHandle;
    private _searchLayerView?: SearchLayerView;
    private _imageOverlayWidget?: ImageOverlayWidget;
    private _hasImageOverlay = false;
    private _emptySpacePopup?: MapPopupHandle;
    private _emptyCalloutLatLng?: [number, number];
    private _pendingBookmark = false;

    private _clickCleanup?: () => void;
    private _zoomCleanup?: () => void;

    constructor(
        map: MapHandle,
        actions: ControllerActions,
        area: GeoArea,
        state: AreaViewState,
        options: CurrentAreaBundleOptions
    ) {
        this._map = map;
        this._actions = actions;
        this._area = area;
        this._state = state;
        this._layerFactory = options.layerFactory ?? new DefaultLeafletLayerFactory();
        this._widgetFactory = options.widgetFactory ?? new DefaultLeafletWidgetFactory();
        this._flyout = options.flyout;
        this._gateway = options.gateway ?? null;
        this._userPointsStore = options.userPointsStore;
        this._destinationStore = options.destinationStore;
        this._destinationWidget = options.destinationWidget;
        this._getCurrentLatLng = options.getCurrentLatLng ?? (() => undefined);
    }

    get areaId(): string {
        return this._area.id;
    }

    // Builds every widget/listener for this area and attaches to the shared
    // map. Called once by MapView on the "build" bundle action.
    attach(): void {
        this._attached = true;

        const layersWidget = new LayerSelectionWidget(
            this._flyout,
            this._actions,
            this._area.id,
            this._area.layers.filter(l => l.type !== "__user__" && l.type !== "__search__"),
            layer => this._state.isLayerVisible(layer.id, layer.isVisible())
        );
        layersWidget.render();
        this._layersWidget = layersWidget;

        this._clickCleanup = this._map.onClick(latLng => this.onMapClick(latLng));
        this._zoomCleanup = this._map.onZoom(() => this.renderLayerViews());

        const searchLayer = this._area.layers.find(l => l.type === "__search__") ?? this.synthesizeSearchLayer();
        const searchLayerView = new SearchLayerView(
            this._map,
            this._layerFactory,
            searchLayer.style?.color ?? "#00007f",
            (latLng, displayName) => this.onSearchMarkerTap(latLng, displayName)
        );
        this._searchLayerView = searchLayerView;

        const searchWidget = this._widgetFactory.createSearchControl(
            this._area.bbox,
            (latLng, displayName) => this.onSearchResultSelected(latLng, displayName)
        );
        searchWidget.addTo(this._map);
        this._searchWidget = searchWidget;

        const imageOverlay = new ImageOverlayWidget(this._map, {
            areaBbox: this._area.bbox,
            onImageLoaded: () => { this._hasImageOverlay = true; },
            onImageRemoved: () => { this._hasImageOverlay = false; },
            getCurrentLatLng: () => this._getCurrentLatLng(),
        });
        imageOverlay.render();
        this._imageOverlayWidget = imageOverlay;

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

        this.renderLayerViews();
    }

    // Viewport-residency hide/show (Discard Lifecycle) — instant, keeps every
    // LayerView and its parsed GeoJSON fully resident. The lightweight
    // toolbox/search controls are cheap DOM widgets, safe to fully tear down
    // and rebuild on show() rather than threading hide/show through them too.
    hide(): void {
        if (!this._attached) {
            return;
        }
        this._attached = false;

        this.closeEmptySpacePopup();

        this._clickCleanup?.();
        this._clickCleanup = undefined;
        this._zoomCleanup?.();
        this._zoomCleanup = undefined;

        for (const layerView of this._layerViews.values()) {
            layerView.hide();
        }

        this._layersWidget?.destroy();
        this._layersWidget = undefined;
        this._searchWidget?.remove();
        this._searchWidget = undefined;

        // Saves its snapshot on destroy() (position/scale/opacity/lock/pin
        // state) and restores it automatically the next time it's rendered —
        // this hide/show cycle is exactly the same recreation the snapshot
        // mechanism was already built to survive.
        this._imageOverlayWidget?.destroy();
        this._imageOverlayWidget = undefined;
    }

    show(): void {
        if (this._attached) {
            return;
        }
        this._attached = true;

        this._clickCleanup = this._map.onClick(latLng => this.onMapClick(latLng));
        this._zoomCleanup = this._map.onZoom(() => this.renderLayerViews());

        for (const layerView of this._layerViews.values()) {
            layerView.show();
        }

        const searchWidget = this._widgetFactory.createSearchControl(
            this._area.bbox,
            (latLng, displayName) => this.onSearchResultSelected(latLng, displayName)
        );
        searchWidget.addTo(this._map);
        this._searchWidget = searchWidget;

        const imageOverlay = new ImageOverlayWidget(this._map, {
            areaBbox: this._area.bbox,
            onImageLoaded: () => { this._hasImageOverlay = true; },
            onImageRemoved: () => { this._hasImageOverlay = false; },
            getCurrentLatLng: () => this._getCurrentLatLng(),
        });
        imageOverlay.render();
        this._imageOverlayWidget = imageOverlay;

        this.rebuildLayersWidget();
        this.renderLayerViews(); // pick up any visibility changes made while hidden
    }

    // Full teardown — only called by MapView as a side effect of a different
    // area becoming current (the "build" bundle action's previousAreaId).
    destroy(): void {
        this.destroyLayerViews();

        this._bboxWidget?.destroy();
        this._bboxWidget = undefined;

        this._manifestEditorWidget?.destroy();
        this._manifestEditorWidget = undefined;

        this._searchLayerView?.destroy();
        this._searchLayerView = undefined;

        this._searchWidget?.remove();
        this._searchWidget = undefined;

        this._imageOverlayWidget?.destroy();
        this._imageOverlayWidget = undefined;

        this._clickCleanup?.();
        this._clickCleanup = undefined;

        this._zoomCleanup?.();
        this._zoomCleanup = undefined;

        this.closeEmptySpacePopup();

        this._layersWidget?.destroy();
        this._layersWidget = undefined;

        this._attached = false;
    }

    // Called by MapView after Controller has mutated+persisted this area's
    // layer-visibility state (the setLayerVisible round-trip) — re-evaluates
    // the virtual-layer set against the new state.
    resync(): void {
        this.renderLayerViews();
    }

    // Delegate target for MapView's session-level DestinationWidget: tapping
    // the destination pin reuses this area's normal point callout (keeping
    // star/bookmark/delete alongside the destination toggle) rather than a
    // stripped-down view.
    onDestinationMarkerTapped(point: DestinationPoint): void {
        const log = getLogger();
        log.info("destination.marker_tapped.start");
        const latLng: [number, number] = [point.lat, point.lng];
        const existing = this._userLayerView?.getPointAtLatLng(latLng[0], latLng[1]);
        if (existing) {
            this.onUserMarkerTapped(latLng, existing.stars);
        } else {
            this.openStarCallout(latLng);
        }
        log.info("destination.marker_tapped.end");
    }

    private renderLayerViews(): void {
        const zoom = this._map.getZoom();

        // Only __poi__ is handled by this loop — heatmap/circle base data is
        // AreaBaseLayerRenderer's concern, and __user__/__void__/__search__
        // each have their own dedicated handling below.
        for (const layer of this._area.layers) {
            if (layer.type !== "__poi__") {
                continue;
            }
            if (!layer.isVisible()) {
                continue;
            }

            const existing = this._layerViews.get(layer.id);
            const minZoom = layer.style?.minZoom;
            const visible = this._state.isLayerVisible(layer.id)
                && (minZoom === undefined || zoom >= minZoom);

            if (visible && !existing) {
                const layerView = new PoiLayerView(
                    this._map,
                    layer,
                    this._area.layers,
                    this._layerFactory,
                    {
                        getUserPoint: (lat, lon) => this.getUserPointAtLatLng(lat, lon),
                        onPoiStarSelected: (latLng, stars) => this.onPoiStarSelected(latLng, stars),
                        onPoiBookmarkToggled: latLng => this.onPoiBookmarkToggled(latLng),
                        onPopupOpening: () => this.closeEmptySpacePopup(),
                        isDestination: latLng => this.isCurrentDestination(latLng),
                        onPoiDestinationToggled: (latLng, label) => this.onPoiDestinationToggled(latLng, label),
                    }
                );
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
                    this._userPointsStore,
                    this._area.id,
                    visible,
                    (latLng) => this.onUserPointDeleted(latLng),
                    (latLng, stars) => this.onUserMarkerTapped(latLng, stars),
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

        this.renderVoidLayer();
        this.syncPoiSourceVisibility();
    }

    // Single synthesized "Mundane" toggle regardless of how many precomputed __void__*
    // variants exist in the manifest. Toggle on/off state is always keyed by the bare
    // "__void__" id; VoidVariantResolver picks which variant actually renders based on
    // which non-virtual sibling layers are currently visible. See
    // docs/LAYERS.md for the full contract.
    private renderVoidLayer(): void {
        const voidLayers = this._area.layers.filter(l => l.type === "__void__");
        const bareVoid = voidLayers.find(l => l.id === VoidVariantResolver.BARE_ID);
        if (!bareVoid) return;

        const visible = this._state.isLayerVisible(bareVoid.id, bareVoid.isVisible());
        const existing = this._layerViews.get(VoidVariantResolver.BARE_ID) as VoidLayerView | undefined;

        if (!visible) {
            if (existing) {
                existing.destroy();
                this._layerViews.delete(VoidVariantResolver.BARE_ID);
            }
            return;
        }

        const sourceLayers = this._area.layers.filter(l => l.isSourceData());
        const allSourceIds = sourceLayers.map(l => l.id);
        const visibleIds = sourceLayers
            .filter(l => this._state.isLayerVisible(l.id, l.isVisible()))
            .map(l => l.id);

        const variants: VoidVariant[] = [];
        for (const layer of voidLayers) {
            const effectiveIds = VoidVariantResolver.parseEffectiveIds(layer.id, allSourceIds);
            if (effectiveIds) {
                variants.push({ id: layer.id, effectiveIds });
            }
        }

        const resolvedId = VoidVariantResolver.resolve(variants, visibleIds);
        const resolvedLayer = voidLayers.find(l => l.id === resolvedId);

        if (resolvedLayer && resolvedLayer.id !== existing?.layerId) {
            existing?.destroy();
            const voidView = new VoidLayerView(this._map, resolvedLayer, this._layerFactory);
            this._layerViews.set(VoidVariantResolver.BARE_ID, voidView);
            void voidView.render();
            this.rebuildLayersWidget();
        }
    }

    private syncPoiSourceVisibility(): void {
        const poiView = this._layerViews.get("__poi__");
        if (!(poiView instanceof PoiLayerView)) {
            return;
        }
        for (const layer of this._area.layers) {
            if (layer.isSourceData()) {
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

    private exportUserPoints(): void {
        const log = getLogger();
        log.info("user_layer.export.start", { areaId: this._area.id });
        try {
            // Prefer synchronous read (localStorage) so navigator.share() is called
            // within the same call stack as the user gesture. Fall back to the
            // last-rendered payload for gateway-backed stores that have no sync path.
            const payload = this._userPointsStore.getPointsSync?.(this._area.id)
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

        if (!this._userLayerView) return;

        const store = this._userPointsStore;

        const wasEmpty = this._userLayerView.featureCount === 0;
        const poiProperties = this.findNearestPoiProperties(latLng[0], latLng[1]);

        log.info("user_layer.store.add_start", { areaId: this._area.id, lat: latLng[0], lng: latLng[1] });
        void store.addPoint(this._area.id, latLng[0], latLng[1], pressure, poiProperties);
        this._userLayerView.addMarker(latLng, pressure);
        log.info("user_layer.add_point.end", { featureCount: this._userLayerView.featureCount });

        if (wasEmpty) {
            this.rebuildLayersWidget();
        }
    }

    private onUserPointDeleted(_latLng: [number, number]): void {
        if (this._userLayerView && this._userLayerView.featureCount === 0) {
            this.rebuildLayersWidget();
        }
    }

    private onSearchResultSelected(latLng: [number, number], displayName: string): void {
        const log = getLogger();
        log.info("search.result_selected.start", { displayName });
        this._map.panTo(latLng);
        this._searchLayerView?.setResult(latLng, displayName);
        log.info("search.result_selected.end", { displayName });
    }

    private onSearchMarkerTap(latLng: [number, number], _displayName: string): void {
        const log = getLogger();
        log.info("search.marker_tap.start", { lat: latLng[0], lng: latLng[1] });
        this._searchLayerView?.clear();
        this.onUserPoint(latLng, 0.5);
        log.info("search.marker_tap.end");
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

    private synthesizeSearchLayer(): GeoLayer {
        getLogger().warning("search_layer.synthesize", {
            reason: "__search__ layer missing from manifest — synthesizing defaults",
            areaId: this._area.id,
        });
        return new GeoLayer({
            id: "__search__",
            name: "Search Results",
            type: "__search__",
            url: null,
            visible: false,
            style: { opacity: 0.3, color: "#00007f" },
        });
    }

    private async synthesizeUserLayerView(): Promise<void> {
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
            this._layerFactory,
            this._userPointsStore,
            this._area.id,
            true,
            (latLng) => this.onUserPointDeleted(latLng),
            (latLng, stars) => this.onUserMarkerTapped(latLng, stars),
        );

        this._userLayerView = userView;
        this._userGeoLayer = syntheticLayer;
        this._layerViews.set("__user__", userView);
        await userView.render();
    }

    private rebuildLayersWidget(): void {
        const hasUserPoints = this._userLayerView !== undefined && this._userLayerView.featureCount > 0;

        const sourceLayers = [...this._area.layers];
        const manifestHasUser = sourceLayers.some(l => l.type === "__user__");
        if (!manifestHasUser && hasUserPoints && this._userGeoLayer) {
            sourceLayers.push(this._userGeoLayer);
        }

        const visibleLayers = this.buildFlyoutLayers(sourceLayers, hasUserPoints);

        // render() just calls flyout.setLayers() — overwrites the panel
        // content directly, no need to destroy() the previous widget first.
        const layersWidget = new LayerSelectionWidget(
            this._flyout,
            this._actions,
            this._area.id,
            visibleLayers,
            layer => this._state.isLayerVisible(layer.id, layer.isVisible()),
            hasUserPoints ? () => this.exportUserPoints() : undefined
        );
        layersWidget.render();
        this._layersWidget = layersWidget;
    }

    private buildFlyoutLayers(sourceLayers: readonly GeoLayer[], hasUserPoints: boolean): GeoLayer[] {
        const result: GeoLayer[] = [];

        for (const layer of sourceLayers) {
            if (layer.type === "__user__") {
                if (hasUserPoints) result.push(layer);
                continue;
            }
            if (layer.type === "__poi__") {
                if (layer.isVisible()) result.push(layer);
                continue;
            }
            if (layer.type === "__search__") {
                continue;
            }
            if (layer.type === "__void__") {
                if (layer.id !== VoidVariantResolver.BARE_ID) continue;
                result.push(this.buildVoidFlyoutLayer(layer, sourceLayers));
                continue;
            }
            result.push(layer);
        }

        return result;
    }

    // The flyout always shows the bare "__void__" id (so the toggle's on/off state and
    // click callback stay keyed correctly), but its displayed name/style should follow
    // whichever precomputed variant is currently active (e.g. "No Restaurants, Food").
    private buildVoidFlyoutLayer(bareVoid: GeoLayer, sourceLayers: readonly GeoLayer[]): GeoLayer {
        const activeVoidView = this._layerViews.get(VoidVariantResolver.BARE_ID);
        const activeId = activeVoidView instanceof VoidLayerView ? activeVoidView.layerId : undefined;
        const active = activeId ? sourceLayers.find(l => l.id === activeId) : undefined;

        if (!active || active.id === bareVoid.id) {
            return bareVoid;
        }

        return new GeoLayer({
            id: bareVoid.id,
            name: active.name ?? bareVoid.name,
            type: "__void__",
            url: bareVoid.url,
            visible: bareVoid.isVisible(),
            style: active.style ?? bareVoid.style,
        });
    }

    private onMapClick(latLng: [number, number]): void {
        const log = getLogger();
        const poiView = this._layerViews.get("__poi__");
        if (poiView instanceof PoiLayerView && poiView.hasActivePopup) {
            // PoiLayerView's own map click handler (registered after this one)
            // closes its popup; this click should only dismiss it, not also
            // open the user-point callout underneath.
            log.info("map.poi_popup.dismiss_only");
            return;
        }
        if (this._emptySpacePopup) {
            log.info("map.empty_tap.dismiss");
            this.closeEmptySpacePopup();
            return;
        }
        const zoom = this._map.getZoom();
        const minZoom = this.poiMinZoom();
        if (zoom < minZoom) {
            log.info("map.empty_tap.noop", { zoom, minZoom });
            return;
        }
        log.info("map.empty_tap.start", { lat: latLng[0], lng: latLng[1] });
        this.openStarCallout(latLng);
        log.info("map.empty_tap.end");
    }

    private poiMinZoom(): number {
        const poiLayer = this._area.layers.find(l => l.type === "__poi__");
        return poiLayer?.style?.minZoom ?? POI_MIN_ZOOM_DEFAULT;
    }

    private openStarCallout(latLng: [number, number]): void {
        this.closeEmptySpacePopup();
        const isDest = this.isCurrentDestination(latLng);
        const widget = new EmptyCalloutWidget({
            latLng,
            showCoords: true,
            showMapLinks: true,
            onStarSelected: stars => this.onEmptyStarSelected(stars),
            onBookmarkToggled: bookmarked => this.onCalloutBookmarkToggled(latLng, bookmarked),
            isDestination: isDest,
            onDestinationToggled: () => this.onEmptyDestinationToggled(latLng, isDest),
        });
        this._emptyCalloutLatLng = latLng;
        this._emptySpacePopup = this._map.createPopup(latLng, widget.render());
    }

    private closeEmptySpacePopup(): void {
        if (this._pendingBookmark && this._emptyCalloutLatLng) {
            // Empty-space callout dismissed with bookmark toggled on — create the bookmarked point.
            void this.doAddBookmarkedUserPoint(this._emptyCalloutLatLng);
            this.maybeClearDestination(this._emptyCalloutLatLng);
        }
        this._pendingBookmark = false;
        this._emptySpacePopup?.remove();
        this._emptySpacePopup = undefined;
        this._emptyCalloutLatLng = undefined;
    }

    private onEmptyStarSelected(stars: StarCount): void {
        const log = getLogger();
        log.info("user_layer.star_selected.start", { stars });
        this._pendingBookmark = false;
        if (this._emptyCalloutLatLng) {
            void this.doAddStarredUserPoint(this._emptyCalloutLatLng, stars);
            this.maybeClearDestination(this._emptyCalloutLatLng);
        }
        this.closeEmptySpacePopup();
        log.info("user_layer.star_selected.end", { stars });
    }

    private async doAddStarredUserPoint(latLng: [number, number], stars: StarCount): Promise<void> {
        const log = getLogger();
        log.info("user_layer.add_starred_point.start", { lat: latLng[0], lng: latLng[1], stars });

        if (!this._userLayerView) {
            await this.synthesizeUserLayerView();
        }
        if (!this._userLayerView) return;
        const store = this._userPointsStore;

        const wasEmpty = this._userLayerView.featureCount === 0;
        const poiProperties = this.findNearestPoiProperties(latLng[0], latLng[1]);

        log.info("user_layer.store.add_starred_start", { areaId: this._area.id, lat: latLng[0], lng: latLng[1], stars });
        void store.addPoint(this._area.id, latLng[0], latLng[1], 0.5, { ...poiProperties, stars });
        this._userLayerView.addMarker(latLng, 0.5, stars);

        if (wasEmpty) this.rebuildLayersWidget();
        log.info("user_layer.add_starred_point.end", { stars });
    }

    private onPoiStarSelected(latLng: [number, number], stars: StarCount): void {
        const log = getLogger();
        log.info("poi.star_selected.start", { lat: latLng[0], lng: latLng[1], stars });
        const existing = this._userLayerView?.getPointAtLatLng(latLng[0], latLng[1]);
        if (existing) {
            void this.doRateExistingUserPoint(latLng, stars, existing.bookmarked ?? false);
        } else {
            void this.doAddStarredUserPoint(latLng, stars);
        }
        this.maybeClearDestination(latLng);
        log.info("poi.star_selected.end", { stars });
    }

    private onPoiBookmarkToggled(latLng: [number, number]): void {
        const log = getLogger();
        log.info("poi.bookmark_toggled.start", { lat: latLng[0], lng: latLng[1] });
        const existing = this._userLayerView?.getPointAtLatLng(latLng[0], latLng[1]);
        if (existing?.bookmarked) {
            this._userLayerView?.removePoint(latLng);
        } else if (!existing) {
            void this.doAddBookmarkedUserPoint(latLng);
        }
        this.maybeClearDestination(latLng);
        log.info("poi.bookmark_toggled.end");
    }

    private getUserPointAtLatLng(lat: number, lon: number): { stars?: StarCount; bookmarked?: boolean } | null {
        if (!this._userLayerView) return null;
        return this._userLayerView.getPointAtLatLng(lat, lon);
    }

    private isCurrentDestination(latLng: [number, number]): boolean {
        const dest = this._destinationStore.get();
        if (!dest) return false;
        return Math.abs(dest.lat - latLng[0]) < 1e-8 && Math.abs(dest.lng - latLng[1]) < 1e-8;
    }

    // Rating or bookmarking a point clears its destination status — once you've acted on it
    // as a saved place, it's no longer just a pending nav target.
    private maybeClearDestination(latLng: [number, number]): void {
        if (this.isCurrentDestination(latLng)) {
            this.doRemoveDestination();
        }
    }

    private doSetDestination(latLng: [number, number], label?: string): void {
        const log = getLogger();
        log.info("destination.set.start", { lat: latLng[0], lng: latLng[1] });
        const point: DestinationPoint = { lat: latLng[0], lng: latLng[1], label: label ?? null };
        this._destinationStore.set(point);
        this._destinationWidget.setDestination(point);
        log.info("destination.set.end");
    }

    private doRemoveDestination(): void {
        const log = getLogger();
        log.info("destination.remove.start");
        this._destinationStore.clear();
        this._destinationWidget.setDestination(null);
        log.info("destination.remove.end");
    }

    private onPoiDestinationToggled(latLng: [number, number], label: string | undefined): void {
        if (this.isCurrentDestination(latLng)) {
            this.doRemoveDestination();
        } else {
            this.doSetDestination(latLng, label);
        }
    }

    private onEmptyDestinationToggled(latLng: [number, number], wasDestination: boolean): void {
        if (wasDestination) {
            this.doRemoveDestination();
        } else {
            this.doSetDestination(latLng);
        }
        this.closeEmptySpacePopup();
    }

    private onUserMarkerTapped(latLng: [number, number], stars?: StarCount): void {
        const log = getLogger();
        log.info("user_layer.marker_tapped.start", { lat: latLng[0], lng: latLng[1], stars });
        this.closeEmptySpacePopup();
        const point = this._userLayerView?.getPointAtLatLng(latLng[0], latLng[1]);
        const isDest = this.isCurrentDestination(latLng);

        const opts: EmptyCalloutWidgetOptions = {
            latLng,
            showCoords: true,
            showMapLinks: true,
            isDestination: isDest,
            onDeleteRequested: () => {
                log.info("user_layer.marker_delete.start", { lat: latLng[0], lng: latLng[1] });
                this._userLayerView?.removePoint(latLng);
                this.closeEmptySpacePopup();
                log.info("user_layer.marker_delete.end");
            },
            onDestinationToggled: () => this.onEmptyDestinationToggled(latLng, isDest),
        };

        if (stars !== undefined) {
            opts.existingStars = stars;
        } else {
            opts.onStarSelected = selectedStars => {
                log.info("user_layer.marker_rate.start", { lat: latLng[0], lng: latLng[1], stars: selectedStars });
                void this.doRateExistingUserPoint(latLng, selectedStars, point?.bookmarked ?? false);
                this.maybeClearDestination(latLng);
                this.closeEmptySpacePopup();
                log.info("user_layer.marker_rate.end");
            };
        }

        const widget = new EmptyCalloutWidget(opts);
        this._emptyCalloutLatLng = latLng;
        this._emptySpacePopup = this._map.createPopup(latLng, widget.render());
        log.info("user_layer.marker_tapped.end");
    }

    private async doRateExistingUserPoint(latLng: [number, number], stars: StarCount, wasBookmarked: boolean): Promise<void> {
        const log = getLogger();
        log.info("user_layer.rate_existing.start", { lat: latLng[0], lng: latLng[1], stars, wasBookmarked });
        const store = this._userPointsStore;
        void store.removePoint(this._area.id, latLng[1], latLng[0]);
        void store.addPoint(this._area.id, latLng[0], latLng[1], 0.5, { stars });
        if (wasBookmarked) {
            this._userLayerView?.addMarkerBookmark(latLng, false);
        }
        this._userLayerView?.addMarkerRing(latLng, stars);
        log.info("user_layer.rate_existing.end", { stars });
    }

    private onCalloutBookmarkToggled(latLng: [number, number], bookmarked: boolean): void {
        const log = getLogger();
        log.info("user_layer.callout_bookmark_toggled.start", { lat: latLng[0], lng: latLng[1], bookmarked });
        this._pendingBookmark = bookmarked;
        log.info("user_layer.callout_bookmark_toggled.end", { bookmarked });
        this.closeEmptySpacePopup();
    }

    private async doAddBookmarkedUserPoint(latLng: [number, number]): Promise<void> {
        const log = getLogger();
        log.info("user_layer.add_bookmarked_point.start", { lat: latLng[0], lng: latLng[1] });

        if (!this._userLayerView) {
            await this.synthesizeUserLayerView();
        }
        if (!this._userLayerView) return;
        const store = this._userPointsStore;

        const wasEmpty = this._userLayerView.featureCount === 0;
        const poiProperties = this.findNearestPoiProperties(latLng[0], latLng[1]);

        log.info("user_layer.store.add_bookmarked_start", { areaId: this._area.id, lat: latLng[0], lng: latLng[1] });
        void store.addPoint(this._area.id, latLng[0], latLng[1], 0.5, { ...poiProperties, bookmarked: true });
        this._userLayerView.addMarker(latLng, 0.5, undefined, true);

        if (wasEmpty) this.rebuildLayersWidget();
        log.info("user_layer.add_bookmarked_point.end");
    }
}
