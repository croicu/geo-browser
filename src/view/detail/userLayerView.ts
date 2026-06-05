import type { UserPointsStore } from "../../contracts";
import type { ClickableMapLayerHandle, LayerFactory, MapHandle } from "../../contracts";
import { GeoLayer } from "../../catalog/layer";
import { fail } from "../../errors";
import { getLogger } from "../../services";
import { LayerView } from "./layerView";
import type { StarCount } from "./starRatingControl";

const DEFAULT_COLOR = "#6c757d";
const DEFAULT_HIGHLIGHT_COLOR = "#cfba44";
const DEFAULT_BOOKMARK_COLOR = "#5AB5DA";
const PRESSURE_L_DELTA = 10;
 // max lightness shift; pressure=0.5 → no shift, 0 → +10, 1 → -10

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

function starRingColor(highlightColor: string, stars: StarCount): string {
    const hsl = hexToHsl(highlightColor);
    if (!hsl) return highlightColor;
    const [h, s, l] = hsl;
    // Atan curve: rises quickly then flattens, so 3- and 4-star read as nearly full color
    // while 1-star still bottoms out at black. k controls steepness.
    const ATAN_K = 3;
    const linear = (stars - 1) / 4;
    const t = Math.atan(ATAN_K * linear) / Math.atan(ATAN_K);
    return `hsl(${h}, ${Math.round(s * t)}%, ${Math.round(l * t)}%)`;
}

function readPressure(props: Record<string, unknown> | undefined): number {
    const p = props?.pressure ?? props?.weight;
    return typeof p === "number" ? Math.max(0, Math.min(1, p)) : 0.5;
}

function readStars(props: Record<string, unknown> | undefined): StarCount | undefined {
    const s = props?.stars;
    if (typeof s !== "number" || !Number.isInteger(s) || s < 1 || s > 5) return undefined;
    return s as StarCount;
}

function readBookmarked(props: Record<string, unknown> | undefined): boolean {
    return props?.bookmarked === true;
}

interface UserMarker {
    handle: ClickableMapLayerHandle;
    ring?: ClickableMapLayerHandle;
    lon: number;
    lat: number;
    stars?: StarCount;
    bookmarked?: boolean;
}

