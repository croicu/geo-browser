// view/detail/leafletFactories.ts
import L from "leaflet";
import "leaflet.heat"
import { type TileProvider, osmTileProvider, cartoTileProvider, getActiveTileProvider, setActiveTileProvider } from "../../maps/tileProvider";

declare module "leaflet" {
    export type HeatLatLngTuple = [number, number, number];

    export interface HeatLayerOptions {
        radius?: number;
        blur?: number;
        max?: number;
        maxZoom?: number;
        minOpacity?: number;
        gradient?: Record<number, string>;
    }

    export interface HeatLayer extends Layer {
        setLatLngs(latlngs: HeatLatLngTuple[]): this;
        addLatLng(latlng: HeatLatLngTuple): this;
        setOptions(options: HeatLayerOptions): this;
        redraw(): this;
    }

    export function heatLayer(
        latlngs: HeatLatLngTuple[],
        options?: HeatLayerOptions
    ): HeatLayer;
}

import type {
    AccuracyRingHandle,
    CircleMarkerOptions,
    ControlPosition,
    DesignToolbarButton,
    DestinationMarkerHandle,
    DraggableMarkerHandle,
    GeoLocationWidgetHandle,
    LayerFactory,
    MapFactory,
    MapPopupHandle,
    PositionMarkerHandle,
    PolygonOptions,
    RectangleHandle,
    RectangleOptions,
    WidgetFactory,
    MapHandle,
    MapLayerHandle,
    WidgetHandle,
    LayerSelectionWidgetItem,
    HeatLayerOptions,
    ClickableMapLayerHandle,
    MapLayerFlyoutHandle,
    TileCacheStatus,
    TileCacheWidgetHandle,
} from "../../contracts";

import type { HeatPoint } from "../../protocols";
import { getLogger } from "../../services";
import { LogCategory } from "../../logging";
import { queryNominatim, type NominatimResult } from "../../maps/nominatim";
import { TileFetcher } from "../../tiles/tileFetcher";
import { CacheApiTileCacheStore } from "../../runtime/cacheApiTileCacheStore";
import { buildTileUrl, type TileCoord } from "../../tiles/tileUrl";
import { shouldUseCachingLayer, shouldRebuildTileLayer } from "../../tiles/tileCacheDecision";
import { tileToBounds } from "../../tiles/tileBounds";
import { computeParentTileCrop, type ParentTileCrop } from "../../tiles/tileParent";
import { AreaRenderClassifier } from "../map/areaRenderClassifier";
import { isOnline, onNetworkStatusChange } from "../../runtime/networkStatus";
import { Context } from "../../runtime/context";

class LeafletMapHandle implements MapHandle {
    private readonly _map: L.Map;

    constructor(map: L.Map) {
        this._map = map;
    }

    remove(): void {
        // Cancel Leaflet's pending async timers before removing the map.
        // Both can fire after map.remove() deletes the map pane and crash
        // reading _leaflet_pos from the deleted element.
        //
        // _animatingZoomTimer: set by _animateZoom (~300ms), fires _onZoomTransitionEnd.
        //   Triggered when a second scroll event arrives while a zoom animation is
        //   already running — the second zoom fires zoomend synchronously (no new
        //   animation started), our handler navigates away, but this older timer
        //   still fires on the now-dead map.
        //
        // scrollWheelZoom._timer: the 40ms debounce before _performZoom fires.
        clearTimeout((this._map as unknown as { _animatingZoomTimer?: number })._animatingZoomTimer);
        clearTimeout((this._map.scrollWheelZoom as unknown as { _timer?: number })._timer);
        this._map.remove();
    }

    getCenter(): [number, number] {
        const c = this._map.getCenter();
        return [c.lat, c.lng];
    }

    getZoom(): number {
        return this._map.getZoom();
    }

    getContainer(): HTMLElement {
        return this._map.getContainer();
    }

    panTo(latLng: [number, number]): void {
        this._map.panTo(latLng);
    }

    onZoom(handler: (zoom: number) => void): () => void {
        const listener = () => handler(this._map.getZoom());
        this._map.on("zoomend", listener);
        return () => this._map.off("zoomend", listener);
    }

    onZoomAnim(handler: (center: [number, number], zoom: number) => void): () => void {
        type ZoomAnimEvent = { center: L.LatLng; zoom: number };
        const listener = (e: ZoomAnimEvent) => handler([e.center.lat, e.center.lng], e.zoom);
        const fn = listener as unknown as L.LeafletEventHandlerFn;
        this._map.on("zoomanim", fn);
        return () => this._map.off("zoomanim", fn);
    }

    onMove(handler: () => void): () => void {
        this._map.on("move", handler);
        return () => this._map.off("move", handler);
    }

    project(latLng: [number, number], zoom: number): [number, number] {
        const p = this._map.project(L.latLng(latLng[0], latLng[1]), zoom);
        return [p.x, p.y];
    }

    onMoveEnd(handler: () => void): () => void {
        this._map.on("moveend", handler);
        return () => this._map.off("moveend", handler);
    }

    latLngToContainerPoint(latLng: [number, number]): [number, number] {
        const p = this._map.latLngToContainerPoint(L.latLng(latLng[0], latLng[1]));
        return [p.x, p.y];
    }

    containerPointToLatLng(point: [number, number]): [number, number] {
        const ll = this._map.containerPointToLatLng(L.point(point[0], point[1]));
        return [ll.lat, ll.lng];
    }

    onClick(handler: (latLng: [number, number]) => void): () => void {
        const listener = (e: L.LeafletMouseEvent) => handler([e.latlng.lat, e.latlng.lng]);
        this._map.on("click", listener);
        return () => this._map.off("click", listener);
    }

    setCursor(cursor: string): void {
        this._map.getContainer().style.cursor = cursor;
    }

    onMouseDown(handler: (latLng: [number, number]) => void): () => void {
        const listener = (e: L.LeafletMouseEvent) => handler([e.latlng.lat, e.latlng.lng]);
        this._map.on("mousedown", listener);
        return () => this._map.off("mousedown", listener);
    }

    onMouseMove(handler: (latLng: [number, number]) => void): () => void {
        const listener = (e: L.LeafletMouseEvent) => handler([e.latlng.lat, e.latlng.lng]);
        this._map.on("mousemove", listener);
        return () => this._map.off("mousemove", listener);
    }

    onMouseUp(handler: (latLng: [number, number]) => void): () => void {
        const listener = (e: L.LeafletMouseEvent) => handler([e.latlng.lat, e.latlng.lng]);
        this._map.on("mouseup", listener);
        return () => this._map.off("mouseup", listener);
    }

    disableDrag(): void {
        this._map.dragging.disable();
    }

    enableDrag(): void {
        this._map.dragging.enable();
    }

    setMaxBounds(sw: [number, number], ne: [number, number]): void {
        this._map.setMaxBounds([sw, ne]);
    }

    getBoundsZoom(sw: [number, number], ne: [number, number]): number {
        return this._map.getBoundsZoom([sw, ne]);
    }

    setZoom(zoom: number): void {
        this._map.setZoom(zoom, { animate: false });
    }

    setView(center: [number, number], zoom: number): void {
        this._map.setView(center, zoom, { animate: false });
    }

    getBounds(): { sw: [number, number]; ne: [number, number] } {
        const b = this._map.getBounds();
        return {
            sw: [b.getSouth(), b.getWest()],
            ne: [b.getNorth(), b.getEast()],
        };
    }

    addControl(position: ControlPosition, element: HTMLElement): WidgetHandle {
        const control = new (class extends L.Control {
            onAdd(): HTMLElement { return element; }
        })({ position });
        control.addTo(this._map);
        return new LeafletWidgetHandle(control);
    }

    createPopup(latLng: [number, number], element: HTMLElement): MapPopupHandle {
        const popup = L.popup({ closeButton: false, autoClose: false, closeOnClick: false })
            .setLatLng(latLng)
            .setContent(element)
            .openOn(this._map);

        return {
            update(el: HTMLElement): void {
                popup.setContent(el);
                popup.update();
            },
            remove(): void {
                popup.remove();
            },
        };
    }

    createPane(name: string): HTMLElement {
        return this._map.getPane(name) ?? this._map.createPane(name);
    }

    unwrap(): L.Map {
        return this._map;
    }
}

function unwrapMap(handle: MapHandle): L.Map {
    if (handle instanceof LeafletMapHandle) {
        return handle.unwrap();
    }
    return handle as unknown as L.Map;
}

class LeafletMapLayerHandle implements MapLayerHandle {
    private readonly _layer: L.Layer;

    constructor(layer: L.Layer) {
        this._layer = layer;
    }

    addTo(map: MapHandle): void {
        this._layer.addTo(unwrapMap(map));
    }

    remove(): void {
        this._layer.remove();
    }
}

