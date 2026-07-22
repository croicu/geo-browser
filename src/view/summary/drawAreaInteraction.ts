import type { LayerFactory, MapHandle, RectangleHandle } from "../../contracts";

export class DrawAreaInteraction {
    private readonly _map: MapHandle;
    private readonly _layerFactory: LayerFactory;
    private readonly _onComplete: (bbox: [number, number, number, number]) => void;

    private _startLatLng?: [number, number];
    private _rect?: RectangleHandle;
    private readonly _cleanups: (() => void)[] = [];

    constructor(
        map: MapHandle,
        layerFactory: LayerFactory,
        onComplete: (bbox: [number, number, number, number]) => void
    ) {
        this._map = map;
        this._layerFactory = layerFactory;
        this._onComplete = onComplete;
    }

    start(): void {
        this._map.setCursor("crosshair");
        this._map.disableDrag();

        this._cleanups.push(
            this._map.onMouseDown(latLng => this.onMouseDown(latLng)),
            this._map.onMouseMove(latLng => this.onMouseMove(latLng)),
            this._map.onMouseUp(latLng => this.onMouseUp(latLng)),
        );
    }

    stop(): void {
        this._map.setCursor("");
        this._map.enableDrag();

        for (const cleanup of this._cleanups) {
            cleanup();
        }
        this._cleanups.length = 0;

        this._rect?.remove();
        this._rect = undefined;
        this._startLatLng = undefined;
    }

    private onMouseDown(latLng: [number, number]): void {
        this._startLatLng = latLng;
    }

    private onMouseMove(latLng: [number, number]): void {
        if (!this._startLatLng) {
            return;
        }

        const [west, south, east, north] = this.computeBbox(this._startLatLng, latLng);

        if (!this._rect) {
            this._rect = this._layerFactory.createRectangle(
                [[south, west], [north, east]],
                { color: "#3388ff", weight: 2, fillColor: "#3388ff", fillOpacity: 0.1, interactive: false }
            );
            this._rect.addTo(this._map);
        } else {
            this._rect.setBounds([[south, west], [north, east]]);
        }
    }

    private onMouseUp(latLng: [number, number]): void {
        const startLatLng = this._startLatLng;
        if (!startLatLng) {
            return;
        }

        const bbox = this.computeBbox(startLatLng, latLng);
        this.stop();
        this._onComplete(bbox);
    }

    private computeBbox(
        a: [number, number],
        b: [number, number]
    ): [number, number, number, number] {
        return [
            Math.min(a[1], b[1]), // west
            Math.min(a[0], b[0]), // south
            Math.max(a[1], b[1]), // east
            Math.max(a[0], b[0]), // north
        ];
    }
}
