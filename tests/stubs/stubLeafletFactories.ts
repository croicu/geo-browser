import type {
    ClickableMapLayerHandle,
    HeatLayerOptions,
    LayerFactory,
    LayerSelectionWidgetItem,
    MapFactory,
    MapHandle,
    MapLayerHandle,
    WidgetFactory,
    WidgetHandle,
} from "../../src/contracts";
import type { HeatPoint } from "../../src/protocols";

export class StubMap implements MapHandle {
    public removeCalled = false;
    private _clickHandler?: (latLng: [number, number]) => void;
    private _moveEndHandler?: () => void;

    remove(): void {
        this.removeCalled = true;
    }

    getCenter(): [number, number] {
        return [0, 0];
    }

    getZoom(): number {
        return 3;
    }

    onZoom(_handler: (zoom: number) => void): () => void {
        return () => {};
    }

    onMoveEnd(handler: () => void): () => void {
        this._moveEndHandler = handler;
        return () => { this._moveEndHandler = undefined; };
    }

    onClick(handler: (latLng: [number, number]) => void): () => void {
        this._clickHandler = handler;
        return () => { this._clickHandler = undefined; };
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

export class StubLayerFactory implements LayerFactory {
    public readonly markers: StubMarker[] = [];

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
}