class LeafletHeatLayerHandle extends LeafletMapLayerHandle {
    private readonly _heatLayer: L.HeatLayer;
    private readonly _opacity: number;
    private _leafletMap?: L.Map;
    private _zoomEndListener?: () => void;

    constructor(layer: L.HeatLayer, opacity: number) {
        super(layer);
        this._heatLayer = layer;
        this._opacity = opacity;
    }

    addTo(map: MapHandle): void {
        super.addTo(map);
        this.applyOpacity();

        const leafletMap = unwrapMap(map);
        this._leafletMap = leafletMap;
        this._zoomEndListener = () => {
            this._heatLayer.redraw();
            this.applyOpacity();
        };
        leafletMap.on("zoomend", this._zoomEndListener);
    }

    remove(): void {
        if (this._leafletMap && this._zoomEndListener) {
            this._leafletMap.off("zoomend", this._zoomEndListener);
        }
        this._leafletMap = undefined;
        this._zoomEndListener = undefined;

        // leaflet.heat's redraw() schedules a requestAnimFrame(this._redraw)
        // but never cancels it in onRemove() — with several areas' heat
        // layers now able to share one map, a zoomend that hides/destroys
        // this layer can fire *after* redraw() already queued a frame for
        // this same event. When that frame later runs, Leaflet's own
        // Layer.remove() has already nulled the heat layer's _map, so
        // _redraw()'s this._map.getSize() throws. Cancel defensively.
        const pendingFrame = (this._heatLayer as unknown as { _frame?: number })._frame;
        if (pendingFrame !== undefined) {
            L.Util.cancelAnimFrame(pendingFrame);
        }

        super.remove();
    }

    private applyOpacity(): void {
        const canvas = (this._heatLayer as unknown as { _canvas?: HTMLCanvasElement })._canvas;
        if (canvas) {
            canvas.style.opacity = String(this._opacity);
        }
    }
}

class LeafletRectangleHandle extends LeafletMapLayerHandle implements RectangleHandle {
    private readonly _rect: L.Rectangle;

    constructor(rect: L.Rectangle) {
        super(rect);
        this._rect = rect;
    }

    setBounds(bounds: [[number, number], [number, number]]): void {
        this._rect.setBounds(bounds);
    }

    onClick(handler: () => void): void {
        this._rect.on("click", () => handler());
    }
}

class LeafletAccuracyRingHandle extends LeafletMapLayerHandle implements AccuracyRingHandle {
    private readonly _circle: L.Circle;

    constructor(circle: L.Circle) {
        super(circle);
        this._circle = circle;
    }

    setLatLng(latLng: [number, number]): void {
        this._circle.setLatLng(latLng);
    }

    setRadius(radiusMeters: number): void {
        this._circle.setRadius(radiusMeters);
    }
}

class LeafletPositionMarkerHandle implements PositionMarkerHandle {
    private readonly _marker: L.Marker;

    constructor(marker: L.Marker) {
        this._marker = marker;
    }

    addTo(map: MapHandle): void {
        this._marker.addTo(unwrapMap(map));
    }

    remove(): void {
        this._marker.remove();
    }

    setLatLng(latLng: [number, number]): void {
        this._marker.setLatLng(latLng);
    }

    setHeading(heading: number | null): void {
        const cone = this._marker.getElement()?.querySelector<SVGGElement>(".heading-cone");
        if (!cone) return;
        if (heading === null) {
            cone.style.visibility = "hidden";
        } else {
            cone.style.visibility = "visible";
            cone.style.transform = `rotate(${heading}deg)`;
        }
    }
}

class LeafletDestinationMarkerHandle extends LeafletMapLayerHandle implements DestinationMarkerHandle {
    private readonly _marker: L.Marker;

    constructor(marker: L.Marker) {
        super(marker);
        this._marker = marker;
    }

    onClick(handler: () => void): void {
        this._marker.on("click", (e: L.LeafletEvent) => {
            L.DomEvent.stopPropagation(e as L.LeafletMouseEvent);
            handler();
        });
    }
}

class LeafletDraggableMarkerHandle extends LeafletMapLayerHandle implements DraggableMarkerHandle {
    private readonly _marker: L.Marker;

    constructor(marker: L.Marker) {
        super(marker);
        this._marker = marker;
    }

    setLatLng(latLng: [number, number]): void {
        this._marker.setLatLng(latLng);
    }

    onDrag(handler: (latLng: [number, number]) => void): () => void {
        const listener = () => {
            const ll = this._marker.getLatLng();
            handler([ll.lat, ll.lng]);
        };
        this._marker.on("drag", listener);
        return () => this._marker.off("drag", listener);
    }

    onDragEnd(handler: (latLng: [number, number]) => void): () => void {
        const listener = () => {
            const ll = this._marker.getLatLng();
            handler([ll.lat, ll.lng]);
        };
        this._marker.on("dragend", listener);
        return () => this._marker.off("dragend", listener);
    }
}

class LeafletClickableMapLayerHandle
    extends LeafletMapLayerHandle
    implements ClickableMapLayerHandle {

    private readonly _marker: L.CircleMarker;

    constructor(marker: L.CircleMarker) {
        super(marker);
        this._marker = marker;
    }

    onClick(handler: () => void): void {
        this._marker.on("click", (e: L.LeafletEvent) => {
            L.DomEvent.stopPropagation(e as L.LeafletMouseEvent);
            handler();
        });
    }

    setRadius(r: number): void {
        this._marker.setRadius(r);
    }
}

export class DefaultLeafletLayerFactory implements LayerFactory {
    createLayerGroup(): MapLayerHandle {
        return new LeafletMapLayerHandle(L.layerGroup());
    }

    createCircleMarker(
        latLng: [number, number],
        options: CircleMarkerOptions
    ): ClickableMapLayerHandle {
        const marker = L.circleMarker(latLng, {
            ...options,
            fillOpacity: options.fillOpacity ?? options.opacity,
        });

        if (options.label) {
            marker.bindTooltip(options.label, {
                permanent: true,
                direction: "top",
                offset: [12, 0],
                className: "bubble-label",
            });
        }

        return new LeafletClickableMapLayerHandle(marker);
    }

    createGeoCircle(
        latLng: [number, number],
        radiusMeters: number,
        options: CircleMarkerOptions
    ): ClickableMapLayerHandle {
        const circle = L.circle(latLng, {
            ...options,
            radius: radiusMeters,
            fillOpacity: options.fillOpacity ?? options.opacity,
        });
        return new LeafletClickableMapLayerHandle(circle);
    }

    createRectangle(
        bounds: [[number, number], [number, number]],
        options: RectangleOptions
    ): RectangleHandle {
        const rect = L.rectangle(bounds, {
            color: options.color,
            weight: options.weight,
            fillColor: options.fillColor,
            fillOpacity: options.fillOpacity,
            interactive: options.interactive ?? true,
        });
        return new LeafletRectangleHandle(rect);
    }

    createGeoJsonPolygon(geojson: unknown, options: PolygonOptions): MapLayerHandle {
        const layer = L.geoJSON(geojson as GeoJSON.GeoJsonObject, {
            pane: options.pane,
            style: () => ({
                color: options.fillColor,
                weight: 0,
                fillColor: options.fillColor,
                fillOpacity: options.fillOpacity,
            }),
            interactive: false,
        });
        return new LeafletMapLayerHandle(layer);
    }

    createAccuracyRing(latLng: [number, number], radiusMeters: number): AccuracyRingHandle {
        const circle = L.circle(latLng, {
            radius: radiusMeters,
            color: "#1a73e8",
            weight: 1,
            opacity: 0.5,
            fillColor: "#1a73e8",
            fillOpacity: 0.15,
            interactive: false,
        });
        return new LeafletAccuracyRingHandle(circle);
    }

    createPositionMarker(latLng: [number, number]): PositionMarkerHandle {
        const html =
            `<svg width="80" height="80" viewBox="0 0 80 80" style="overflow:visible;pointer-events:none">` +
            `<g class="heading-cone" style="visibility:hidden;transform-origin:40px 40px">` +
            `<polygon points="40,30 27,5 53,5" fill="#1a73e8" fill-opacity="0.55" stroke="none"/>` +
            `</g>` +
            `<circle cx="40" cy="40" r="8" fill="#1a73e8" stroke="white" stroke-width="2.5"/>` +
            `</svg>`;
        const icon = L.divIcon({
            className: "",
            html,
            iconSize: [80, 80],
            iconAnchor: [40, 40],
        });
        const marker = L.marker(latLng, { icon, interactive: false, keyboard: false });
        return new LeafletPositionMarkerHandle(marker);
    }

