import type {
    ClickableMapLayerHandle,
    DesignToolbarButton,
    DraggableMarkerHandle,
    HeatLayerOptions,
    LayerFactory,
    LayerSelectionWidgetItem,
    MapFactory,
    MapHandle,
    MapLayerHandle,
    RectangleHandle,
    RectangleOptions,
    WidgetFactory,
    WidgetHandle,
} from "../../src/contracts";
import type { HeatPoint } from "../../src/protocols";

export class StubMap implements MapHandle {
    public removeCalled = false;
    private _zoom = 8;
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

    setCursor(_cursor: string): void {}
    disableDrag(): void {}
    enableDrag(): void {}

    onMouseDown(_handler: (latLng: [number, number]) => void): () => void {
        return () => {};
    }

    onMouseMove(_handler: (latLng: [number, number]) => void): () => void {
        return () => {};
    }

    onMouseUp(_handler: (latLng: [number, number]) => void): () => void {
        return () => {};
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

export class StubWidgetFactory implements WidgetFactory {
    createSummaryWidget(_label: string, _onClick: () => void): WidgetHandle {
        return new StubWidget();
    }

    createLayerSelectionWidget(
        _layers: LayerSelectionWidgetItem[],
        _onToggle: (layerId: string, visible: boolean) => void
    ): WidgetHandle {
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
}
