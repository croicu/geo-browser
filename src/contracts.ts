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
    openSummary(center?: [number, number], zoom?: number): void;
    openDetail(areaId: string, center?: [number, number], zoom?: number): void;
    setLayerVisible(areaId: string, layerId: string, visible: boolean): void;

    saveSummaryViewport(center: [number, number], zoom: number): void;
    saveDetailViewport(areaId: string, center: [number, number], zoom: number): void;

    zoomIn(): void;
    zoomOut(): void;
    setZoom(zoomLevel: number): void;

    newArea(): void;
    commitArea(bbox: [number, number, number, number], name: string): void;
    discardArea(): void;
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

export interface MapPopupHandle {
    update(element: HTMLElement): void;
    remove(): void;
}

export type ControlPosition = "topleft" | "topright" | "bottomleft" | "bottomright";

export interface MapHandle {
    remove(): void;
    getCenter(): [number, number];
    getZoom(): number;
    getContainer(): HTMLElement;
    panTo(latLng: [number, number]): void;
    onZoom(handler: (zoom: number) => void): () => void;
    onZoomAnim(handler: (center: [number, number], zoom: number) => void): () => void;
    onMove(handler: () => void): () => void;
    onMoveEnd(handler: () => void): () => void;
    project(latLng: [number, number], zoom: number): [number, number];
    latLngToContainerPoint(latLng: [number, number]): [number, number];
    containerPointToLatLng(point: [number, number]): [number, number];
    onClick(handler: (latLng: [number, number]) => void): () => void;
    onContextMenu(handler: (latLng: [number, number]) => void): () => void;
    onLongPress(handler: (latLng: [number, number], pressure: number) => void): () => void;
    setCursor(cursor: string): void;
    onMouseDown(handler: (latLng: [number, number]) => void): () => void;
    onMouseMove(handler: (latLng: [number, number]) => void): () => void;
    onMouseUp(handler: (latLng: [number, number]) => void): () => void;
    disableDrag(): void;
    enableDrag(): void;
    setMaxBounds(sw: [number, number], ne: [number, number]): void;
    getBoundsZoom(sw: [number, number], ne: [number, number]): number;
    setZoom(zoom: number): void;
    setMinZoom(zoom: number): void;
    getBounds(): { sw: [number, number]; ne: [number, number] };
    createPopup(latLng: [number, number], element: HTMLElement): MapPopupHandle;
    addControl(position: ControlPosition, element: HTMLElement): WidgetHandle;
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

export interface GeoPosition {
    latLng: [number, number];
    accuracy: number;
}

export interface GeoLocationService {
    readonly isAvailable: boolean;
    watch(
        onPosition: (position: GeoPosition) => void,
        onDenied: () => void,
        onRecovered?: () => void
    ): () => void;
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

export interface PositionMarkerHandle extends MapLayerHandle {
    setLatLng(latLng: [number, number]): void;
}

export interface AccuracyRingHandle extends MapLayerHandle {
    setLatLng(latLng: [number, number]): void;
    setRadius(radiusMeters: number): void;
}

export interface DraggableMarkerHandle extends MapLayerHandle {
    setLatLng(latLng: [number, number]): void;
    onDrag(handler: (latLng: [number, number]) => void): () => void;
    onDragEnd(handler: (latLng: [number, number]) => void): () => void;
}

export interface ClickableMapLayerHandle extends MapLayerHandle {
    onClick: (handler: () => void) => void;
    onContextMenu: (handler: () => void) => void;
    setRadius(r: number): void;
}

export interface CircleMarkerOptions {
    title?: string,
    label?: string;
    className?: string;
    radius?: number;
    color?: string;
    weight?: number;
    fillColor?: string;
    fillOpacity?: number;
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
    gradient?: Record<number, string>;
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
    createPositionMarker(latLng: [number, number]): PositionMarkerHandle;
    createAccuracyRing(latLng: [number, number], radiusMeters: number): AccuracyRingHandle;
}


export interface WidgetHandle {
    addTo(map: MapHandle): void;
    remove(): void;
}

export interface GeoLocationWidgetHandle extends WidgetHandle {
    setAvailable(available: boolean): void;
    setFollowing(following: boolean): void;
}

export interface JsonEditor {
    getJson(): Record<string, unknown>;
    destroy(): void;
}

export interface JsonEditorFactory {
    create(container: HTMLElement, initialJson: Record<string, unknown>): Promise<JsonEditor>;
}

export interface DesignToolbarButton {
    iconUrl: string;
    title: string;
    onClick: (setActive: (active: boolean) => void) => void;
}

export interface LayerSelectionWidgetItem {
    id: string;
    name: string;
    color: string;
    visible: boolean;
}

export interface UserPointsStore {
    getPoints(areaId: string): Promise<unknown>;
    getPointsSync?(areaId: string): unknown;
    addPoint(areaId: string, lat: number, lon: number, pressure: number, poiProperties?: Record<string, unknown>): Promise<void>;
    removePoint(areaId: string, lon: number, lat: number): Promise<void>;
}

export interface WidgetFactory {
    createSummaryWidget(
        label: string,
        onClick: () => void
    ): WidgetHandle;

    createMapLayerFlyout(
        layers: LayerSelectionWidgetItem[],
        onToggle: (layerId: string, visible: boolean) => void,
        onExportUserPoints?: () => void
    ): WidgetHandle;

    createDesignToolbar(buttons: DesignToolbarButton[]): WidgetHandle;

    createNamePromptPopup(
        latLng: [number, number],
        onCommit: (name: string) => void,
        onDiscard: () => void
    ): WidgetHandle;

    createGeoLocationWidget(
        available: boolean,
        onToggle: () => void
    ): GeoLocationWidgetHandle;
}