    // Fixed pin at the destination's lat/lng. Rendered into `pane` (destination-pane, kept
    // below the default markerPane so it never draws over the blue GPS indicator — see
    // geo-browser#74).
    createDestinationMarker(latLng: [number, number], pane: string): DestinationMarkerHandle {
        const icon = L.divIcon({
            className: "",
            html: `<img src="/icons/destination.svg" width="32" height="32" style="display:block" alt="Destination"/>`,
            iconSize: [32, 32],
            iconAnchor: [16, 32],
        });
        const marker = L.marker(latLng, { icon, pane, keyboard: false });
        return new LeafletDestinationMarkerHandle(marker);
    }

    // Same cone shape/rendering as the blue heading cone (createPositionMarker), red instead
    // of blue and with no center dot — the blue dot already exists via GeoLocationWidget.
    // Rotation source is bearing math (setHeading(bearingDegrees)), not compass heading, but
    // the mechanism (rotate an SVG polygon, hide via null) is identical, hence reusing
    // PositionMarkerHandle rather than a parallel type.
    createDestinationCone(latLng: [number, number], pane: string): PositionMarkerHandle {
        const html =
            `<svg width="80" height="80" viewBox="0 0 80 80" style="overflow:visible;pointer-events:none">` +
            `<g class="heading-cone" style="visibility:hidden;transform-origin:40px 40px">` +
            `<polygon points="40,30 27,5 53,5" fill="#ED4231" fill-opacity="0.55" stroke="none"/>` +
            `</g>` +
            `</svg>`;
        const icon = L.divIcon({
            className: "",
            html,
            iconSize: [80, 80],
            iconAnchor: [40, 40],
        });
        const marker = L.marker(latLng, { icon, pane, interactive: false, keyboard: false });
        return new LeafletPositionMarkerHandle(marker);
    }

    createDraggableMarker(latLng: [number, number]): DraggableMarkerHandle {
        const icon = L.divIcon({
            className: "",
            html: '<div style="width:10px;height:10px;background:#fff;border:2px solid #595959;border-radius:2px;cursor:crosshair;box-shadow:0 1px 3px rgba(0,0,0,0.4);"></div>',
            iconSize: [10, 10],
            iconAnchor: [5, 5],
        });
        const marker = L.marker(latLng, { draggable: true, icon });
        return new LeafletDraggableMarkerHandle(marker);
    }

    createHeatLayer(points: HeatPoint[], options: HeatLayerOptions): MapLayerHandle {
        const heatPoints: L.HeatLatLngTuple[] = [];

        for (const point of points) {
            heatPoints.push([
                point.latLng[0],
                point.latLng[1],
                point.weight,
            ]);
        }
        const color = options.color ?? "#ff0000";
        const gradient = options.gradient ?? {
            0.0: "rgba(0,0,0,0)",
            0.4: color,
            1.0: color,
        };
        const layer = L.heatLayer(heatPoints, {
            radius: options.radius,
            blur: options.blur,
            max: 1.0,
            gradient,
        });

        return new LeafletHeatLayerHandle(layer, options.opacity);
    }
}


// One TileFetcher per area, lazily created and kept for the whole session -- each backs its own
// named Cache API cache (CacheApiTileCacheStore, keyed by area id) so "clear cache" and cache-hit
// stats are per-area, not global. Cheap to keep around indefinitely: a TileFetcher is just a thin
// wrapper, the actual storage lives in the browser's Cache Storage, not in this map.
const tileFetchersByArea = new Map<string, TileFetcher>();

function getTileFetcherForArea(areaId: string): TileFetcher {
    let fetcher = tileFetchersByArea.get(areaId);
    if (!fetcher) {
        fetcher = new TileFetcher(new CacheApiTileCacheStore(areaId));
        tileFetchersByArea.set(areaId, fetcher);
    }
    return fetcher;
}

// Shared by both CachingTileLayer and OfflineFallbackTileLayer below -- a genuine cache miss in
// either class should show a coarser-zoom placeholder while the real tile is still resolving,
// rather than a blank rectangle, regardless of whether that resolution path is a manual
// fetch-with-write-through (CachingTileLayer) or a native best-effort <img> load
// (OfflineFallbackTileLayer). Free functions, not methods, so both classes can share them without
// a common base class -- their "how to finally display the real tile" logic differs enough
// (write-through + debug marking vs. plain native load) that forcing them into one class hierarchy
// would be more confusing than two similar-but-distinct createTile() implementations.
//
// Walks parent zoom levels closest-first, looking for one already cached, returning a
// cropped-and-scaled placeholder blob from the first hit. undefined if nothing's cached at any
// level up to AreaRenderClassifier.MIN_LOADED_ZOOM (reused rather than inventing a second "how far
// is too far" threshold -- below that floor no area's tiles are meaningfully "nearby" either).
async function findParentPlaceholder(
    fetcher: TileFetcher,
    provider: TileProvider,
    tileCoord: TileCoord,
    tileSizePx: number
): Promise<Blob | undefined> {
    for (let levelsUp = 1; ; levelsUp++) {
        const crop = computeParentTileCrop(tileCoord, levelsUp, AreaRenderClassifier.MIN_LOADED_ZOOM);
        if (!crop) {
            return undefined;
        }
        const parentBlob = await fetcher.tryCache(buildTileUrl(provider, crop.parent));
        if (parentBlob) {
            return cropAndScale(parentBlob, crop, tileSizePx);
        }
    }
}

async function cropAndScale(parentBlob: Blob, crop: ParentTileCrop, tileSizePx: number): Promise<Blob> {
    const bitmap = await createImageBitmap(parentBlob);
    const canvas = document.createElement("canvas");
    canvas.width = tileSizePx;
    canvas.height = tileSizePx;

    const ctx = canvas.getContext("2d");
    if (ctx) {
        ctx.drawImage(
            bitmap,
            crop.cropX * bitmap.width, crop.cropY * bitmap.height,
            crop.cropSize * bitmap.width, crop.cropSize * bitmap.height,
            0, 0, tileSizePx, tileSizePx
        );
    }
    bitmap.close();

    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("canvas.toBlob failed")));
    });
}

// Cache-first tile layer -- ONLY constructed while the current area either has tile caching
// (recording) enabled, or `?debug` is set (see buildTileLayer/shouldUseCachingLayer below); a
// disabled/no-current-area/non-debug map always uses a plain L.tileLayer instead. This matters for
// perf, not just correctness: manually fetching each tile (rather than letting the browser load a
// plain <img src>) so it can check the Cache API first and, while recording, write a live fetch
// back into the cache is real per-tile overhead, and buildTileUrl's fixed single subdomain (see
// below) gives up the a/b/c connection-parallelism {s} rotation normally provides -- acceptable
// only while actively recording or under `?debug`'s explicit opt-in, never for ordinary browsing.
// See geo-browser#103.
//
// `writeThrough` (constructor param, fixed for this instance's lifetime) is what actually gates
// persisting a live fetch back into the cache -- `?debug` alone (recording off) still reads the
// cache first (so the cache-hit debug marking below has something to show while just browsing an
// area recorded in an earlier session) but never writes new tiles into it.
const TILE_CACHE_DEBUG_PANE = "tileCacheDebugPane";

class CachingTileLayer extends L.TileLayer {
    private readonly _provider: TileProvider;
    private readonly _fetcher: TileFetcher;
    private readonly _writeThrough: boolean;
    private _debugOverlay?: L.LayerGroup;
    private readonly _debugRectanglesByKey = new Map<string, L.Rectangle>();

    constructor(provider: TileProvider, options: L.TileLayerOptions, fetcher: TileFetcher, writeThrough: boolean) {
        super(provider.urlTemplate, options);
        this._provider = provider;
        this._fetcher = fetcher;
        this._writeThrough = writeThrough;
    }

    // Debug-only cache-hit marking used to be a CSS box-shadow directly on the tile <img> --
    // dropped after confirming live it just doesn't paint visibly (DevTools computed style showed
    // the shadow resolved correctly, but nothing rendered on screen; likely obscured by something
    // else in the tile's own paint layer, never root-caused since a separate approach sidesteps it
    // entirely). Drawing a real Leaflet vector layer (L.rectangle per cache-hit tile) in its own
    // pane above the tile pane guarantees correct stacking regardless of whatever was wrong with
    // the img-level approach. See geo-browser#103, tasks/tile_caching.md.
    onAdd(map: L.Map): this {
        super.onAdd(map);
        if (Context.Instance.debug) {
            const pane = map.getPane(TILE_CACHE_DEBUG_PANE) ?? map.createPane(TILE_CACHE_DEBUG_PANE);
            pane.style.zIndex = "250"; // above tilePane (200), below overlayPane (400) / markers
            pane.style.pointerEvents = "none"; // never intercept clicks meant for tiles/POIs below
            this._debugOverlay = L.layerGroup([], { pane: TILE_CACHE_DEBUG_PANE }).addTo(map);
            this.on("tileunload", this.onTileUnload, this);
        }
        return this;
    }

    onRemove(map: L.Map): this {
        this.off("tileunload", this.onTileUnload, this);
        this._debugOverlay?.remove();
        this._debugOverlay = undefined;
        this._debugRectanglesByKey.clear();
        super.onRemove(map);
        return this;
    }