export class UserLayerView extends LayerView {
    private readonly _store: UserPointsStore;
    private readonly _areaId: string;
    private readonly _onPointDeleted: ((latLng: [number, number]) => void) | undefined;
    private readonly _onMarkerTapped: ((latLng: [number, number], stars?: StarCount) => void) | undefined;
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
        onPointDeleted?: (latLng: [number, number]) => void,
        onMarkerTapped?: (latLng: [number, number], stars?: StarCount) => void,
    ) {
        super(map, layer, layerFactory);
        this._store = store;
        this._areaId = areaId;
        this._visible = visible;
        this._onPointDeleted = onPointDeleted;
        this._onMarkerTapped = onMarkerTapped;
    }

    setVisible(visible: boolean): void {
        if (visible === this._visible) {
            return;
        }
        this._visible = visible;
        for (const m of this._markers) {
            if (visible) {
                m.handle.addTo(this._map);
                m.ring?.addTo(this._map);
            } else {
                m.handle.remove();
                m.ring?.remove();
            }
        }
    }

    get featureCount(): number {
        return this._markers.length;
    }

    get lastPayload(): unknown {
        return this._lastPayload;
    }

    getPointAtLatLng(lat: number, lon: number): { stars?: StarCount; bookmarked?: boolean } | null {
        const m = this._markers.find(
            m => Math.abs(m.lat - lat) < 1e-8 && Math.abs(m.lon - lon) < 1e-8
        );
        if (!m) return null;
        return { stars: m.stars, bookmarked: m.bookmarked };
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
            const stars = readStars(feature.properties);
            const bookmarked = readBookmarked(feature.properties);
            this.placeMarker(feature.geometry.coordinates, pressure, stars, bookmarked);
        }

        log.info("user_layer.render.end", { areaId: this._areaId, count: this._markers.length });
    }

    addMarker(latLng: [number, number], pressure: number, stars?: StarCount, bookmarked = false): void {
        // latLng is [lat, lon]; GeoJSON coordinates are [lon, lat]
        this.placeMarker([latLng[1], latLng[0]], pressure, stars, bookmarked);
    }

    addMarkerRing(latLng: [number, number], stars: StarCount): void {
        const [lat, lon] = latLng;
        const idx = this._markers.findIndex(
            m => Math.abs(m.lat - lat) < 1e-8 && Math.abs(m.lon - lon) < 1e-8
        );
        if (idx === -1) return;

        this._markers[idx].stars = stars;

        if (this._markers[idx].bookmarked) return;

        this._markers[idx].ring?.remove();
        const leafletLatLng = this.geoJsonPointToLatLng([lon, lat]);
        const radius = this.effectiveRadius(this._map.getZoom());
        const ring = this.createRingMarker(leafletLatLng, radius, stars);
        ring.onClick(() => this._onMarkerTapped?.([lat, lon], stars));
        ring.onContextMenu(() => this.deleteMarker(lon, lat));
        if (this._visible) ring.addTo(this._map);
        this._markers[idx].ring = ring;
    }

    removePoint(latLng: [number, number]): void {
        this.deleteMarker(latLng[1], latLng[0]);
    }

    override destroy(): void {
        this._stopWatchingZoom?.();
        this._stopWatchingZoom = undefined;
        this.destroyMarkers();
    }

    private effectiveRadius(zoom: number): number {
        const config = this._layer.style?.radius ?? 6;
        return Math.min(config, Math.max(2, zoom - 6)) * 1.5;
    }

    private onZoom(zoom: number): void {
        const r = this.effectiveRadius(zoom);
        for (const m of this._markers) {
            m.handle.setRadius(r);
            m.ring?.setRadius(r);
        }
    }

    addMarkerBookmark(latLng: [number, number], bookmarked: boolean): void {
        const [lat, lon] = latLng;
        const idx = this._markers.findIndex(
            m => Math.abs(m.lat - lat) < 1e-8 && Math.abs(m.lon - lon) < 1e-8
        );
        if (idx === -1) return;

        this._markers[idx].ring?.remove();
        this._markers[idx].bookmarked = bookmarked;

        const leafletLatLng = this.geoJsonPointToLatLng([lon, lat]);
        const radius = this.effectiveRadius(this._map.getZoom());
        const stars = this._markers[idx].stars;

        if (bookmarked) {
            const ring = this.createBookmarkRingMarker(leafletLatLng, radius);
            ring.onClick(() => this._onMarkerTapped?.([lat, lon], stars));
            ring.onContextMenu(() => this.deleteMarker(lon, lat));
            if (this._visible) ring.addTo(this._map);
            this._markers[idx].ring = ring;
        } else if (stars !== undefined) {
            const ring = this.createRingMarker(leafletLatLng, radius, stars);
            ring.onClick(() => this._onMarkerTapped?.([lat, lon], stars));
            ring.onContextMenu(() => this.deleteMarker(lon, lat));
            if (this._visible) ring.addTo(this._map);
            this._markers[idx].ring = ring;
        } else {
            this._markers[idx].ring = undefined;
        }
    }

    private placeMarker(geoJsonCoords: [number, number], pressure: number, stars?: StarCount, bookmarked?: boolean): void {
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
        handle.onClick(() => this._onMarkerTapped?.([lat, lon], stars));

        if (this._visible) {
            handle.addTo(this._map);
        }

        let ring: ClickableMapLayerHandle | undefined;
        if (bookmarked) {
            ring = this.createBookmarkRingMarker(leafletLatLng, radius);
            ring.onClick(() => this._onMarkerTapped?.([lat, lon], stars));
            ring.onContextMenu(() => this.deleteMarker(lon, lat));
            if (this._visible) ring.addTo(this._map);
        } else if (stars !== undefined) {
            ring = this.createRingMarker(leafletLatLng, radius, stars);
            ring.onClick(() => this._onMarkerTapped?.([lat, lon], stars));
            ring.onContextMenu(() => this.deleteMarker(lon, lat));
            if (this._visible) ring.addTo(this._map);
        }

        this._markers.push({ handle, ring, lon, lat, stars, bookmarked });
    }

    private createRingMarker(
        leafletLatLng: [number, number],
        dotRadius: number,
        stars: StarCount
    ): ClickableMapLayerHandle {
        const highlightColor = this._layer.style?.highlightColor ?? DEFAULT_HIGHLIGHT_COLOR;
        const ringColor = starRingColor(highlightColor, stars);
        return this._layerFactory.createCircleMarker(leafletLatLng, {
            className: "user-ring-marker",
            radius: dotRadius,
            color: ringColor,
            weight: 3,
            fillOpacity: 0,
            opacity: 1,
        });
    }

    private createBookmarkRingMarker(
        leafletLatLng: [number, number],
        dotRadius: number
    ): ClickableMapLayerHandle {
        const bookmarkColor = this._layer.style?.bookmarkColor ?? DEFAULT_BOOKMARK_COLOR;
        return this._layerFactory.createCircleMarker(leafletLatLng, {
            className: "user-bookmark-ring-marker",
            radius: dotRadius,
            color: bookmarkColor,
            weight: 3,
            fillOpacity: 0,
            opacity: 1,
        });
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
        this._markers[idx].ring?.remove();
        this._markers.splice(idx, 1);

        void this._store.removePoint(this._areaId, lon, lat);
        log.info("user_layer.delete_point.end", { lon, lat, remaining: this._markers.length });

        this._onPointDeleted?.([lat, lon]);
    }

    private destroyMarkers(): void {
        for (const m of this._markers) {
            m.handle.remove();
            m.ring?.remove();
        }
        this._markers = [];
    }
}
