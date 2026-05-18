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
    CircleMarkerOptions,
    DesignToolbarButton,
    DraggableMarkerHandle,
    LayerFactory,
    MapFactory,
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
        const map = L.map(root).setView(center, zoom);

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
}