    private onTileUnload(event: L.TileEvent): void {
        const key = tileCoordsKey(event.coords);
        const rectangle = this._debugRectanglesByKey.get(key);
        if (rectangle) {
            this._debugOverlay?.removeLayer(rectangle);
            this._debugRectanglesByKey.delete(key);
        }
    }

    // Always computes the tile URL via the shared buildTileUrl() helper (tiles/tileUrl.ts) rather
    // than Leaflet's own getTileUrl()/{s} subdomain rotation -- the same tile must always resolve
    // to the same URL, or a tile cached under one {s} host could miss the cache when a later
    // request round-robins to a different one.
    //
    // Checks the cache directly (rather than going straight to fetchTile()) so a genuine miss can
    // race a coarser-zoom placeholder against the real (write-through) fetch -- see
    // findParentPlaceholder's doc comment. Without this, a slow live fetch under `?debug`/recording
    // showed a blank rectangle exactly like the pre-cache-first days, since this class's own
    // fetchTile() call has no placeholder awareness on its own.
    protected createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
        const img = document.createElement("img");
        const tileCoord = { x: coords.x, y: coords.y, z: coords.z };
        const url = buildTileUrl(this._provider, tileCoord);

        this._fetcher
            .tryCache(url)
            .then((cachedBlob) => {
                if (cachedBlob) {
                    if (this._debugOverlay) {
                        this.addDebugRectangle(coords, tileCoord);
                    }
                    this.showBlob(img, cachedBlob, done, `cached tile image decode failed: ${url}`);
                    return;
                }
                this.resolveLiveWithPlaceholder(img, tileCoord, url, done);
            })
            .catch((err) => {
                getLogger().warning("caching_tile_layer.tile_error", { url, err }, LogCategory.TileCache);
                done(err instanceof Error ? err : new Error(String(err)), img);
            });

        return img;
    }

    private showBlob(img: HTMLImageElement, blob: Blob, done: L.DoneCallback, decodeErrorMessage: string): void {
        const objectUrl = URL.createObjectURL(blob);
        img.onload = () => { URL.revokeObjectURL(objectUrl); done(undefined, img); };
        img.onerror = () => { URL.revokeObjectURL(objectUrl); done(new Error(decodeErrorMessage), img); };
        img.src = objectUrl;
    }

    // Races a coarser-zoom placeholder against the real fetchTile() call (which handles
    // write-through internally, regardless of which one wins the race). Whichever resolves first
    // satisfies Leaflet's done(); if the placeholder wins, the real tile silently replaces it in
    // place once it arrives -- no second done() call, matching OfflineFallbackTileLayer's own
    // upgrade pattern.
    private resolveLiveWithPlaceholder(
        img: HTMLImageElement,
        tileCoord: TileCoord,
        url: string,
        done: L.DoneCallback
    ): void {
        let shown = false;

        findParentPlaceholder(this._fetcher, this._provider, tileCoord, this.getTileSize().x)
            .then((placeholderBlob) => {
                if (placeholderBlob && !shown) {
                    shown = true;
                    this.showBlob(img, placeholderBlob, done, `placeholder tile decode failed: ${url}`);
                }
            });

        this._fetcher
            .fetchTile(url, this._writeThrough)
            .then(({ blob }) => {
                // A genuine miss just confirmed above -- cacheHit is always false here, so no
                // debug rectangle: that only marks a tile actually served from the cache, not one
                // that merely got a placeholder while it loaded live.
                if (shown) {
                    // Overwrite BOTH handlers, not just onload -- the placeholder's stale onerror
                    // would otherwise still be attached too, and could fire done() a second time
                    // with an error if this final assignment somehow fails to decode.
                    const objectUrl = URL.createObjectURL(blob);
                    img.onload = () => URL.revokeObjectURL(objectUrl);
                    img.onerror = () => URL.revokeObjectURL(objectUrl);
                    img.src = objectUrl;
                    return;
                }
                shown = true;
                this.showBlob(img, blob, done, `tile image decode failed: ${url}`);
            })
            .catch((err) => {
                getLogger().warning("caching_tile_layer.tile_error", { url, err }, LogCategory.TileCache);
                if (!shown) {
                    shown = true;
                    done(err instanceof Error ? err : new Error(String(err)), img);
                }
            });
    }

    private addDebugRectangle(coords: L.Coords, tileCoord: TileCoord): void {
        const key = tileCoordsKey(coords);
        if (this._debugRectanglesByKey.has(key) || !this._debugOverlay) {
            return;
        }
        const bounds = tileToBounds(tileCoord);
        const rectangle = L.rectangle(
            [[bounds.south, bounds.west], [bounds.north, bounds.east]],
            { pane: TILE_CACHE_DEBUG_PANE, color: "#00e676", weight: 2, opacity: 0.5, fillColor: "#00e676", fillOpacity: 0.1, interactive: false }
        );
        rectangle.addTo(this._debugOverlay);
        this._debugRectanglesByKey.set(key, rectangle);
    }
}

function tileCoordsKey(coords: L.Coords): string {
    return `${coords.z}/${coords.x}/${coords.y}`;
}

// The default OSM tile layer whenever a current area exists but recording/debug isn't active --
// i.e. ordinary browsing, the common case. Cache-first: a cached tile is always shown immediately,
// with no network involved at all -- fetching from OSM is best-effort and only ever attempted on
// a genuine cache miss. This also covers a slow/flaky connection, not just fully offline: a cached
// tile now never waits on the network at all, regardless of how slow or unreliable it is -- the
// cache lookup itself is a fast local Cache API read, not a network round-trip. Never writes to
// the cache -- write-through stays exclusively tied to explicit recording (CachingTileLayer above).
//
// This fixes a real gap, not a hypothetical: recording writes tiles into the cache, but before
// this class existed, buildTileLayer() only ever used a cache-aware layer while actively recording
// or under `?debug` -- a plain L.tileLayer never touches the Cache API in either direction. Every
// ordinary "just open the app and browse" session (recording off, no debug flag -- how the app is
// actually used day to day) never read the cache at all. Confirmed live: reopening the app fully
// offline showed a completely blank map background despite tiles genuinely being cached from an
// earlier recording session, because nothing was ever asking for them.
//
// On a genuine miss, also tries a blurry placeholder from a coarser-zoom parent tile that's
// already cached (crop the matching quadrant, scale it up) rather than a blank rectangle while the
// real tile is still loading -- the same pattern Google Maps and others use. Walks up parent zoom
// levels only as far as AreaRenderClassifier.MIN_LOADED_ZOOM (below that floor no area's tiles are
// meaningfully "nearby" either, so a placeholder from further out isn't worth showing), stopping at
// the first (least blurry) hit. Falls through to a plain best-effort native load if no placeholder
// is available at any level.
class OfflineFallbackTileLayer extends L.TileLayer {
    private readonly _provider: TileProvider;
    private readonly _fetcher: TileFetcher;

    constructor(provider: TileProvider, options: L.TileLayerOptions, fetcher: TileFetcher) {
        super(provider.urlTemplate, options);
        this._provider = provider;
        this._fetcher = fetcher;
    }

    protected createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
        const img = document.createElement("img");
        const tileCoord = { x: coords.x, y: coords.y, z: coords.z };
        // Fixed single subdomain (not Leaflet's own getTileUrl()/{s} rotation) -- must match
        // exactly what CachingTileLayer/buildTileUrl() used as the cache key while recording, or a
        // tile genuinely cached under this key would still miss here. Only used for cache
        // lookups; the actual network fetch on a miss uses Leaflet's normal {s}-rotating
        // getTileUrl() for full connection-parallelism.
        const cacheKey = buildTileUrl(this._provider, tileCoord);

        this._fetcher
            .tryCache(cacheKey)
            .then((blob) => {
                if (blob) {
                    this.showBlob(img, blob, done, `cached tile image decode failed: ${cacheKey}`);
                    return;
                }
                this.showPlaceholderThenUpgrade(img, tileCoord, coords, cacheKey, done);
            })
            .catch((err) => {
                getLogger().warning("offline_fallback_tile_layer.cache_error", { url: cacheKey, err }, LogCategory.TileCache);
                // The cache lookup itself failed (unexpected) -- still attempt the network as a
                // last resort rather than failing the tile outright.
                this.loadLiveTile(img, coords, cacheKey, done, err instanceof Error ? err : new Error(String(err)));
            });

