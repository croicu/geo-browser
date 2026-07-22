import type { GeoArea } from "../../catalog/area";
import { GeoCatalog } from "../../catalog/catalog";
import type {
    ControllerActions,
    DestinationStore,
    GatewayService,
    GeoLocationService,
    LayerFactory,
    MapFactory,
    MapHandle,
    MapLayerFlyoutHandle,
    RectangleHandle,
    UserPointsStore,
    View,
    WidgetFactory,
    WidgetHandle,
} from "../../contracts";
import type { GeoState } from "../../state/geoState";
import { MapViewState } from "../../state/mapViewState";
import { AreaViewState } from "../../state/areaViewState";
import { Context } from "../../runtime/context";
import { getLogger } from "../../services";
import { LogCategory } from "../../logging";
import { AreaLifecycleTracker } from "./areaLifecycleTracker";
import type { BundleAction } from "./areaLifecycleTracker";
import { AreaMarkerView } from "./areaMarkerView";
import { AreaBaseLayerRenderer } from "./areaBaseLayerRenderer";
import { CurrentAreaBundle } from "../detail/currentAreaBundle";
import { DestinationWidget } from "../detail/destinationWidget";
import { GeoLocationWidget } from "../detail/geoLocationWidget";
import { DrawAreaInteraction } from "../summary/drawAreaInteraction";
import { DefaultLeafletLayerFactory, DefaultLeafletMapFactory, DefaultLeafletWidgetFactory } from "../detail/leafletFactories";

export interface MapViewOptions {
    mapFactory?: MapFactory;
    layerFactory?: LayerFactory;
    widgetFactory?: WidgetFactory;
    gateway?: GatewayService | null;
    geoLocation?: GeoLocationService | null;
    userPointsStore: UserPointsStore;
    destinationStore: DestinationStore;
}

// The unified view (tasks/layer_lifecycle.md) replacing SummaryView + DetailView.
// One shared Leaflet map, session-lifetime. Owns:
//  - AreaLifecycleTracker: the pure state machine driving everything below.
//  - One AreaMarkerView per catalog area (circle/outline), eagerly created.
//  - One AreaBaseLayerRenderer per currently-resident area (base data),
//    lazily created on first load, any number concurrent.
//  - 0-or-1 CurrentAreaBundle (virtual layers + toolbox + image overlay),
//    singleton.
//  - Session-level GeoLocationWidget/DestinationWidget and the design-mode
//    "new area" toolbar — previously per-area/per-mode, now global since
//    there's only one map. ImageOverlayWidget deliberately stays owned by
//    CurrentAreaBundle, not here — see that class's doc comment.
export class MapView implements View {
    private readonly _root: HTMLElement;
    private readonly _actions: ControllerActions;
    private readonly _geoState: GeoState;
    private readonly _catalog: GeoCatalog;
    private readonly _mapFactory: MapFactory;
    private readonly _layerFactory: LayerFactory;
    private readonly _widgetFactory: WidgetFactory;
    private readonly _gateway: GatewayService | null;
    private readonly _geoLocation: GeoLocationService | null;
    private readonly _userPointsStore: UserPointsStore;
    private readonly _destinationStore: DestinationStore;
    private readonly _viewportState: MapViewState;

    private readonly _tracker = new AreaLifecycleTracker();
    private readonly _markers = new Map<string, AreaMarkerView>();
    private readonly _baseLayers = new Map<string, AreaBaseLayerRenderer>();
    private readonly _areaStates = new Map<string, AreaViewState>();
    private readonly _pendingAreaLoads = new Map<string, Promise<void>>();

    private _element?: HTMLElement;
    private _mapRoot?: HTMLElement;
    private _map?: MapHandle;
    private _bundle?: CurrentAreaBundle;
    private _bundleBuildToken = 0;
    // Created once in render(), never destroyed until MapView.destroy() —
    // owns the tile layer's lifecycle (see MapLayerFlyoutHandle's doc
    // comment). CurrentAreaBundle swaps its layer list via setLayers()
    // rather than tearing down/rebuilding this control.
    private _flyout?: MapLayerFlyoutHandle;
    private _geoLocationWidget?: GeoLocationWidget;
    private _destinationWidget?: DestinationWidget;
    private _designToolbar?: WidgetHandle;
    private _drawInteraction?: DrawAreaInteraction;
    private _namePopup?: WidgetHandle;
    private _pendingRect?: RectangleHandle;
    private _buildOverlay?: HTMLElement;

    private _moveEndCleanup?: () => void;
    private _zoomCleanup?: () => void;

