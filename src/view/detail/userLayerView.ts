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
    const p = props?.pressure ?? props?.weight;
    return typeof p === "number" ? Math.max(0, Math.min(1, p)) : 0.5;
}

interface UserMarker {
    handle: ClickableMapLayerHandle;
    lon: number;
    lat: number;
}

export class UserLayerView extends LayerView {
    private readonly _store: UserPointsStore;
    private readonly _areaId: string;
    private readonly _onPointDeleted: (() => void) | undefined;
    private _markers: UserMarker[] = [];
    private _visible: boolean;
    private _lastPayload: unknown = null;
    private _stopWatchingZoom?: () => void;

    constructor(
        map: MapHandle,
        layer: GeoLayer,
        layerFactory: LayerFactory,
        store: UserPointsStore,
        areaId: string,
        visible: boolean = true,
        onPointDeleted?: () => void,
    ) {
        super(map, layer, layerFactory);
        this._store = store;
        this._areaId = areaId;
        this._visible = visible;
        this._onPointDeleted = onPointDeleted;
    }

    setVisible(visible: boolean): void {
        if (visible === this._visible) {
            return;
        }
        this._visible = visible;
        for (const m of this._markers) {
            if (visible) {
                m.handle.addTo(this._map);
            } else {
                m.handle.remove();
            }
        }
    }

    get featureCount(): number {
        return this._markers.length;
    }

    get lastPayload(): unknown {
        return this._lastPayload;
    }

    async render(): Promise<void> {
        const log = getLogger();
        log.info("user_layer.render.start", { areaId: this._areaId, color: this._layer.style?.color ?? "(none — will use default)" });
        if (!this._stopWatchingZoom) {
            this._stopWatchingZoom = this._map.onZoom(zoom => this.onZoom(zoom));
        }

        const payload = await this._store.getPoints(this._areaId);
        this._lastPayload = payload;

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

        log.info("user_layer.render.end", { areaId: this._areaId, count: this._markers.length });
    }

    addMarker(latLng: [number, number], pressure: number): void {
        // latLng is [lat, lon]; GeoJSON coordinates are [lon, lat]
        this.placeMarker([latLng[1], latLng[0]], pressure);
    }

    override destroy(): void {
        this._stopWatchingZoom?.();
        this._stopWatchingZoom = undefined;
        this.destroyMarkers();
    }

    private effectiveRadius(zoom: number): number {
        const config = this._layer.style?.radius ?? 6;
        return Math.min(config, Math.max(2, zoom - 6));
    }

    private onZoom(zoom: number): void {
        const r = this.effectiveRadius(zoom);
        for (const m of this._markers) {
            m.handle.setRadius(r);
        }
    }

    private placeMarker(geoJsonCoords: [number, number], pressure: number): void {
        const [lon, lat] = geoJsonCoords;
        const leafletLatLng = this.geoJsonPointToLatLng(geoJsonCoords);
        const color = pressureToColor(this._layer.style?.color, pressure);
        const radius = this.effectiveRadius(this._map.getZoom());

        const handle = this._layerFactory.createCircleMarker(leafletLatLng, {
            fillColor: color,
            color,
            opacity: this._layer.style?.opacity ?? 0.85,
            radius,
            weight: 0,
        });

        handle.onContextMenu(() => this.deleteMarker(lon, lat));

        if (this._visible) {
            handle.addTo(this._map);
        }
        this._markers.push({ handle, lon, lat });
    }

    private deleteMarker(lon: number, lat: number): void {
        const log = getLogger();
        log.info("user_layer.delete_point.start", { lon, lat });

        const idx = this._markers.findIndex(m => m.lon === lon && m.lat === lat);
        if (idx === -1) {
            log.warning("user_layer.delete_point.not_found", { lon, lat });
            return;
        }

        this._markers[idx].handle.remove();
        this._markers.splice(idx, 1);

        void this._store.removePoint(this._areaId, lon, lat);
        log.info("user_layer.delete_point.end", { lon, lat, remaining: this._markers.length });

        this._onPointDeleted?.();
    }

    private destroyMarkers(): void {
        for (const m of this._markers) {
            m.handle.remove();
        }
        this._markers = [];
    }
}
