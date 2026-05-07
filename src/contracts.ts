
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

    zoomIn(): void;
    zoomOut(): void;
    setZoom(zoomLevel: number): void;
}

export interface ControllerState {
    get zoom(): number;
    get minZoom(): number;
    get maxZoom(): number;
}

export interface MapHandle {
    remove(): void;
}

export interface MapFactory {
    createMap(root: HTMLElement, center: [number, number], zoom: number): MapHandle;
}

export interface MapLayerHandle {
    addTo(map: MapHandle): void;
    remove(): void;
}

export interface CircleMarkerOptions {
    radius: number;
    color?: string;
    opacity: number;
    fillOpacity: number;
}

export interface LayerFactory {
    createLayerGroup(): MapLayerHandle;
    createCircleMarker(
        latLng: [number, number],
        options: CircleMarkerOptions
    ): MapLayerHandle;
}

export interface WidgetHandle {
    addTo(map: MapHandle): void;
    remove(): void;
}

export interface WidgetFactory {
    createSummaryWidget(
        label: string,
        onClick: () => void
    ): WidgetHandle;
}
