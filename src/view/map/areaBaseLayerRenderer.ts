import type { GeoArea } from "../../catalog/area";
import type { LayerFactory, MapHandle } from "../../contracts";
import { getLogger } from "../../services";
import { LogCategory } from "../../logging";
import { HeatLayerView } from "../detail/heatLayerView";
import type { LayerView } from "../detail/layerView";
import { PointLayerView } from "../detail/pointLayerView";

export interface AreaBaseLayerRendererOptions {
    isLayerVisible?: (layerId: string, defaultVisible: boolean) => boolean;
}

// One instance per currently-resident (loaded) area — wraps the base-layer
// half of the old DetailView.renderLayerViews() loop: manifest-declared
// heatmap/circle layers only (GeoLayer.isSourceData()). Virtual layers
// (__poi__/__user__/__void__/__search__) are CurrentAreaBundle's concern, not
// this class's — per tasks/layer_lifecycle.md, any number of
// AreaBaseLayerRenderer instances can be concurrently resident (one per
// loaded area), but only one CurrentAreaBundle ever exists at a time.
export class AreaBaseLayerRenderer {
    private readonly _map: MapHandle;
    private readonly _area: GeoArea;
    private readonly _layerFactory: LayerFactory;
    private readonly _isLayerVisible: (layerId: string, defaultVisible: boolean) => boolean;
    private readonly _layerViews = new Map<string, LayerView>();

    private _zoomCleanup?: () => void;
    // Guards sync() while hidden — its own zoomend listener runs independently
    // of MapView's hide()/show() calls, so without this a hidden area's layer
    // can cross its own minZoom threshold on a later zoom and get silently
    // rebuilt+re-attached to the map, defeating the whole point of hide().
    private _isHidden = false;

    constructor(
        map: MapHandle,
        area: GeoArea,
        layerFactory: LayerFactory,
        options: AreaBaseLayerRendererOptions = {}
    ) {
        this._map = map;
        this._area = area;
        this._layerFactory = layerFactory;
        this._isLayerVisible = options.isLayerVisible ?? ((_id, defaultVisible) => defaultVisible);
    }

    get areaId(): string {
        return this._area.id;
    }

    async render(): Promise<void> {
        await this._area.load();
        this._zoomCleanup ??= this._map.onZoom(() => { void this.sync(); });
        await this.sync();
    }

    // Re-evaluates every base layer's visible-and-above-minZoom state and
    // builds/destroys LayerView instances accordingly, awaiting any newly
    // built views' render() so callers can rely on completion. This is the
    // manual toggle/rebuild path carried over from DetailView — distinct
    // from hide()/show() below, which never rebuild.
    async sync(): Promise<void> {
        if (this._isHidden) {
            return;
        }

        const zoom = this._map.getZoom();
        const pending: Promise<void>[] = [];

        for (const layer of this._area.layers) {
            if (!layer.isSourceData()) {
                continue;
            }

            const existing = this._layerViews.get(layer.id);
            const minZoom = layer.style?.minZoom;
            const visible = this._isLayerVisible(layer.id, layer.isVisible())
                && (minZoom === undefined || zoom >= minZoom);

            if (visible && !existing) {
                const layerView = layer.isHeatmap()
                    ? new HeatLayerView(this._map, layer, this._layerFactory)
                    : new PointLayerView(this._map, layer, this._layerFactory);
                this._layerViews.set(layer.id, layerView);
                pending.push(layerView.render());
            } else if (!visible && existing) {
                existing.destroy();
                this._layerViews.delete(layer.id);
            }
        }

        await Promise.all(pending);
    }

    // Viewport-residency hide/show (Discard Lifecycle) — instant, Leaflet-only,
    // keeps every LayerView and its parsed GeoJSON fully resident. Distinct
    // from destroy() below.
    hide(): void {
        getLogger().info("area_base_layers.hide", { areaId: this._area.id, layerIds: [...this._layerViews.keys()] }, LogCategory.AreaLifecycle);
        this._isHidden = true;
        for (const layerView of this._layerViews.values()) {
            layerView.hide();
        }
    }

    show(): void {
        getLogger().info("area_base_layers.show", { areaId: this._area.id, layerIds: [...this._layerViews.keys()] }, LogCategory.AreaLifecycle);
        this._isHidden = false;
        for (const layerView of this._layerViews.values()) {
            layerView.show();
        }
        void this.sync(); // pick up any visibility/minZoom changes made while hidden
    }

    // Destroy (deferred, per Discard Lifecycle) — drops parsed GeoJSON via
    // GeoLayer.invalidate() and tears down every LayerView. Only ever called
    // by MapView as a side effect of loading a genuinely new area.
    destroy(): void {
        getLogger().info("area_base_layers.destroy", { areaId: this._area.id, layerIds: [...this._layerViews.keys()] }, LogCategory.AreaLifecycle);
        this._zoomCleanup?.();
        this._zoomCleanup = undefined;

        for (const layerView of this._layerViews.values()) {
            layerView.destroy();
        }
        this._layerViews.clear();

        for (const layer of this._area.layers) {
            layer.invalidate();
        }
    }
}
