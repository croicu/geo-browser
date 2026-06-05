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
    DraggableMarkerHandle,
    GeoLocationWidgetHandle,
    LayerFactory,
    MapFactory,
    MapPopupHandle,
    PositionMarkerHandle,
    RectangleHandle,
    RectangleOptions,
    WidgetFactory,
    MapHandle,
    MapLayerHandle,
    WidgetHandle,
    LayerSelectionWidgetItem,
    HeatLayerOptions,
    ClickableMapLayerHandle,
} from "../../contracts";

import type { HeatPoint } from "../../protocols";
import { getLogger } from "../../services";
import { queryNominatim, type NominatimResult } from "../../maps/nominatim";

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

    onContextMenu(handler: (latLng: [number, number]) => void): () => void {
        const listener = (e: L.LeafletMouseEvent) => handler([e.latlng.lat, e.latlng.lng]);
        this._map.on("contextmenu", listener);
        return () => this._map.off("contextmenu", listener);
    }

    onLongPress(handler: (latLng: [number, number], pressure: number) => void): () => void {
        let timer: ReturnType<typeof setTimeout> | undefined;
        let downLatLng: [number, number] | undefined;
        let downPressure = 0.5;

        const onDown = (e: L.LeafletMouseEvent) => {
            downLatLng = [e.latlng.lat, e.latlng.lng];
            const pe = e.originalEvent as PointerEvent;
            downPressure = typeof pe.pressure === "number" && pe.pressure > 0 ? pe.pressure : 0.5;
            timer = setTimeout(() => {
                if (downLatLng) {
                    handler(downLatLng, downPressure);
                }
                downLatLng = undefined;
            }, 600);
        };

        const cancel = () => {
            clearTimeout(timer);
            timer = undefined;
            downLatLng = undefined;
        };

        this._map.on("mousedown", onDown);
        this._map.on("mousemove", cancel);
        this._map.on("mouseup", cancel);

        return () => {
            this._map.off("mousedown", onDown);
            this._map.off("mousemove", cancel);
            this._map.off("mouseup", cancel);
            clearTimeout(timer);
        };
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

    setMinZoom(zoom: number): void {
        // Pre-snap to minZoom without animation before calling setMinZoom.
        // If we let Leaflet animate, _onZoomTransitionEnd fires synchronously inside
        // the zoomanim handler (same-transform workaround), which emits zoomend,
        // which can trigger openSummary while _animateZoom still holds the call stack.
        // That destroys the map before _move runs, crashing with _mapPane undefined.
        if (this._map.getZoom() < zoom) {
            this._map.setZoom(zoom, { animate: false });
        }
        this._map.setMinZoom(zoom);
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

    onContextMenu(handler: () => void): void {
        this._marker.on("contextmenu", (e: L.LeafletEvent) => {
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
            interactive: false,
        });
        return new LeafletRectangleHandle(rect);
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


function buildTileLayer(provider: TileProvider): L.TileLayer {
    const options: L.TileLayerOptions = {
        maxZoom: provider.maxZoom,
        attribution: provider.attribution,
        className: provider === osmTileProvider ? "dark-osm" : undefined,
    };
    if (provider.subdomains !== undefined) {
        options.subdomains = provider.subdomains;
    }
    return L.tileLayer(provider.urlTemplate, options);
}

class MapLayerFlyoutControl extends L.Control {
    private readonly _layers: LayerSelectionWidgetItem[];
    private readonly _onToggle: (layerId: string, visible: boolean) => void;
    private readonly _onExportUserPoints?: () => void;

    private _leafletMap?: L.Map;
    private _tileLayer?: L.TileLayer;
    private _container?: HTMLElement;
    private _panel?: HTMLElement;
    private _isOpen = false;
    private _outsideClickHandler?: (e: MouseEvent) => void;
    private _cartoBtnEl?: HTMLButtonElement;
    private _osmBtnEl?: HTMLButtonElement;

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
        this._tileLayer = buildTileLayer(getActiveTileProvider()).addTo(map);

        this._container = L.DomUtil.create("div", "map-layer-flyout");
        L.DomEvent.disableClickPropagation(this._container);

        const btn = L.DomUtil.create("button", "map-layer-btn", this._container) as HTMLButtonElement;
        btn.type = "button";
        btn.title = "Map layers";
        btn.innerHTML = `<img src="/icons/layers.svg" alt="Layers" />`;
        btn.addEventListener("click", (e) => { e.stopPropagation(); this.onTriggerClick(); });

        this._panel = L.DomUtil.create("div", "map-layer-panel hidden", this._container);
        this.buildPanel();

        return this._container;
    }

    onRemove(): void {
        this.closePanel();
        this._tileLayer?.remove();
        this._tileLayer = undefined;
        this._leafletMap = undefined;
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
        this._cartoBtnEl = this.createTileBtn(tileOptions, cartoTileProvider, "carto", "CARTO");
        this._osmBtnEl = this.createTileBtn(tileOptions, osmTileProvider, "osm", "OSM");
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
        log.info("map_layer_flyout.tile_provider.start", { provider: name });
        if (getActiveTileProvider() === provider) {
            log.info("map_layer_flyout.tile_provider.end", { provider: name, changed: false });
            return;
        }
        setActiveTileProvider(provider);
        this._tileLayer?.remove();
        if (this._leafletMap) {
            this._tileLayer = buildTileLayer(provider).addTo(this._leafletMap);
        }
        this.updateTileButtons(provider);
        log.info("map_layer_flyout.tile_provider.end", { provider: name, changed: true });
    }

    private updateTileButtons(active: TileProvider): void {
        this._cartoBtnEl?.classList.toggle("active", active === cartoTileProvider);
        this._osmBtnEl?.classList.toggle("active", active === osmTileProvider);
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

class SummaryControl extends L.Control {
    private readonly _label: string;
    private readonly _onClick: () => void;

    constructor(label: string, onClick: () => void) {
        super({ position: "topright" });

        this._label = label;
        this._onClick = onClick;

        void this._label;
    }

    onAdd(): HTMLElement {
        const button = document.createElement("button");

        button.className = "leaflet-summary-widget";
        button.type = "button";
        button.title = "Back to summary";

        const image = document.createElement("img");

        image.src = "/icons/browse-back.svg";
        image.alt = "Back";

        button.appendChild(image);

        button.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();

            this._onClick();
        });

        return button;
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

export class DefaultLeafletWidgetFactory implements WidgetFactory {

    createSummaryWidget(
        label: string,
        onClick: () => void
    ): WidgetHandle {
        return new LeafletWidgetHandle(new SummaryControl(label, onClick));
    }

    createMapLayerFlyout(
        layers: LayerSelectionWidgetItem[],
        onToggle: (layerId: string, visible: boolean) => void,
        onExportUserPoints?: () => void
    ): WidgetHandle {
        return new LeafletWidgetHandle(new MapLayerFlyoutControl(layers, onToggle, onExportUserPoints));
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