        return img;
    }

    private showBlob(img: HTMLImageElement, blob: Blob, done: L.DoneCallback, decodeErrorMessage: string): void {
        const objectUrl = URL.createObjectURL(blob);
        img.onload = () => { URL.revokeObjectURL(objectUrl); done(undefined, img); };
        img.onerror = () => { URL.revokeObjectURL(objectUrl); done(new Error(decodeErrorMessage), img); };
        img.src = objectUrl;
    }

    // Best-effort native load, no special handling. If this fails (offline, slow network that
    // eventually times out, whatever), the tile just doesn't show, exactly like any ordinary
    // Leaflet tile layer with no cache at all.
    private loadLiveTile(img: HTMLImageElement, coords: L.Coords, cacheKey: string, done: L.DoneCallback, priorErr?: Error): void {
        img.onload = () => done(undefined, img);
        img.onerror = () => done(priorErr ?? new Error(`tile fetch failed and not cached: ${cacheKey}`), img);
        img.src = this.getTileUrl(coords);
    }

    private showPlaceholderThenUpgrade(
        img: HTMLImageElement,
        tileCoord: TileCoord,
        coords: L.Coords,
        cacheKey: string,
        done: L.DoneCallback
    ): void {
        findParentPlaceholder(this._fetcher, this._provider, tileCoord, this.getTileSize().x)
            .then((placeholderBlob) => {
                if (!placeholderBlob) {
                    this.loadLiveTile(img, coords, cacheKey, done);
                    return;
                }
                const objectUrl = URL.createObjectURL(placeholderBlob);
                img.onload = () => {
                    URL.revokeObjectURL(objectUrl);
                    done(undefined, img);
                    this.upgradeToLiveTile(img, coords);
                };
                img.onerror = () => { URL.revokeObjectURL(objectUrl); done(new Error(`placeholder tile decode failed: ${cacheKey}`), img); };
                img.src = objectUrl;
            })
            .catch((err) => {
                getLogger().warning("offline_fallback_tile_layer.placeholder_error", { url: cacheKey, err }, LogCategory.TileCache);
                this.loadLiveTile(img, coords, cacheKey, done);
            });
    }

    // Fetches the real tile live (best-effort, no writeThrough) and swaps it in once loaded --
    // the placeholder already satisfied Leaflet's done() callback, so this is a silent in-place
    // upgrade, not a new tile load as far as Leaflet is concerned. A failure here just leaves the
    // placeholder showing, which is strictly better than reverting to nothing.
    //
    // MUST clear img.onload/onerror before reassigning img.src -- otherwise the placeholder's own
    // onload handler (still attached from showPlaceholderThenUpgrade, since nothing had cleared it)
    // fires again on this new load, calling done() a second time for the same tile (a Leaflet
    // contract violation) AND recursively calling upgradeToLiveTile() again, creating a runaway
    // loop of repeated live fetches that never settles. Confirmed live: this caused both a blank
    // tile appearing over the placeholder after a zoom transition, and the placeholder persisting
    // indefinitely instead of upgrading even once the network came back.
    private upgradeToLiveTile(img: HTMLImageElement, coords: L.Coords): void {
        const liveImg = new Image();
        liveImg.onload = () => {
            img.onload = null;
            img.onerror = null;
            img.src = liveImg.src;
        };
        liveImg.src = this.getTileUrl(coords);
    }
}

// tileCacheAreaId is the area to attribute cached tiles to -- null only when there's no current
// area at all (CurrentAreaBundle passes the real area id on every setTileCacheEnabled() call, even
// while recording is off, precisely so a read-only layer -- debug's CachingTileLayer, or the
// always-on OfflineFallbackTileLayer -- has an area to read against).
function buildTileLayer(provider: TileProvider, tileCacheEnabled: boolean, tileCacheAreaId: string | null): L.TileLayer {
    const options: L.TileLayerOptions = {
        maxZoom: provider.maxZoom,
        attribution: provider.attribution,
        className: provider === osmTileProvider ? "dark-osm" : undefined,
    };
    if (provider.subdomains !== undefined) {
        options.subdomains = provider.subdomains;
    }

    if (provider === osmTileProvider && tileCacheAreaId) {
        const fetcher = getTileFetcherForArea(tileCacheAreaId);
        if (shouldUseCachingLayer(tileCacheEnabled, Context.Instance.debug)) {
            return new CachingTileLayer(provider, options, fetcher, tileCacheEnabled);
        }
        return new OfflineFallbackTileLayer(provider, options, fetcher);
    }

    return L.tileLayer(provider.urlTemplate, options);
}

class MapLayerFlyoutControl extends L.Control {
    private _layers: LayerSelectionWidgetItem[];
    private _onToggle: (layerId: string, visible: boolean) => void;
    private _onExportUserPoints?: () => void;

    private _leafletMap?: L.Map;
    private _tileLayer?: L.TileLayer;
    private _container?: HTMLElement;
    private _panel?: HTMLElement;
    private _isOpen = false;
    private _outsideClickHandler?: (e: MouseEvent) => void;
    private _cartoBtnEl?: HTMLButtonElement;
    private _osmBtnEl?: HTMLButtonElement;
    private _tileCacheEnabled = false;
    private _tileCacheAreaId: string | null = null;
    private _networkCleanup?: () => void;

    constructor(
        layers: LayerSelectionWidgetItem[],
        onToggle: (layerId: string, visible: boolean) => void,
        onExportUserPoints?: () => void
    ) {
        super({ position: "topright" });
        this._layers = layers;
        this._onToggle = onToggle;
        this._onExportUserPoints = onExportUserPoints;
    }

    onAdd(map: L.Map): HTMLElement {
        this._leafletMap = map;

        // Offline: OSM (cached) is the only usable provider -- see geo-browser#103's Provider
        // decision. Force it now rather than leaving a stale Carto choice the user can't reach.
        if (!isOnline() && getActiveTileProvider() !== osmTileProvider) {
            setActiveTileProvider(osmTileProvider);
        }
        this._tileLayer = buildTileLayer(getActiveTileProvider(), this._tileCacheEnabled, this._tileCacheAreaId).addTo(map);
        this.logTileLayerBuild("initial_add");

        this._container = L.DomUtil.create("div", "map-layer-flyout");
        L.DomEvent.disableClickPropagation(this._container);

        const btn = L.DomUtil.create("button", "map-layer-btn", this._container) as HTMLButtonElement;
        btn.type = "button";
        btn.title = "Map layers";
        btn.innerHTML = `<img src="/icons/layers.svg" alt="Layers" />`;
        btn.addEventListener("click", (e) => { e.stopPropagation(); this.onTriggerClick(); });

        this._panel = L.DomUtil.create("div", "map-layer-panel hidden", this._container);
        this.buildPanel();

        this._networkCleanup = onNetworkStatusChange((online) => this.onNetworkStatusChange(online));

        return this._container;
    }

    onRemove(): void {
        this.closePanel();
        this._networkCleanup?.();
        this._networkCleanup = undefined;
        this._tileLayer?.remove();
        this._tileLayer = undefined;
        this._leafletMap = undefined;
    }

    // The flyout control itself is session-level (see this class's doc comment) and stays put;
    // only the tile layer it owns gets swapped -- CachingTileLayer while recording/debug,
    // OfflineFallbackTileLayer otherwise (both area-scoped), a plain L.tileLayer only when there's
    // no current area at all. CurrentAreaBundle calls this on attach/hide/destroy and on recording
    // toggle, not on every pan/zoom, so the one-time tile flash a swap causes is an acceptable
    // cost. Persisted across a provider switch (see onTileProviderClick) so re-selecting OSM after
    // briefly viewing Carto doesn't lose it.
    setTileCacheEnabled(enabled: boolean, areaId: string): void {
        const wasCaching = this._tileCacheEnabled;
        const areaChanged = this._tileCacheAreaId !== areaId;

        this._tileCacheEnabled = enabled;
        this._tileCacheAreaId = areaId;

        // See tiles/tileCacheDecision.ts -- both tile-layer classes now used for an area
        // (CachingTileLayer, OfflineFallbackTileLayer) are area-scoped, so any area change always
        // rebuilds; a recording toggle always rebuilds too (switches between the two classes).
        if (shouldRebuildTileLayer(wasCaching, enabled, areaChanged)) {
            this.rebuildTileLayer();
        }
    }

    private rebuildTileLayer(): void {
        if (!this._leafletMap) {
            return;
        }
        this._tileLayer?.remove();
        this._tileLayer = buildTileLayer(getActiveTileProvider(), this._tileCacheEnabled, this._tileCacheAreaId).addTo(this._leafletMap);
        this.logTileLayerBuild("rebuild");
    }

    // Logs which kind of tile layer just got (re)built and why -- otherwise the
    // recording/debug/area-id decision that picks CachingTileLayer vs. a plain L.tileLayer (see
    // shouldUseCachingLayer, tiles/tileCacheDecision.ts) is invisible from the console, which made
    // a real live bug (cache-hit debug border silently not showing) much harder to diagnose than
    // it needed to be. See CLAUDE.md's Logging Rules on state transitions.
    private logTileLayerBuild(reason: "initial_add" | "rebuild"): void {
        const provider = getActiveTileProvider();
        const usesCachingLayer = provider === osmTileProvider
            && !!this._tileCacheAreaId
            && shouldUseCachingLayer(this._tileCacheEnabled, Context.Instance.debug);
        getLogger().info(
            "map_layer_flyout.tile_layer_build",
            {
                reason,
                provider: provider === osmTileProvider ? "osm" : "carto",
                areaId: this._tileCacheAreaId,
                recording: this._tileCacheEnabled,
                debug: Context.Instance.debug,
                usesCachingLayer,
            },
            LogCategory.TileCache
        );
    }