    constructor(
        root: HTMLElement,
        actions: ControllerActions,
        geoState: GeoState,
        catalog: GeoCatalog,
        state: MapViewState,
        options: MapViewOptions
    ) {
        this._root = root;
        this._actions = actions;
        this._geoState = geoState;
        this._catalog = catalog;
        this._viewportState = state;
        this._mapFactory = options.mapFactory ?? new DefaultLeafletMapFactory();
        this._layerFactory = options.layerFactory ?? new DefaultLeafletLayerFactory();
        this._widgetFactory = options.widgetFactory ?? new DefaultLeafletWidgetFactory();
        this._gateway = options.gateway ?? null;
        this._geoLocation = options.geoLocation ?? null;
        this._userPointsStore = options.userPointsStore;
        this._destinationStore = options.destinationStore;
    }

    render(): void {
        if (this._mapRoot) {
            return;
        }

        this._element = document.createElement("div");
        this._element.className = "map-view";

        this._mapRoot = document.createElement("div");
        this._mapRoot.className = "shared-map";

        this._element.appendChild(this._mapRoot);
        this._root.appendChild(this._element);

        const map = this._mapFactory.createMap(this._mapRoot, this._viewportState.center, this._viewportState.zoom);
        this._map = map;

        this._moveEndCleanup = map.onMoveEnd(() => this.handleViewportChange());
        this._zoomCleanup = map.onZoom(() => this.handleViewportChange());

        for (const area of this._catalog.areas) {
            this.createMarker(area);
        }

        this._flyout = this._widgetFactory.createMapLayerFlyout([], () => {});
        this._flyout.addTo(map);

        if (this._gateway) {
            this._designToolbar = this._widgetFactory.createDesignToolbar([
                { iconUrl: "/icons/design-new.svg", title: "New area", onClick: (setActive: (active: boolean) => void) => this.newArea(setActive) },
            ]);
            this._designToolbar.addTo(map);
        }

        if (this._geoLocation) {
            const geoWidget = new GeoLocationWidget(
                map,
                this._geoLocation,
                this._widgetFactory,
                this._layerFactory,
                undefined, // no per-area bounds gate — see Confirmed Behavior Changes in tasks/layer_lifecycle.md
                Context.Instance.debug,
                Context.Instance.headingService
            );
            geoWidget.render();
            this._geoLocationWidget = geoWidget;
        }

        const destinationWidget = new DestinationWidget(
            map,
            this._layerFactory,
            this._destinationStore,
            { onMarkerTapped: point => this._bundle?.onDestinationMarkerTapped(point) }
        );
        destinationWidget.render();
        this._destinationWidget = destinationWidget;

        if (this._geoLocationWidget) {
            this._geoLocationWidget.onPositionUpdate(latLng => this._destinationWidget?.onPosition(latLng));
        }

        this.handleViewportChange();
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

        this._bundle?.destroy();
        this._bundle = undefined;

        this._flyout?.remove();
        this._flyout = undefined;

        this._geoLocationWidget?.destroy();
        this._geoLocationWidget = undefined;

        this._destinationWidget?.destroy();
        this._destinationWidget = undefined;

        for (const marker of this._markers.values()) {
            marker.destroy();
        }
        this._markers.clear();

        for (const renderer of this._baseLayers.values()) {
            renderer.destroy();
        }
        this._baseLayers.clear();

        this._moveEndCleanup?.();
        this._moveEndCleanup = undefined;
        this._zoomCleanup?.();
        this._zoomCleanup = undefined;

        this._map?.remove();
        this._map = undefined;

        this._element?.remove();
        this._element = undefined;
        this._mapRoot = undefined;
    }

    // Called by Controller after a design-mode commitArea() succeeds — adds
    // the new area to both the catalog (already done by the caller) and this
    // view's tracker/markers, then pans/zooms to it so the viewport-driven
    // state machine picks it up as loaded/current on its own.
    addAreaAndFocus(areaId: string): void {
        const area = this._catalog.getArea(areaId);
        this.createMarker(area); // registers with the tracker too
        this.jumpToArea(area);
    }

    // Called by Controller (via the LayerSelectionWidget flyout round-trip) —
    // mutates+persists this area's visibility state, then re-syncs whichever
    // renderer(s) currently represent that area. Only ever called for the
    // current area in practice, since that's the only one with a flyout.
    setLayerVisible(areaId: string, layerId: string, visible: boolean): void {
        const area = this._catalog.getArea(areaId);
        const state = this.getOrLoadAreaState(area);
        state.setLayerVisible(layerId, visible);
        this._geoState.saveAreaViewState(state);

        this._baseLayers.get(areaId)?.sync();
        if (this._bundle?.areaId === areaId) {
            this._bundle.resync();
        }
    }

