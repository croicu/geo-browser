// view/summary/bboxWidget.ts

import type {
    DraggableMarkerHandle,
    GatewayService,
    LayerFactory,
    MapHandle,
    RectangleHandle,
} from "../../contracts";
import { SetAreaBbox, OK } from "../../api";
import type { SetAreaBboxOutput } from "../../api";
import { getLogger } from "../../services";

// Corner order: NW=0, NE=1, SW=2, SE=3
// NW=[north,west]  NE=[north,east]  SW=[south,west]  SE=[south,east]

const MIN_SIZE_PX = 50;

export class BboxWidget {
    private readonly _map: MapHandle;
    private readonly _layerFactory: LayerFactory;
    private readonly _gateway: GatewayService;
    private readonly _areaId: string;

    private _bbox: [number, number, number, number];
    private _rect?: RectangleHandle;
    private readonly _handles: DraggableMarkerHandle[] = [];
    private readonly _cleanups: (() => void)[] = [];
    private _shown = false;
    private _zoomCleanup?: () => void;

    constructor(
        map: MapHandle,
        layerFactory: LayerFactory,
        gateway: GatewayService,
        areaId: string,
        bbox: [number, number, number, number]
    ) {
        this._map = map;
        this._layerFactory = layerFactory;
        this._gateway = gateway;
        this._areaId = areaId;
        this._bbox = bbox;
    }

    render(): void {
        if (this._rect) {
            return;
        }

        const [west, south, east, north] = this._bbox;

        this._rect = this._layerFactory.createRectangle(
            [[south, west], [north, east]],
            { color: "#595959", weight: 5, fillColor: "#cccccc", fillOpacity: 0 }
        );

        const corners: [number, number][] = [
            [north, west], // NW - 0
            [north, east], // NE - 1
            [south, west], // SW - 2
            [south, east], // SE - 3
        ];

        for (let i = 0; i < 4; i++) {
            const handle = this._layerFactory.createDraggableMarker(corners[i]);
            this._handles.push(handle);

            const idx = i;
            this._cleanups.push(handle.onDrag(latLng => this.onHandleDrag(idx, latLng)));
            this._cleanups.push(handle.onDragEnd(() => this.onHandleDragEnd()));
        }

        this._zoomCleanup = this._map.onZoom(zoom => this.applyZoom(zoom));
        this.applyZoom(this._map.getZoom());
    }

    destroy(): void {
        this._zoomCleanup?.();
        this._zoomCleanup = undefined;

        for (const cleanup of this._cleanups) {
            cleanup();
        }
        this._cleanups.length = 0;

        for (const handle of this._handles) {
            handle.remove();
        }
        this._handles.length = 0;

        this._rect?.remove();
        this._rect = undefined;
        this._shown = false;
    }

    private applyZoom(zoom: number): void {
        const visible = this.computeSizePx(zoom) >= MIN_SIZE_PX;
        if (visible === this._shown) {
            return;
        }
        this._shown = visible;

        if (visible) {
            this._rect?.addTo(this._map);
            for (const handle of this._handles) {
                handle.addTo(this._map);
            }
        } else {
            this._rect?.remove();
            for (const handle of this._handles) {
                handle.remove();
            }
        }
    }

    private onHandleDrag(cornerIndex: number, latLng: [number, number]): void {
        this._bbox = this.applyCorner(cornerIndex, latLng);
        this.updateRect();
        this.syncHandles(cornerIndex);
    }

    private onHandleDragEnd(): void {
        this._gateway.invoke(
            SetAreaBbox,
            { areaId: this._areaId, bbox: this._bbox },
            response => this.onSaveResponse(response)
        );
    }

    private onSaveResponse(response: SetAreaBboxOutput): void {
        if (response.error !== OK) {
            getLogger().warning("bbox.save_failed", {
                areaId: this._areaId,
                error: response.error,
                detail: response.errorDescription,
            });
        }
    }

    private applyCorner(
        cornerIndex: number,
        latLng: [number, number]
    ): [number, number, number, number] {
        let [west, south, east, north] = this._bbox;
        const [lat, lng] = latLng;

        if (cornerIndex === 0) { north = lat; west = lng; }
        else if (cornerIndex === 1) { north = lat; east = lng; }
        else if (cornerIndex === 2) { south = lat; west = lng; }
        else if (cornerIndex === 3) { south = lat; east = lng; }

        return [west, south, east, north];
    }

    private updateRect(): void {
        const [west, south, east, north] = this._bbox;
        this._rect?.setBounds([[south, west], [north, east]]);
    }

    private computeSizePx(zoom: number): number {
        const [west, south, east, north] = this._bbox;
        const centerLat = (south + north) / 2;
        const metersPerPx = 40075016.686 * Math.abs(Math.cos(centerLat * Math.PI / 180)) / Math.pow(2, zoom + 8);
        const widthPx = (east - west) * 111320 * Math.abs(Math.cos(centerLat * Math.PI / 180)) / metersPerPx;
        const heightPx = (north - south) * 111320 / metersPerPx;
        return Math.min(widthPx, heightPx);
    }

    private syncHandles(movedIndex: number): void {
        const [west, south, east, north] = this._bbox;
        const positions: [number, number][] = [
            [north, west], // NW - 0
            [north, east], // NE - 1
            [south, west], // SW - 2
            [south, east], // SE - 3
        ];

        for (let i = 0; i < 4; i++) {
            if (i !== movedIndex) {
                this._handles[i].setLatLng(positions[i]);
            }
        }
    }
}
