import { GeoArea } from "../../catalog/area";
import type { ClickableMapLayerHandle, LayerFactory, MapHandle, RectangleHandle } from "../../contracts";
import type { AreaRenderKind } from "./areaLifecycleTracker";
import { AreaRenderClassifier } from "./areaRenderClassifier";

export interface AreaMarkerViewOptions {
    onSelected?: (area: GeoArea) => void;
}

// Successor of BubbleWidget: renders exactly one of {circle, outline, nothing}
// for a single catalog area, per tasks/layer_lifecycle.md's Rendering States.
// "loaded" renders nothing here — AreaBaseLayerRenderer takes over the visual
// space once real data is shown. Both circle and outline are tappable
// (confirmed tap-to-jump behavior): tapping pans/zooms the shared map to fit
// the area's bbox, letting AreaLifecycleTracker naturally promote it to
// current on the next viewport recompute.
export class AreaMarkerView {
    private readonly _map: MapHandle;
    private readonly _area: GeoArea;
    private readonly _layerFactory: LayerFactory;
    private readonly _options: AreaMarkerViewOptions;

    private _circle?: ClickableMapLayerHandle;
    private _outline?: RectangleHandle;

    constructor(
        map: MapHandle,
        area: GeoArea,
        layerFactory: LayerFactory,
        options: AreaMarkerViewOptions = {}
    ) {
        this._map = map;
        this._area = area;
        this._layerFactory = layerFactory;
        this._options = options;
    }

    get areaId(): string {
        return this._area.id;
    }

    render(kind: AreaRenderKind): void {
        this.update(kind);
    }

    destroy(): void {
        this._circle?.remove();
        this._circle = undefined;
        this._outline?.remove();
        this._outline = undefined;
    }

    update(kind: AreaRenderKind): void {
        if (kind === "circle") {
            this._outline?.remove();
            this.ensureCircle();
        } else if (kind === "outline") {
            this._circle?.remove();
            this.ensureOutline();
        } else {
            this._circle?.remove();
            this._outline?.remove();
        }
    }

    private ensureCircle(): void {
        if (this._circle) {
            this._circle.addTo(this._map);
            return;
        }

        // Fixed screen-pixel diameter (AreaRenderClassifier.LOAD_THRESHOLD_PX),
        // never rescaled on zoom -- an area that's collapsed to a circle stays
        // exactly N px wide no matter how far you zoom out from here (see
        // tasks/layer_lifecycle.md). Circumference only, no fill, same color
        // as the bbox outline it stands in for.
        const circle = this._layerFactory.createCircleMarker(this._area.center, {
            radius: AreaRenderClassifier.LOAD_THRESHOLD_PX / 2,
            color: "#3388ff",
            fillOpacity: 0,
            opacity: 1,
            weight: 2,
            title: this._area.summary.name,
            label: this._area.summary.name,
        });
        circle.addTo(this._map);
        circle.onClick(() => this._options.onSelected?.(this._area));
        this._circle = circle;
    }

    private ensureOutline(): void {
        if (this._outline) {
            this._outline.addTo(this._map);
            return;
        }

        const [west, south, east, north] = this._area.bbox;
        const outline = this._layerFactory.createRectangle(
            [[south, west], [north, east]],
            { color: "#3388ff", weight: 1, fillColor: "#3388ff", fillOpacity: 0, interactive: true }
        );
        outline.addTo(this._map);
        outline.onClick(() => this._options.onSelected?.(this._area));
        this._outline = outline;
    }
}