    private createMarker(area: GeoArea): void {
        this._tracker.addArea({ id: area.id, bbox: area.bbox, center: area.center });
        const marker = new AreaMarkerView(this._map!, area, this._layerFactory, {
            onSelected: selected => this.jumpToArea(selected),
        });
        this._markers.set(area.id, marker);
        marker.render(this._tracker.getRenderKind(area.id));
    }

    private jumpToArea(area: GeoArea): void {
        const map = this._map;
        if (!map) {
            return;
        }
        getLogger().info("map_view.jump_to_area.start", { areaId: area.id }, LogCategory.AreaLifecycle);
        const [west, south, east, north] = area.bbox;
        const zoom = map.getBoundsZoom([south, west], [north, east]);
        // Atomic — see MapHandle.setView's doc comment: separate setZoom()+
        // panTo() calls each fire their own zoomend/moveend synchronously
        // (animate: false throughout this app), producing a transient
        // (new zoom, stale center) viewport in between that could
        // spuriously trigger the empty-viewport fallback pin on the wrong
        // area for one recompute() pass.
        map.setView(area.center, zoom);
        // Real Leaflet fires zoomend/moveend from the call above, which already
        // routes to handleViewportChange() — call it directly too so this is
        // deterministic under test stubs (and a no-op change still recomputes).
        this.handleViewportChange();
        getLogger().info("map_view.jump_to_area.end", { areaId: area.id, zoom }, LogCategory.AreaLifecycle);
    }

    private handleViewportChange(): void {
        const map = this._map;
        if (!map) {
            return;
        }

        const viewport = { bounds: map.getBounds(), zoom: map.getZoom() };
        const transitions = this._tracker.recompute(viewport);

        if (transitions.toLoad.length || transitions.toShow.length || transitions.toHide.length
            || transitions.toDestroy.length || transitions.bundle.kind !== "none") {
            getLogger().info("map_view.viewport_change", {
                zoom: viewport.zoom,
                center: [(viewport.bounds.sw[0] + viewport.bounds.ne[0]) / 2, (viewport.bounds.sw[1] + viewport.bounds.ne[1]) / 2],
                toLoad: transitions.toLoad,
                toShow: transitions.toShow,
                toHide: transitions.toHide,
                toDestroy: transitions.toDestroy,
                pinnedAreaId: transitions.pinnedAreaId,
                bundle: transitions.bundle,
                currentAreaId: this._tracker.currentAreaId,
            }, LogCategory.AreaLifecycle);
        }

        for (const [areaId, kind] of transitions.renderKinds) {
            this._markers.get(areaId)?.update(kind);
        }

        for (const areaId of transitions.toLoad) {
            void this.loadBaseLayers(areaId);
        }
        for (const areaId of transitions.toShow) {
            this._baseLayers.get(areaId)?.show();
        }
        for (const areaId of transitions.toHide) {
            this._baseLayers.get(areaId)?.hide();
        }
        for (const areaId of transitions.toDestroy) {
            this.destroyBaseLayers(areaId);
        }

        this.applyBundleAction(transitions.bundle);
        this.saveViewport();
    }

    private async loadBaseLayers(areaId: string): Promise<void> {
        const map = this._map;
        if (!map) {
            return;
        }

        // Defensive: the tracker should only ever emit toLoad for an area
        // whose residency was "none", so a renderer shouldn't already exist
        // here. If one does (a tracker bug, or two toLoad emissions racing),
        // destroy it first rather than silently orphaning its Leaflet layers
        // — losing the only reference to them would leak a layer that no
        // future hide()/destroy() call could ever reach again.
        const existing = this._baseLayers.get(areaId);
        if (existing) {
            getLogger().warning("map_view.load_base_layers.already_resident", { areaId });
            existing.destroy();
        }

        const area = this._catalog.getArea(areaId);
        await this.ensureAreaLoaded(area);

        const state = this.getOrLoadAreaState(area);
        const renderer = new AreaBaseLayerRenderer(map, area, this._layerFactory, {
            isLayerVisible: (layerId, defaultVisible) => state.isLayerVisible(layerId, defaultVisible),
        });
        this._baseLayers.set(areaId, renderer);
        await renderer.render();
    }