    // Per-area -- see TileCacheStore's doc comment. Uses the same per-area TileFetcher
    // CachingTileLayer itself writes through to (getTileFetcherForArea), regardless of whether
    // this flyout's own tile layer happens to be a CachingTileLayer for that area right now.
    async clearTileCache(areaId: string): Promise<void> {
        const log = getLogger();
        log.info("map_layer_flyout.clear_tile_cache.start", { areaId });
        await getTileFetcherForArea(areaId).clearCache();
        log.info("map_layer_flyout.clear_tile_cache.end", { areaId });
    }

    private onNetworkStatusChange(online: boolean): void {
        getLogger().info("map_layer_flyout.network_status", { online });
        if (!online && getActiveTileProvider() !== osmTileProvider) {
            this.onTileProviderClick(osmTileProvider);
        }
        this.updateTileButtons(getActiveTileProvider());
    }

    // Rebuilds only the panel's DOM content (tile-type buttons, Map Details
    // layer list, export button) — deliberately does not touch _tileLayer or
    // the control's own container/trigger button, so swapping the layer list
    // (e.g. current-area attach/hide) never flashes the base map tiles.
    setLayers(
        layers: LayerSelectionWidgetItem[],
        onToggle: (layerId: string, visible: boolean) => void,
        onExportUserPoints?: () => void
    ): void {
        this._layers = layers;
        this._onToggle = onToggle;
        this._onExportUserPoints = onExportUserPoints;
        if (!this._panel) {
            return;
        }
        this._panel.innerHTML = "";
        this.buildPanel();
    }

    private onTriggerClick(): void {
        getLogger().info("map_layer_flyout.trigger.click");
        if (this._isOpen) {
            this.closePanel();
        } else {
            this.openPanel();
        }
    }

    private openPanel(): void {
        this._panel?.classList.remove("hidden");
        this._isOpen = true;
        getLogger().info("map_layer_flyout.open");
        this._outsideClickHandler = (e: MouseEvent) => {
            if (this._container && !this._container.contains(e.target as Node)) {
                this.closePanel();
            }
        };
        document.addEventListener("click", this._outsideClickHandler);
    }

    private closePanel(): void {
        this._panel?.classList.add("hidden");
        this._isOpen = false;
        if (this._outsideClickHandler) {
            document.removeEventListener("click", this._outsideClickHandler);
            this._outsideClickHandler = undefined;
        }
    }

    private buildPanel(): void {
        if (!this._panel) {
            return;
        }

        const typeSection = L.DomUtil.create("div", "flyout-section", this._panel);
        L.DomUtil.create("div", "flyout-section-label", typeSection).textContent = "Map type";

        const tileOptions = L.DomUtil.create("div", "flyout-tile-options", typeSection);
        this._osmBtnEl = this.createTileBtn(tileOptions, osmTileProvider, "osm", "OSM");
        this._cartoBtnEl = this.createTileBtn(tileOptions, cartoTileProvider, "carto", "CARTO");
        this.updateTileButtons(getActiveTileProvider());

        if (this._layers.length > 0) {
            L.DomUtil.create("div", "flyout-divider", this._panel);

            const layerSection = L.DomUtil.create("div", "flyout-section", this._panel);
            L.DomUtil.create("div", "flyout-section-label", layerSection).textContent = "Map Details";

            const layerOptions = L.DomUtil.create("div", "flyout-layer-options", layerSection);
            for (const layer of this._layers) {
                this.createLayerBtn(layerOptions, layer);
            }
        }

        if (this._onExportUserPoints) {
            const canShare = typeof navigator.share === "function";
            const label = canShare ? "Share My Trip" : "Download My Trip";
            const icon = canShare ? "share" : "download";
            L.DomUtil.create("div", "flyout-divider", this._panel);
            const btn = L.DomUtil.create("button", "flyout-export-btn", this._panel) as HTMLButtonElement;
            btn.type = "button";
            btn.title = label;
            btn.innerHTML = `<img src="/icons/${icon}.svg" alt="${label}" /><span>${label}</span>`;
            btn.addEventListener("click", () => {
                getLogger().info("map_layer_flyout.export.click", { canShare });
                this._onExportUserPoints!();
            });
        }
    }

    private createTileBtn(
        parent: HTMLElement,
        provider: TileProvider,
        iconName: string,
        label: string
    ): HTMLButtonElement {
        const btn = L.DomUtil.create("button", "flyout-tile-btn", parent) as HTMLButtonElement;
        btn.type = "button";
        btn.title = label;
        btn.innerHTML = `<img src="/icons/${iconName}.svg" alt="${label}" /><span>${label}</span>`;
        btn.addEventListener("click", () => this.onTileProviderClick(provider));
        return btn;
    }

    private onTileProviderClick(provider: TileProvider): void {
        const log = getLogger();
        const name = provider === cartoTileProvider ? "carto" : "osm";
        if (provider === cartoTileProvider && !isOnline()) {
            log.info("map_layer_flyout.tile_provider.blocked_offline", { provider: name });
            return;
        }
        log.info("map_layer_flyout.tile_provider.start", { provider: name });
        if (getActiveTileProvider() === provider) {
            log.info("map_layer_flyout.tile_provider.end", { provider: name, changed: false });
            return;
        }
        setActiveTileProvider(provider);
        this._tileLayer?.remove();
        if (this._leafletMap) {
            this._tileLayer = buildTileLayer(provider, this._tileCacheEnabled, this._tileCacheAreaId).addTo(this._leafletMap);
        }
        this.updateTileButtons(provider);
        log.info("map_layer_flyout.tile_provider.end", { provider: name, changed: true });
    }

    private updateTileButtons(active: TileProvider): void {
        this._cartoBtnEl?.classList.toggle("active", active === cartoTileProvider);
        this._osmBtnEl?.classList.toggle("active", active === osmTileProvider);
        // Carto is online-only -- see geo-browser#103's Provider decision.
        if (this._cartoBtnEl) {
            this._cartoBtnEl.disabled = !isOnline();
            this._cartoBtnEl.title = isOnline() ? "CARTO" : "CARTO (unavailable offline)";
        }
    }

    private createLayerBtn(parent: HTMLElement, layer: LayerSelectionWidgetItem): void {
        const btn = L.DomUtil.create("button", "flyout-layer-btn", parent) as HTMLButtonElement;
        btn.type = "button";
        btn.title = layer.name;
        if (!layer.visible) {
            btn.classList.add("inactive");
        }

        const icon = L.DomUtil.create("span", "flyout-layer-icon", btn);
        icon.style.backgroundColor = layer.color;

        const name = L.DomUtil.create("span", "flyout-layer-name", btn);
        name.textContent = layer.name;

        btn.addEventListener("click", () => this.onLayerClick(layer, btn));
    }

    private onLayerClick(layer: LayerSelectionWidgetItem, btn: HTMLButtonElement): void {
        const log = getLogger();
        log.info("map_layer_flyout.layer.tap", { layerId: layer.id, visible: !layer.visible });
        layer.visible = !layer.visible;
        btn.classList.toggle("inactive", !layer.visible);
        this._onToggle(layer.id, layer.visible);
        log.info("map_layer_flyout.layer.tap.end", { layerId: layer.id, visible: layer.visible });
    }
}

export class DefaultLeafletMapFactory implements MapFactory {
    createMap(root: HTMLElement, center: [number, number], zoom: number): MapHandle {
        // tap: false — Leaflet's tap handler dispatches a synthetic click AND the browser
        // synthesises a native click (with pointer-events: auto on the SVG layer), causing
        // double/triple fires on iOS. Native click synthesis alone is sufficient on iOS 13+
        // with a width=device-width viewport.
        const map = L.map(root, { tap: false, maxBoundsViscosity: 1.0, zoomControl: false } as L.MapOptions).setView(center, zoom);
        // Prevent iOS native long-press callout (Look Up / Share) and text selection
        // from appearing over the map. -webkit-touch-callout covers link/image callouts;
        // user-select covers text selection (zoom +/− glyphs, etc.).
        const container = map.getContainer();
        container.style.setProperty("-webkit-touch-callout", "none");
        container.style.setProperty("-webkit-user-select", "none");
        container.style.setProperty("user-select", "none");
        // Leaflet only calls preventDefault() on contextmenu events that land on the map
        // pane. A long-press on a control (zoom buttons) fires contextmenu on the control's
        // DOM element and bypasses Leaflet — the native iOS menu appears. Suppress it here
        // for every element inside the map container.
        container.addEventListener("contextmenu", e => e.preventDefault(), { capture: true });

        return new LeafletMapHandle(map);
    }
}

