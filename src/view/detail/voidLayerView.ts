import { getLogger } from "../../services";
import { LayerView } from "./layerView";

const FILL_COLOR = "#4a5568";
const FILL_OPACITY = 0.80;
const PANE_NAME = "void-pane";
const BLUR_PX = 5;

// Renders one precomputed __void__* GeoJSON polygon (fetched via the GeoLayer passed in by
// DetailView, already resolved to the right variant — see VoidVariantResolver). No client-side
// computation; see docs/LAYERS.md for the full contract.
export class VoidLayerView extends LayerView {
    get layerId(): string {
        return this._layer.id;
    }

    async render(): Promise<void> {
        const log = getLogger();
        log.info("void_layer.render.start", { layerId: this._layer.id });

        try {
            await this._layer.load();

            const style = this._layer.style;
            const pane = this._map.createPane(PANE_NAME);
            const polygon = this._layerFactory.createGeoJsonPolygon(this._layer.payload, {
                fillColor: style?.color ?? FILL_COLOR,
                fillOpacity: style?.opacity ?? FILL_OPACITY,
                pane: PANE_NAME,
            });
            this.setGroup(polygon);
            this.applyBlur(pane);

            log.info("void_layer.render.end", { layerId: this._layer.id });
        } catch (e) {
            log.error("void_layer.render.error", e as Error);
        }
    }

    // Leaflet pane divs are zero-size positioning wrappers — their real content is an
    // absolutely-positioned SVG child that overflows the pane's own box. A CSS filter applied
    // directly to the zero-size pane rasterizes to that empty box and clips the overflowing
    // SVG entirely (bit us once already with this layer's previous canvas-renderer version),
    // so the blur is applied to the SVG element itself, which the polygon render above just
    // created synchronously.
    private applyBlur(pane: HTMLElement): void {
        const svg = pane.querySelector("svg");
        if (svg) {
            svg.style.filter = `blur(${BLUR_PX}px)`;
        }
    }
}