    // Destroy (deferred, per Discard Lifecycle) — only ever called as a side
    // effect of a genuinely new area's toLoad in the same recompute() tick.
    // The cached AreaViewState (visibility prefs) is intentionally kept —
    // it's tiny and already persisted; only the expensive parsed GeoJSON
    // (owned by AreaBaseLayerRenderer/GeoLayer) is released.
    private destroyBaseLayers(areaId: string): void {
        this._baseLayers.get(areaId)?.destroy();
        this._baseLayers.delete(areaId);
    }

    // Dedupes concurrent GeoArea.load() calls for the same area — a brand-new
    // area can become both resident (toLoad) and current (bundle "build") in
    // the same recompute() tick, and GeoArea's own idempotency guard doesn't
    // help here since both calls start before either's fetch resolves.
    private ensureAreaLoaded(area: GeoArea): Promise<void> {
        let pending = this._pendingAreaLoads.get(area.id);
        if (!pending) {
            pending = area.load().finally(() => this._pendingAreaLoads.delete(area.id));
            this._pendingAreaLoads.set(area.id, pending);
        }
        return pending;
    }

    private getOrLoadAreaState(area: GeoArea): AreaViewState {
        let state = this._areaStates.get(area.id);
        if (state) {
            return state;
        }

        const saved = this._geoState.loadAreaViewState(area.id);
        const visibleLayers: Record<string, boolean> = {};
        for (const layer of area.layers) {
            visibleLayers[layer.id] = saved
                ? saved.isLayerVisible(layer.id, layer.isVisible())
                : layer.isVisible();
        }

        state = new AreaViewState({ areaId: area.id, visibleLayers });
        this._areaStates.set(area.id, state);
        return state;
    }

    private applyBundleAction(action: BundleAction): void {
        if (action.kind === "none") {
            return;
        }

        // Invalidates any in-flight buildBundle() from a previous tick —
        // every non-"none" action means the tracker's bundle state changed,
        // so a stale async build must not clobber it once it resolves.
        const token = ++this._bundleBuildToken;

        // hide/show/build all delegate the flyout's layer-list content to
        // CurrentAreaBundle itself (via LayerSelectionWidget.render()/
        // destroy(), both routed through the shared this._flyout) — nothing
        // here needs to touch the flyout directly, and must not: recreating
        // it would tear down and rebuild the tile layer, flashing the map.
        switch (action.kind) {
            case "hide":
            case "hide-skipped":
                this._bundle?.hide();
                return;
            case "show":
                this._bundle?.show();
                return;
            case "build":
                void this.buildBundle(action.areaId, token);
                return;
        }
    }

    // Async because the area may not have finished loading yet — a brand-new
    // area can become current in the very same recompute() tick that
    // triggers its base-layer toLoad. token guards against this resolving
    // after a newer bundle action has already superseded it.
    private async buildBundle(areaId: string, token: number): Promise<void> {
        this._bundle?.destroy();
        this._bundle = undefined;

        const area = this._catalog.getArea(areaId);
        await this.ensureAreaLoaded(area);

        const map = this._map;
        const flyout = this._flyout;
        if (!map || !flyout || token !== this._bundleBuildToken) {
            return;
        }

        const state = this.getOrLoadAreaState(area);
        const bundle = new CurrentAreaBundle(map, this._actions, area, state, {
            layerFactory: this._layerFactory,
            widgetFactory: this._widgetFactory,
            flyout,
            gateway: this._gateway,
            userPointsStore: this._userPointsStore,
            destinationStore: this._destinationStore,
            destinationWidget: this._destinationWidget!,
            getCurrentLatLng: () => this._geoLocationWidget?.getLastPosition(),
        });
        bundle.attach();
        this._bundle = bundle;
    }

    private saveViewport(): void {
        const map = this._map;
        if (!map) {
            return;
        }
        this._viewportState.center = map.getCenter();
        this._viewportState.zoom = map.getZoom();
        this._geoState.saveMapViewState(this._viewportState);
    }

    // Design-mode "draw new area" flow, ported unchanged from the old SummaryView —
    // always mounted (gateway-gated), independent of current-area status.
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
            { color: "#22c55e", weight: 2, fillColor: "#22c55e", fillOpacity: 0.12, interactive: false }
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
        if (!this._element) {
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
        this._element.appendChild(overlay);
        this._buildOverlay = overlay;
    }

    private onDiscard(): void {
        this._namePopup?.remove();
        this._namePopup = undefined;
        this._pendingRect?.remove();
        this._pendingRect = undefined;
        this._actions.discardArea();
    }
}
