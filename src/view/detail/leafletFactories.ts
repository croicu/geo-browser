// view/detail/leafletFactories.ts
import L from "leaflet";
import "leaflet.heat"

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
    }

    export function heatLayer(
        latlngs: HeatLatLngTuple[],
        options?: HeatLayerOptions
    ): HeatLayer;
}

import type {
    AccuracyRingHandle,
    CircleMarkerOptions,
    DesignToolbarButton,
    DraggableMarkerHandle,
    GeoLocationWidgetHandle,
    LayerFactory,
    MapFactory,
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

class LeafletMapHandle implements MapHandle {
    private readonly _map: L.Map;

    constructor(map: L.Map) {
        this._map = map;
    }

    remove(): void {
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

    onMoveEnd(handler: () => void): () => void {
        this._map.on("moveend", handler);
        return () => this._map.off("moveend", handler);
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

    setMinZoom(zoom: number): void {
        this._map.setMinZoom(zoom);
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

    constructor(layer: L.HeatLayer, opacity: number) {
        super(layer);
        this._heatLayer = layer;
        this._opacity = opacity;
    }

    addTo(map: MapHandle): void {
        super.addTo(map);
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

class LeafletPositionMarkerHandle extends LeafletMapLayerHandle implements PositionMarkerHandle {
    private readonly _marker: L.CircleMarker;

    constructor(marker: L.CircleMarker) {
        super(marker);
        this._marker = marker;
    }

    setLatLng(latLng: [number, number]): void {
        this._marker.setLatLng(latLng);
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
        this._marker.on("click", handler);
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
        const marker = L.circleMarker(latLng, options);

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
        const circle = L.circle(latLng, { ...options, radius: radiusMeters });
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
        const marker = L.circleMarker(latLng, {
            radius: 8,
            color: "#ffffff",
            weight: 2,
            fillColor: "#1a73e8",
            fillOpacity: 1,
            opacity: 1,
        });
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
        const layer = L.heatLayer(heatPoints, {
            radius: options.radius,
            blur: options.blur,
            max: 1.0,
            gradient: {
                0.0: "rgba(0,0,0,0)",
                0.4: options.color ?? "#ff0000",
                1.0: options.color ?? "#ff0000",
            },
        });

        return new LeafletHeatLayerHandle(layer, options.opacity);
    }
}


export class DefaultLeafletMapFactory implements MapFactory {
    createMap(root: HTMLElement, center: [number, number], zoom: number): MapHandle {
        // tap: false — Leaflet's tap handler dispatches a synthetic click AND the browser
        // synthesises a native click (with pointer-events: auto on the SVG layer), causing
        // double/triple fires on iOS. Native click synthesis alone is sufficient on iOS 13+
        // with a width=device-width viewport.
        const map = L.map(root, { tap: false, maxBoundsViscosity: 1.0 } as L.MapOptions).setView(center, zoom);

        L.tileLayer(
            "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            {
                maxZoom: 19,
                attribution: "&copy; OpenStreetMap contributors",
                className: "dark-osm"
            }
        ).addTo(map);

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
        super({ position: "topleft" });

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

class LayerControl extends L.Control {
    private readonly _layers: LayerSelectionWidgetItem[];
    private readonly _onToggle: (layerId: string, visible: boolean) => void;

    constructor(
        layers: LayerSelectionWidgetItem[], 
        onToggle: (layerId: string, visible: boolean) => void
    ) {
        super({ position: "topleft" });

        this._layers = layers;
        this._onToggle = onToggle;
    }

    onAdd(): HTMLElement {
        const root = L.DomUtil.create("div", "layer-control");

        for (const layer of this._layers) {
            const button = L.DomUtil.create("button", "layer-control-button", root);

            button.type = "button";
            button.title = layer.name;
            button.style.backgroundColor = layer.color;
            button.textContent = layer.visible ? "✓" : "×";

            if (!layer.visible) {
                button.classList.add("inactive");
            }

            L.DomEvent.disableClickPropagation(button);

            button.addEventListener("click", () => this.onClick(button, layer));
        }

        return root;
    }

    private onClick(
        button: HTMLElement,
        layer: LayerSelectionWidgetItem
    )
    {
        layer.visible = !layer.visible;

        button.textContent = layer.visible ? "✓" : "×";
        button.classList.toggle("inactive", !layer.visible);

        this._onToggle(layer.id, layer.visible);
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

export class DefaultLeafletWidgetFactory implements WidgetFactory {

    createSummaryWidget(
        label: string,
        onClick: () => void
    ): WidgetHandle {
        return new LeafletWidgetHandle(new SummaryControl(label, onClick));
    }

    createLayerSelectionWidget(
        layers: LayerSelectionWidgetItem[],
        onToggle: (layerId: string, visible: boolean) => void
    ): WidgetHandle {
        return new LeafletWidgetHandle(new LayerControl(layers, onToggle));
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
