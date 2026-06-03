import type {
    AccuracyRingHandle,
    ClickableMapLayerHandle,
    DesignToolbarButton,
    DraggableMarkerHandle,
    GeoLocationWidgetHandle,
    HeatLayerOptions,
    LayerFactory,
    LayerSelectionWidgetItem,
    MapFactory,
    MapHandle,
    MapLayerHandle,
    MapPopupHandle,
    PositionMarkerHandle,
    RectangleHandle,
    RectangleOptions,
    WidgetFactory,
    WidgetHandle,
} from "../../src/contracts";
import type { HeatPoint } from "../../src/protocols";

export class StubMapPopupHandle implements MapPopupHandle {
    public latLng: [number, number];
    public element: HTMLElement;
    public removed = false;

    constructor(latLng: [number, number], element: HTMLElement) {
        this.latLng = latLng;
        this.element = element;
    }

    update(element: HTMLElement): void {
        this.element = element;
    }

    remove(): void {
        this.removed = true;
    }
}

export class StubMap implements MapHandle {
    public removeCalled = false;
    private _zoom = 8;
    private readonly _container = document.createElement("div");
    private _clickHandler?: (latLng: [number, number]) => void;
    private _moveEndHandler?: () => void;
    private readonly _zoomHandlers: ((zoom: number) => void)[] = [];

    remove(): void {
        this.removeCalled = true;
    }

    getCenter(): [number, number] {
        return [0, 0];
    }

    getZoom(): number {
        return this._zoom;
    }

    onZoom(handler: (zoom: number) => void): () => void {
        this._zoomHandlers.push(handler);
        return () => {
            const idx = this._zoomHandlers.indexOf(handler);
            if (idx >= 0) { this._zoomHandlers.splice(idx, 1); }
        };
    }

    onMoveEnd(handler: () => void): () => void {
        this._moveEndHandler = handler;
        return () => { this._moveEndHandler = undefined; };
    }

    onClick(handler: (latLng: [number, number]) => void): () => void {
        this._clickHandler = handler;
        return () => { this._clickHandler = undefined; };
    }

    getContainer(): HTMLElement {
        return this._container;
    }

    panTo(_latLng: [number, number]): void {}
    setCursor(_cursor: string): void {}
    disableDrag(): void {}
    enableDrag(): void {}
    setMaxBounds(_sw: [number, number], _ne: [number, number]): void {}
    getBoundsZoom(_sw: [number, number], _ne: [number, number]): number { return 10; }
    setZoom(zoom: number): void { this._zoom = zoom; }
    setMinZoom(_zoom: number): void {}
    public boundsResult = { sw: [0, 0] as [number, number], ne: [1, 1] as [number, number] };
    getBounds(): { sw: [number, number]; ne: [number, number] } { return this.boundsResult; }

    onMouseDown(_handler: (latLng: [number, number]) => void): () => void {
        return () => {};
    }

    onMouseMove(_handler: (latLng: [number, number]) => void): () => void {
        return () => {};
    }

    onMouseUp(_handler: (latLng: [number, number]) => void): () => void {
        return () => {};
    }

    onZoomAnim(_handler: (center: [number, number], zoom: number) => void): () => void {
        return () => {};
    }

    onMove(_handler: () => void): () => void {
        return () => {};
    }

    project(_latLng: [number, number], _zoom: number): [number, number] {
        return [0, 0];
    }

    addControl(_position: string, _element: HTMLElement): WidgetHandle {
        return new StubWidget();
    }

    latLngToContainerPoint(_latLng: [number, number]): [number, number] {
        return [0, 0];
    }

    containerPointToLatLng(_point: [number, number]): [number, number] {
        return [0, 0];
    }

    private _contextMenuHandler?: (latLng: [number, number]) => void;
    private _longPressHandler?: (latLng: [number, number], pressure: number) => void;
    public lastPopup?: StubMapPopupHandle;

    onContextMenu(handler: (latLng: [number, number]) => void): () => void {
        this._contextMenuHandler = handler;
        return () => { this._contextMenuHandler = undefined; };
    }

    onLongPress(handler: (latLng: [number, number], pressure: number) => void): () => void {
        this._longPressHandler = handler;
        return () => { this._longPressHandler = undefined; };
    }

    createPopup(latLng: [number, number], element: HTMLElement): MapPopupHandle {
        const popup = new StubMapPopupHandle(latLng, element);
        this.lastPopup = popup;
        return popup;
    }

    simulateContextMenu(latLng: [number, number]): void {
        this._contextMenuHandler?.(latLng);
    }

    simulateLongPress(latLng: [number, number], pressure = 0.5): void {
        this._longPressHandler?.(latLng, pressure);
    }

    simulateZoom(zoom: number): void {
        this._zoom = zoom;
        for (const h of this._zoomHandlers) { h(zoom); }
    }

    simulateClick(latLng: [number, number]): void {
        this._clickHandler?.(latLng);
    }

    simulateMoveEnd(): void {
        this._moveEndHandler?.();
    }
}

export class StubMapFactory implements MapFactory {
    public readonly map = new StubMap();

    createMap(): MapHandle {
        return this.map;
    }
}

export class StubMapLayerHandle implements MapLayerHandle {
    public addedTo?: MapHandle;
    public removed = false;

    addTo(map: MapHandle): void {
        this.addedTo = map;
    }

    remove(): void {
        this.removed = true;
    }
}

export class StubMarker implements ClickableMapLayerHandle {
    public addToMap?: MapHandle;
    public removeCalled = false;
    public clickHandler?: () => void;
    public radius?: number;

    addTo(map: MapHandle): void {
        this.addToMap = map;
    }

    remove(): void {
        this.removeCalled = true;
    }

    onClick(handler: () => void): void {
        this.clickHandler = handler;
    }