class LeafletWidgetHandle implements WidgetHandle {
    private readonly _control: L.Control;

    constructor(control: L.Control) {
        this._control = control;
    }

    addTo(map: MapHandle): void {
        this._control.addTo(unwrapMap(map));
    }

    remove(): void {
        this._control.remove();
    }

    render(): void {
    }
}

class DesignToolbarControl extends L.Control {
    private readonly _buttons: DesignToolbarButton[];

    constructor(buttons: DesignToolbarButton[]) {
        super({ position: "topleft" });
        this._buttons = buttons;
    }

    onAdd(): HTMLElement {
        const container = L.DomUtil.create("div", "design-toolbar");

        for (const btn of this._buttons) {
            const button = L.DomUtil.create("button", "design-toolbar-button", container);
            button.type = "button";
            button.title = btn.title;

            const img = document.createElement("img");
            img.src = btn.iconUrl;
            img.alt = btn.title;
            button.appendChild(img);

            L.DomEvent.disableClickPropagation(button);

            const setActive = (active: boolean) => button.classList.toggle("active", active);

            button.addEventListener("click", (e) => {
                e.preventDefault();
                btn.onClick(setActive);
            });
        }

        return container;
    }
}

class LeafletPopupHandle implements WidgetHandle {
    private readonly _popup: L.Popup;
    private readonly _input: HTMLInputElement;

    constructor(popup: L.Popup, input: HTMLInputElement) {
        this._popup = popup;
        this._input = input;
    }

    addTo(map: MapHandle): void {
        this._popup.openOn(unwrapMap(map));
        this._input.focus();
    }

    remove(): void {
        this._popup.remove();
    }
}

