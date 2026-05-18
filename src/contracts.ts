import type { HeatPoint } from "./protocols";
import type { Cookie, EventDef, MethodDef } from "./api";

export type LogLevel =
    | "diagnostic"
    | "info"
    | "warning"
    | "error"
    | "fatal";

export interface TelemetryRecord {
    timestamp: string;
    level: LogLevel;
    message: string;
    props?: Record<string, unknown>;
    error?: unknown;
}

export interface TelemetrySink {
    write(record: TelemetryRecord): void;
}

export interface Logger {
    diagnostic(message: string, props?: Record<string, unknown>): void;
    info(message: string, props?: Record<string, unknown>): void;
    warning(message: string, props?: Record<string, unknown>): void;
    error(message: string, error?: unknown, props?: Record<string, unknown>): void;
    fatal(message: string, error?: unknown, props?: Record<string, unknown>): void;
}

export interface View {
    render(): void;
    destroy(): void;
}

export interface Widget {
    render(): void;
    destroy(): void;
}

export interface ControllerActions {
    openSummary(): void;
    openDetail(areaId: string): void;
    setLayerVisible(areaId: string, layerId: string, visible: boolean): void;

    saveSummaryViewport(center: [number, number], zoom: number): void;
    saveDetailViewport(areaId: string, center: [number, number], zoom: number): void;

    zoomIn(): void;
    zoomOut(): void;
    setZoom(zoomLevel: number): void;
}

export interface GatewayService {
    invoke<TIn, TOut>(def: MethodDef<TIn, TOut>, data: TIn, callback?: (response: TOut) => void): void;
    subscribe<TIn, TOut>(def: EventDef<TIn, TOut>, fn: (data: TIn) => TOut | void): Cookie;
    unsubscribe(cookie: Cookie): void;
}

export interface ControllerState {
    get zoom(): number;
    get minZoom(): number;
    get maxZoom(): number;
}

export interface MapHandle {
    remove(): void;
    getCenter(): [number, number];
    getZoom(): number;
    onZoom(handler: (zoom: number) => void): () => void;
    onMoveEnd(handler: () => void): () => void;
    onClick(handler: (latLng: [number, number]) => void): () => void;
}

export interface GeoDataService {
    getCatalog(): Promise<unknown>;

    getAreaDetail(
        areaId: string
    ): Promise<unknown>;

    getLayerPayload(
        areaId: string,
        layerId: string
    ): Promise<unknown>;
}

export interface StorageService {
    getItem(
        key: string
    ): string | null;

    setItem(
        key: string,
        value: string
    ): void;

    removeItem(
        key: string
    ): void;

    clear(): void;
}

export interface HostService {
    getCapability(name: string): unknown;
    readonly gateway: GatewayService | null;
}

export interface MapFactory {
    createMap(root: HTMLElement, center: [number, number], zoom: number): MapHandle;
}

export interface MapLayerHandle {
    addTo(map: MapHandle): void;
    remove(): void;
}

export interface RectangleHandle extends MapLayerHandle {
    setBounds(bounds: [[number, number], [number, number]]): void;
}

export interface DraggableMarkerHandle extends MapLayerHandle {
    setLatLng(latLng: [number, number]): void;
    onDrag(handler: (latLng: [number, number]) => void): () => void;
    onDragEnd(handler: (latLng: [number, number]) => void): () => void;
}

export interface ClickableMapLayerHandle extends MapLayerHandle {
    onClick: (handler: () => void) => void;
    setRadius(r: number): void;
}

export interface CircleMarkerOptions {
    title?: string,
    label?: string;
    radius?: number;
    color?: string;
    weight?: number;
    fillColor?: string,
    opacity: number;
}

export interface RectangleOptions {
    color: string;
    weight: number;
    fillColor: string;
    fillOpacity: number;
}

export interface HeatLayerOptions {
    radius: number;
    blur: number;
    opacity: number;
    color?: string;
}

export interface LayerFactory {
    createLayerGroup(): MapLayerHandle;
    createCircleMarker(
        latLng: [number, number],
        options: CircleMarkerOptions
    ): ClickableMapLayerHandle;
    createGeoCircle(
        latLng: [number, number],
        radiusMeters: number,
        options: CircleMarkerOptions
    ): ClickableMapLayerHandle;
    createHeatLayer(
        points: HeatPoint[],
        options: HeatLayerOptions
    ): MapLayerHandle;
    createRectangle(
        bounds: [[number, number], [number, number]],
        options: RectangleOptions
    ): RectangleHandle;
    createDraggableMarker(latLng: [number, number]): DraggableMarkerHandle;
}

export interface WidgetHandle {
    addTo(map: MapHandle): void;
    remove(): void;
}

export interface LayerSelectionWidgetItem {
    id: string;
    name: string;
    color: string;
    visible: boolean;
}

export interface WidgetFactory {
    createSummaryWidget(
        label: string,
        onClick: () => void
    ): WidgetHandle;

    createLayerSelectionWidget(
        layers: LayerSelectionWidgetItem[],
        onToggle: (layerId: string, visible: boolean) => void
    ): WidgetHandle;

}