    onContextMenu(_handler: () => void): void {
        // no-op in stub
    }

    setRadius(r: number): void {
        this.radius = r;
    }
}

export class StubRectangle extends StubMapLayerHandle implements RectangleHandle {
    public lastBounds?: [[number, number], [number, number]];

    setBounds(bounds: [[number, number], [number, number]]): void {
        this.lastBounds = bounds;
    }
}

export class StubDraggableMarker extends StubMapLayerHandle implements DraggableMarkerHandle {
    public latLng?: [number, number];
    private _dragHandler?: (latLng: [number, number]) => void;
    private _dragEndHandler?: (latLng: [number, number]) => void;

    setLatLng(latLng: [number, number]): void {
        this.latLng = latLng;
    }

    onDrag(handler: (latLng: [number, number]) => void): () => void {
        this._dragHandler = handler;
        return () => { this._dragHandler = undefined; };
    }

    onDragEnd(handler: (latLng: [number, number]) => void): () => void {
        this._dragEndHandler = handler;
        return () => { this._dragEndHandler = undefined; };
    }

    simulateDrag(latLng: [number, number]): void {
        this._dragHandler?.(latLng);
    }

    simulateDragEnd(latLng: [number, number]): void {
        this._dragEndHandler?.(latLng);
    }
}

export class StubLayerFactory implements LayerFactory {
    public readonly markers: StubMarker[] = [];
    public readonly rectangles: StubRectangle[] = [];
    public readonly draggableMarkers: StubDraggableMarker[] = [];
    public readonly positionMarkers: StubPositionMarkerHandle[] = [];
    public readonly accuracyRings: StubAccuracyRingHandle[] = [];

    createLayerGroup(): MapLayerHandle {
        return new StubMapLayerHandle();
    }

    createCircleMarker(): ClickableMapLayerHandle {
        const marker = new StubMarker();
        this.markers.push(marker);
        return marker;
    }

    createGeoCircle(): ClickableMapLayerHandle {
        const marker = new StubMarker();
        this.markers.push(marker);
        return marker;
    }

    createHeatLayer(_points: HeatPoint[], _options: HeatLayerOptions): MapLayerHandle {
        return new StubMapLayerHandle();
    }

    createRectangle(_bounds: [[number, number], [number, number]], _options: RectangleOptions): RectangleHandle {
        const rect = new StubRectangle();
        this.rectangles.push(rect);
        return rect;
    }

    createDraggableMarker(_latLng: [number, number]): DraggableMarkerHandle {
        const marker = new StubDraggableMarker();
        this.draggableMarkers.push(marker);
        return marker;
    }

    createPositionMarker(_latLng: [number, number]): PositionMarkerHandle {
        const marker = new StubPositionMarkerHandle();
        this.positionMarkers.push(marker);
        return marker;
    }

    createAccuracyRing(_latLng: [number, number], _radiusMeters: number): AccuracyRingHandle {
        const ring = new StubAccuracyRingHandle();
        this.accuracyRings.push(ring);
        return ring;
    }
}

export class StubAccuracyRingHandle implements AccuracyRingHandle {
    public addedTo?: MapHandle;
    public removed = false;
    public latLng?: [number, number];
    public radius?: number;

    addTo(map: MapHandle): void {
        this.addedTo = map;
    }

    remove(): void {
        this.removed = true;
    }

    setLatLng(latLng: [number, number]): void {
        this.latLng = latLng;
    }

    setRadius(radiusMeters: number): void {
        this.radius = radiusMeters;
    }
}

export class StubPositionMarkerHandle implements PositionMarkerHandle {
    public addedTo?: MapHandle;
    public removed = false;
    public latLng?: [number, number];

    addTo(map: MapHandle): void {
        this.addedTo = map;
    }

    remove(): void {
        this.removed = true;
    }

    setLatLng(latLng: [number, number]): void {
        this.latLng = latLng;
    }
}

export class StubWidget implements WidgetHandle {
    public addedTo?: MapHandle;
    public removed = false;

    addTo(map: MapHandle): void {
        this.addedTo = map;
    }

    remove(): void {
        this.removed = true;
    }
}

export class StubGeoLocationWidgetHandle implements GeoLocationWidgetHandle {
    public addedTo?: MapHandle;
    public removed = false;
    public available = true;
    public following = false;

    addTo(map: MapHandle): void {
        this.addedTo = map;
    }

    remove(): void {
        this.removed = true;
    }

    setAvailable(available: boolean): void {
        this.available = available;
    }

    setFollowing(following: boolean): void {
        this.following = following;
    }
}

export class StubWidgetFactory implements WidgetFactory {
    public lastGeoLocationWidget?: StubGeoLocationWidgetHandle;
    public lastExportUserPoints?: () => void;

    createSummaryWidget(_label: string, _onClick: () => void): WidgetHandle {
        return new StubWidget();
    }

    createMapLayerFlyout(
        _layers: LayerSelectionWidgetItem[],
        _onToggle: (layerId: string, visible: boolean) => void,
        onExportUserPoints?: () => void
    ): WidgetHandle {
        this.lastExportUserPoints = onExportUserPoints;
        return new StubWidget();
    }

    createDesignToolbar(_buttons: DesignToolbarButton[]): WidgetHandle {
        return new StubWidget();
    }

    createNamePromptPopup(
        _latLng: [number, number],
        _onCommit: (name: string) => void,
        _onDiscard: () => void
    ): WidgetHandle {
        return new StubWidget();
    }

    createGeoLocationWidget(
        _available: boolean,
        _onToggle: () => void
    ): GeoLocationWidgetHandle {
        const handle = new StubGeoLocationWidgetHandle();
        this.lastGeoLocationWidget = handle;
        return handle;
    }
}