function isPwa(): boolean {
    return window.matchMedia("(display-mode: standalone)").matches
        || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

// Area-scoped record-while-browsing widget (geo-browser#103, redesigned after confirming OSM's
// tile usage policy explicitly prohibits any "download for offline use" bulk/pre-fetch pattern --
// see contracts.ts's TileCacheStore doc comment). VCR-style: a hollow red circle means idle/tap
// to start recording; a filled red square means recording/tap to stop. Recording only flips
// write-through on for whatever tiles Leaflet's own ordinary viewport-driven loading already
// requests -- nothing is pre-fetched, so there's no known total/percentage to show, just on/off.
// A second, separate button clears the current area's cached tiles outright (its own named Cache
// API cache -- see TileCacheStore's doc comment; other areas' caches are untouched).
class TileCacheControl extends L.Control {
    private readonly _onToggleRecording: () => void;
    private readonly _onClearCache: () => void;
    private _status: TileCacheStatus;
    private _recordButton?: HTMLButtonElement;

    constructor(initialStatus: TileCacheStatus, onToggleRecording: () => void, onClearCache: () => void) {
        super({ position: "topright" });
        this._status = initialStatus;
        this._onToggleRecording = onToggleRecording;
        this._onClearCache = onClearCache;
    }

    onAdd(): HTMLElement {
        const container = L.DomUtil.create("div", "tile-cache-controls");
        L.DomEvent.disableClickPropagation(container);

        const recordButton = L.DomUtil.create("button", "tile-cache-button", container) as HTMLButtonElement;
        recordButton.type = "button";
        recordButton.innerHTML =
            `<svg viewBox="0 0 24 24" width="24" height="24">` +
            `<circle class="tile-cache-record-icon" cx="12" cy="12" r="7" />` +
            `<rect class="tile-cache-stop-icon" x="7" y="7" width="10" height="10" rx="1.5" />` +
            `</svg>`;
        recordButton.addEventListener("click", (e) => {
            e.preventDefault();
            this._onToggleRecording();
        });
        this._recordButton = recordButton;

        const clearButton = L.DomUtil.create("button", "tile-cache-clear-button", container) as HTMLButtonElement;
        clearButton.type = "button";
        clearButton.title = "Clear all cached map tiles";
        clearButton.innerHTML = `<img src="/icons/delete.svg" alt="Clear cached tiles" />`;
        clearButton.addEventListener("click", (e) => {
            e.preventDefault();
            this._onClearCache();
        });

        this.applyState();

        return container;
    }

    setStatus(status: TileCacheStatus): void {
        this._status = status;
        this.applyState();
    }

    private applyState(): void {
        if (!this._recordButton) {
            return;
        }

        this._recordButton.classList.toggle("tile-cache-button--recording", this._status === "recording");
        this._recordButton.title =
            this._status === "recording"
                ? "Recording map tiles for offline use — tap to stop"
                : "Tap to start recording map tiles you view, for offline use";
    }
}

class GeoLocationControl extends L.Control {
    private readonly _onToggle: () => void;
    private _button?: HTMLButtonElement;
    private _available: boolean;
    private _following = false;

    constructor(available: boolean, onToggle: () => void) {
        super({ position: "bottomright" });
        this._available = available;
        this._onToggle = onToggle;
    }

    onAdd(): HTMLElement {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "geo-location-button";
        button.title = "My location";
        button.disabled = !this._available;

        const img = document.createElement("img");
        img.src = "/icons/geo-location.svg";
        img.alt = "My location";
        button.appendChild(img);

        L.DomEvent.disableClickPropagation(button);

        button.addEventListener("click", (e) => {
            e.preventDefault();
            this._onToggle();
        });

        this._button = button;
        this.applyState();

        return button;
    }

    setAvailable(available: boolean): void {
        this._available = available;
        this.applyState();
    }

    setFollowing(following: boolean): void {
        this._following = following;
        this.applyState();
    }

    private applyState(): void {
        if (!this._button) {
            return;
        }

        this._button.disabled = !this._available;
        this._button.classList.toggle("geo-location-button--following", this._following);
        this._button.classList.toggle("geo-location-button--unavailable", !this._available);

        if (!this._available) {
            this._button.title = isPwa()
                ? "Location access blocked. Reset it in your browser's site settings."
                : "Location blocked. Click the lock icon in your address bar to allow it.";
        } else {
            this._button.title = "My location";
        }
    }
}

class LeafletGeoLocationWidgetHandle implements GeoLocationWidgetHandle {
    private readonly _control: GeoLocationControl;

    constructor(control: GeoLocationControl) {
        this._control = control;
    }

    addTo(map: MapHandle): void {
        this._control.addTo(unwrapMap(map));
    }

    remove(): void {
        this._control.remove();
    }

    setAvailable(available: boolean): void {
        this._control.setAvailable(available);
    }

    setFollowing(following: boolean): void {
        this._control.setFollowing(following);
    }
}

class LeafletTileCacheWidgetHandle implements TileCacheWidgetHandle {
    private readonly _control: TileCacheControl;

    constructor(control: TileCacheControl) {
        this._control = control;
    }

    addTo(map: MapHandle): void {
        this._control.addTo(unwrapMap(map));
    }

    remove(): void {
        this._control.remove();
    }

    setStatus(status: TileCacheStatus): void {
        this._control.setStatus(status);
    }
}

class SearchControl extends L.Control {
    private readonly _bbox: [number, number, number, number];
    private readonly _onResult: (latLng: [number, number], displayName: string) => void;

    private _container?: HTMLElement;
    private _searchBtn?: HTMLButtonElement;
    private _inputBar?: HTMLElement;
    private _input?: HTMLInputElement;
    private _results?: HTMLElement;
    private _isLoading = false;
    private _outsideClickHandler?: (e: MouseEvent) => void;

    constructor(
        bbox: [number, number, number, number],
        onResult: (latLng: [number, number], displayName: string) => void
    ) {
        super({ position: "topright" });
        this._bbox = bbox;
        this._onResult = onResult;
    }

    onAdd(): HTMLElement {
        this._container = L.DomUtil.create("div", "search-control");
        L.DomEvent.disableClickPropagation(this._container);

        this._searchBtn = L.DomUtil.create("button", "search-btn", this._container) as HTMLButtonElement;
        this._searchBtn.type = "button";
        this._searchBtn.title = "Search in this area";
        this._searchBtn.innerHTML = `<img src="/icons/search.svg" alt="Search" />`;
        this._searchBtn.addEventListener("click", (e) => {
            getLogger().info("search_control.btn.click");
            e.stopPropagation();
            this.expand();
        });

        this._inputBar = L.DomUtil.create("div", "search-input-bar hidden", this._container);

        const online = navigator.onLine;
        this._input = L.DomUtil.create("input", "search-input", this._inputBar) as HTMLInputElement;
        this._input.type = "search";
        this._input.placeholder = online ? "Search in this area…" : "Search requires a connection.";
        this._input.disabled = !online;
        this._input.addEventListener("keydown", (e: KeyboardEvent) => {
            if (e.key === "Enter") { void this.doSearch(); }
            else if (e.key === "Escape") { this.collapse(); }
        });

        const goBtn = L.DomUtil.create("button", "search-go-btn", this._inputBar) as HTMLButtonElement;
        goBtn.type = "button";
        goBtn.title = "Go";
        goBtn.disabled = !online;
        goBtn.innerHTML = `<img src="/icons/go.svg" alt="Go" />`;
        goBtn.addEventListener("click", () => {
            getLogger().info("search_control.go.click");
            void this.doSearch();
        });

        const closeBtn = L.DomUtil.create("button", "search-close-btn", this._inputBar) as HTMLButtonElement;
        closeBtn.type = "button";
        closeBtn.title = "Close search";
        closeBtn.textContent = "×";
        closeBtn.addEventListener("click", () => {
            getLogger().info("search_control.close.click");
            this.collapse();
        });

        // Results panel is appended to document.body so it floats above all
        // Leaflet control stacking contexts — position: fixed, placed via JS.
        this._results = document.createElement("div");
        this._results.className = "search-results hidden";
        L.DomEvent.disableClickPropagation(this._results);
        document.body.appendChild(this._results);

        return this._container;
    }

    onRemove(): void {
        this.removeOutsideClickHandler();
        this._results?.remove();
        this._container = undefined;
        this._searchBtn = undefined;
        this._inputBar = undefined;
        this._input = undefined;
        this._results = undefined;
    }

    private expand(): void {
        if (!this._inputBar || !this._searchBtn) return;
        this._searchBtn.classList.add("hidden");
        this._inputBar.classList.remove("hidden");
        this._input?.focus();
        this._outsideClickHandler = (e: MouseEvent) => {
            const inContainer = this._container?.contains(e.target as Node) ?? false;
            const inResults = this._results?.contains(e.target as Node) ?? false;
            if (!inContainer && !inResults) {
                this.collapse();
            }
        };
        document.addEventListener("click", this._outsideClickHandler);
        getLogger().info("search_control.expand");
    }

    private collapse(): void {
        if (!this._inputBar || !this._searchBtn || !this._results) return;
        this._inputBar.classList.add("hidden");
        this._results.classList.add("hidden");
        this._searchBtn.classList.remove("hidden");
        if (this._input) this._input.value = "";
        this.removeOutsideClickHandler();
        getLogger().info("search_control.collapse");
    }

    private removeOutsideClickHandler(): void {
        if (this._outsideClickHandler) {
            document.removeEventListener("click", this._outsideClickHandler);
            this._outsideClickHandler = undefined;
        }
    }

    private async doSearch(): Promise<void> {
        const log = getLogger();
        if (!this._input || !this._results) return;
        const q = this._input.value.trim();
        if (!q || this._isLoading) return;

        log.info("search_control.search.start", { q });
        this._isLoading = true;

        try {
            const results = await queryNominatim(q, this._bbox);
            log.info("search_control.search.end", { q, count: results.length });
            this.showResults(results);
        } catch (err) {
            log.error("search_control.search.error", err, { q });
            this.showError();
        } finally {
            this._isLoading = false;
        }
    }

    private positionResults(): void {
        if (!this._container || !this._results) return;
        const rect = this._container.getBoundingClientRect();
        this._results.style.top = `${rect.bottom + 4}px`;
        this._results.style.right = `${window.innerWidth - rect.right}px`;
    }

    private showResults(results: NominatimResult[]): void {
        if (!this._results) return;
        this._results.innerHTML = "";
        this.positionResults();
        this._results.classList.remove("hidden");

        if (results.length === 0) {
            const empty = L.DomUtil.create("div", "search-no-results", this._results);
            empty.textContent = "No results found.";
            return;
        }

        for (const result of results) {
            const row = L.DomUtil.create("button", "search-result-row", this._results) as HTMLButtonElement;
            row.type = "button";

            const primary = L.DomUtil.create("span", "search-result-primary", row);
            const name = result.display_name.length > 60
                ? result.display_name.slice(0, 60) + "…"
                : result.display_name;
            primary.textContent = name;

            const secondary = L.DomUtil.create("span", "search-result-secondary", row);
            secondary.textContent = result.type || result.class;

            row.addEventListener("click", () => {
                getLogger().info("search_control.result.tap", { displayName: result.display_name });
                this._onResult([parseFloat(result.lat), parseFloat(result.lon)], result.display_name);
            });
        }
    }

    private showError(): void {
        if (!this._results) return;
        this._results.innerHTML = "";
        this.positionResults();
        this._results.classList.remove("hidden");
        const msg = L.DomUtil.create("div", "search-no-results", this._results);
        msg.textContent = "Search failed. Check your connection.";
    }
}

class LeafletMapLayerFlyoutHandle extends LeafletWidgetHandle implements MapLayerFlyoutHandle {
    private readonly _flyout: MapLayerFlyoutControl;

    constructor(flyout: MapLayerFlyoutControl) {
        super(flyout);
        this._flyout = flyout;
    }

    setLayers(
        layers: LayerSelectionWidgetItem[],
        onToggle: (layerId: string, visible: boolean) => void,
        onExportUserPoints?: () => void
    ): void {
        this._flyout.setLayers(layers, onToggle, onExportUserPoints);
    }

    setTileCacheEnabled(enabled: boolean, areaId: string): void {
        this._flyout.setTileCacheEnabled(enabled, areaId);
    }

    clearTileCache(areaId: string): Promise<void> {
        return this._flyout.clearTileCache(areaId);
    }
}

export class DefaultLeafletWidgetFactory implements WidgetFactory {

    createMapLayerFlyout(
        layers: LayerSelectionWidgetItem[],
        onToggle: (layerId: string, visible: boolean) => void,
        onExportUserPoints?: () => void
    ): MapLayerFlyoutHandle {
        return new LeafletMapLayerFlyoutHandle(new MapLayerFlyoutControl(layers, onToggle, onExportUserPoints));
    }

    createDesignToolbar(buttons: DesignToolbarButton[]): WidgetHandle {
        return new LeafletWidgetHandle(new DesignToolbarControl(buttons));
    }

    createGeoLocationWidget(
        available: boolean,
        onToggle: () => void
    ): GeoLocationWidgetHandle {
        return new LeafletGeoLocationWidgetHandle(new GeoLocationControl(available, onToggle));
    }

    createSearchControl(
        bbox: [number, number, number, number],
        onResult: (latLng: [number, number], displayName: string) => void
    ): WidgetHandle {
        return new LeafletWidgetHandle(new SearchControl(bbox, onResult));
    }

    createTileCacheWidget(
        initialStatus: TileCacheStatus,
        onToggleRecording: () => void,
        onClearCache: () => void
    ): TileCacheWidgetHandle {
        return new LeafletTileCacheWidgetHandle(new TileCacheControl(initialStatus, onToggleRecording, onClearCache));
    }

    createNamePromptPopup(
        latLng: [number, number],
        onCommit: (name: string) => void,
        onDiscard: () => void
    ): WidgetHandle {
        const container = document.createElement("div");
        container.className = "area-name-prompt";

        const input = document.createElement("input");
        input.type = "text";
        input.className = "area-name-input";
        input.placeholder = "Area name";
        container.appendChild(input);

        const actions = document.createElement("div");
        actions.className = "area-name-actions";
        container.appendChild(actions);

        const okBtn = document.createElement("button");
        okBtn.type = "button";
        okBtn.className = "design-toolbar-button";
        okBtn.title = "Commit area";
        const okImg = document.createElement("img");
        okImg.src = "/icons/design-ok.svg";
        okImg.alt = "OK";
        okBtn.appendChild(okImg);
        actions.appendChild(okBtn);

        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "design-toolbar-button";
        cancelBtn.title = "Discard area";
        const cancelImg = document.createElement("img");
        cancelImg.src = "/icons/design-cancel.svg";
        cancelImg.alt = "Cancel";
        cancelBtn.appendChild(cancelImg);
        actions.appendChild(cancelBtn);

        L.DomEvent.disableClickPropagation(container);

        const commit = () => {
            const name = input.value.trim();
            if (!name || name === "*") {
                input.classList.add("area-name-input--invalid");
                input.focus();
                return;
            }
            onCommit(name);
        };

        input.addEventListener("input", () => input.classList.remove("area-name-input--invalid"));
        okBtn.addEventListener("click", commit);
        cancelBtn.addEventListener("click", () => onDiscard());
        input.addEventListener("keydown", (e: KeyboardEvent) => {
            if (e.key === "Enter") { commit(); }
            else if (e.key === "Escape") { onDiscard(); }
        });

        const popup = L.popup({ closeButton: false, autoClose: false, closeOnClick: false })
            .setLatLng(latLng)
            .setContent(container);

        return new LeafletPopupHandle(popup, input);
    }
}
