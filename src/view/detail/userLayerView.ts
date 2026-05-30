import type { UserPointsStore } from "../../contracts";
import type { ClickableMapLayerHandle, LayerFactory, MapHandle } from "../../contracts";
import { GeoLayer } from "../../catalog/layer";
import { fail } from "../../errors";
import { getLogger } from "../../services";
import { LayerView } from "./layerView";

const DEFAULT_COLOR = "#6c757d";
const PRESSURE_L_DELTA = 10; // max lightness shift; pressure=0.5 → no shift, 0 → +10, 1 → -10

function hexToHsl(hex: string): [number, number, number] | undefined {
    const clean = hex.startsWith("#") ? hex.slice(1) : hex;
    if (clean.length !== 6) return undefined;
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, Math.round(l * 100)];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h: number;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
    return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function pressureToColor(baseColor: string | undefined, pressure: number): string {
    const log = getLogger();
    if (baseColor === undefined) {
        log.warning("user_layer.color.fallback", { reason: "style.color missing from layer — __user__ entry absent from manifest or synthesized without color", fallback: DEFAULT_COLOR });
    }
    const resolved = baseColor ?? DEFAULT_COLOR;
    const hsl = hexToHsl(resolved);
    if (!hsl) {
        log.warning("user_layer.color.invalid_hex", { color: resolved, fallback: resolved });
        return resolved;
    }
    const [h, s, l] = hsl;
    const shift = (0.5 - pressure) * (PRESSURE_L_DELTA * 2);
    const newL = Math.max(0, Math.min(100, Math.round(l + shift)));
    return `hsl(${h}, ${s}%, ${newL}%)`;
}

function readPressure(props: Record<string, unknown> | undefined): number {
    const p = props?.pressure;
    return typeof p === "number" ? Math.max(0, Math.min(1, p)) : 0.5;
}

export class UserLayerView extends LayerView {
    private readonly _store: UserPointsStore;
    private readonly _areaId: string;
    private _markers: ClickableMapLayerHandle[] = [];
    private _featureCount = 0;

    constructor(
        map: MapHandle,
        layer: GeoLayer,
        layerFactory: LayerFactory,
        store: UserPointsStore,
        areaId: string,
    ) {
        super(map, layer, layerFactory);
        this._store = store;
        this._areaId = areaId;
    }

    get featureCount(): number {
        return this._featureCount;
    }

    async render(): Promise<void> {
        const log = getLogger();
        log.info("user_layer.render.start", { areaId: this._areaId, color: this._layer.style?.color ?? "(none — will use default)" });

        const payload = await this._store.getPoints(this._areaId);

        if (!this.isFeatureCollection(payload)) {
            fail("user_layer.invalid_payload", "UserPointsStore returned invalid FeatureCollection.", undefined, {
                areaId: this._areaId,
            });
        }

        this.destroyMarkers();

        for (const feature of payload.features) {
            if (!this.isPointFeature(feature)) continue;
            const pressure = readPressure(feature.properties);
            this.placeMarker(feature.geometry.coordinates, pressure);
        }

        this._featureCount = this._markers.length;
        log.info("user_layer.render.end", { areaId: this._areaId, count: this._featureCount });
    }

    addMarker(latLng: [number, number], pressure: number): void {
        // latLng is [lat, lon]; GeoJSON coordinates are [lon, lat]
        this.placeMarker([latLng[1], latLng[0]], pressure);
        this._featureCount++;
    }

    override destroy(): void {
        this.destroyMarkers();
    }

    private placeMarker(geoJsonCoords: [number, number], pressure: number): void {
        const latLng = this.geoJsonPointToLatLng(geoJsonCoords);
        const color = pressureToColor(this._layer.style?.color, pressure);
        const radius = this._layer.style?.radius ?? 6;

        const marker = this._layerFactory.createCircleMarker(latLng, {
            fillColor: color,
            color,
            opacity: this._layer.style?.opacity ?? 0.85,
            radius,
            weight: 0,
        });

        marker.addTo(this._map);
        this._markers.push(marker);
    }

    private destroyMarkers(): void {
        for (const m of this._markers) {
            m.remove();
        }
        this._markers = [];
    }
}
