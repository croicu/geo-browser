import type { ClickableMapLayerHandle, LayerFactory, MapHandle } from "../../contracts";
import { getLogger } from "../../services";

export class SearchLayerView {
    private readonly _map: MapHandle;
    private readonly _layerFactory: LayerFactory;
    private readonly _color: string;
    private readonly _onTap: (latLng: [number, number], displayName: string) => void;
    private _marker?: ClickableMapLayerHandle;

    constructor(
        map: MapHandle,
        layerFactory: LayerFactory,
        color: string,
        onTap: (latLng: [number, number], displayName: string) => void
    ) {
        this._map = map;
        this._layerFactory = layerFactory;
        this._color = color;
        this._onTap = onTap;
    }

    setResult(latLng: [number, number], displayName: string): void {
        const log = getLogger();
        log.info("search_layer.set_result.start", { displayName });
        this.clear();
        const label = displayName.length > 50 ? displayName.slice(0, 50) + "…" : displayName;
        const marker = this._layerFactory.createCircleMarker(latLng, {
            radius: 10,
            color: this._color,
            weight: 3,
            fillColor: this._color,
            fillOpacity: 0.25,
            opacity: 1.0,
            label,
        });
        marker.addTo(this._map);
        marker.onClick(() => {
            log.info("search_layer.marker.tap", { displayName });
            this._onTap(latLng, displayName);
        });
        this._marker = marker;
        log.info("search_layer.set_result.end", { displayName });
    }

    clear(): void {
        if (this._marker) {
            this._marker.remove();
            this._marker = undefined;
        }
    }

    destroy(): void {
        this.clear();
    }
}
