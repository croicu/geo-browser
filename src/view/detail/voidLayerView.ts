import { getLogger } from "../../services";
import { GeoLayer } from "../../catalog/layer";
import type { HeatPoint } from "../../protocols";
import type { LayerFactory, MapHandle } from "../../contracts";
import { LayerView } from "./layerView";
import { VoidLayerComputer } from "./voidLayerComputer";

interface PolygonFeature {
    type: "Feature";
    geometry: {
        type: "Polygon";
        coordinates: [number, number][][];
    };
}

interface MultiPolygonFeature {
    type: "Feature";
    geometry: {
        type: "MultiPolygon";
        coordinates: [number, number][][][];
    };
}

export class VoidLayerView extends LayerView {
    private readonly _sourceLayers: readonly GeoLayer[];
    private readonly _bbox: [number, number, number, number];
    private readonly _sourceSignature: string;
    private _abortController?: AbortController;

    constructor(
        map: MapHandle,
        layer: GeoLayer,
        sourceLayers: readonly GeoLayer[],
        bbox: [number, number, number, number],
        layerFactory: LayerFactory
    ) {
        super(map, layer, layerFactory);
        this._sourceLayers = sourceLayers;
        this._bbox = bbox;
        this._sourceSignature = VoidLayerView.makeSignature(sourceLayers);
    }

    static makeSignature(layers: readonly GeoLayer[]): string {
        return [...layers]
            .map(l => l.id)
            .sort()
            .join(",");
    }

    sourcesChanged(current: readonly GeoLayer[]): boolean {
        return VoidLayerView.makeSignature(current) !== this._sourceSignature;
    }

    async render(): Promise<void> {
        const log = getLogger();
        log.info("void_layer.render.start");

        this._abortController?.abort();
        const controller = new AbortController();
        this._abortController = controller;

        try {
            await this.compute(controller.signal);
            if (!controller.signal.aborted) {
                log.info("void_layer.render.end");
            }
        } catch (e) {
            if (controller.signal.aborted) {
                log.info("void_layer.render.aborted");
            } else {
                log.error("void_layer.render.error", e as Error);
            }
        }
    }

    destroy(): void {
        this._abortController?.abort();
        this._abortController = undefined;
        super.destroy();
    }

    private async compute(signal: AbortSignal): Promise<void> {
        const log = getLogger();
        // sources: [lat, lon, radiusM]. radiusM = 0 for dimensionless point features.
        const sources: [number, number, number][] = [];
        const exclusionRings: [number, number][][] = [];

        for (const source of this._sourceLayers) {
            if (signal.aborted) return;
            await source.load();
            if (!source.isLoaded()) continue;

            const payload = source.payload;
            if (!this.isFeatureCollection(payload)) continue;

            for (const feature of payload.features) {
                if (this.isPointFeature(feature)) {
                    const [lon, lat] = feature.geometry.coordinates;
                    const radiusM = this.featureRadiusM(feature) ?? 0;
                    sources.push([lat, lon, radiusM]);
                } else if (this.isPolygonFeature(feature)) {
                    for (const ring of feature.geometry.coordinates) {
                        exclusionRings.push(ring.map(([lon, lat]) => [lat, lon] as [number, number]));
                    }
                } else if (this.isMultiPolygonFeature(feature)) {
                    for (const polygon of feature.geometry.coordinates) {
                        for (const ring of polygon) {
                            exclusionRings.push(ring.map(([lon, lat]) => [lat, lon] as [number, number]));
                        }
                    }
                }
            }
        }

        log.info("void_layer.compute.inputs", { sources: sources.length, exclusionRings: exclusionRings.length });

        if (sources.length === 0) {
            log.info("void_layer.compute.no_sources");
            return;
        }

        const passes = [100, 50, 25];

        for (const spacing of passes) {
            if (signal.aborted) return;
            log.info("void_layer.compute.pass.start", { spacing });

            const heatPoints = await this.runPass(spacing, sources, exclusionRings, signal);
            if (signal.aborted) return;

            log.info("void_layer.compute.pass.end", { spacing, count: heatPoints.length });

            const style = this._layer.style;
            const color = style?.color ?? "#000000";
            const heatLayer = this._layerFactory.createHeatLayer(heatPoints, {
                radius: 60,
                blur: 15,
                opacity: style?.opacity ?? 1.0,
                color,
                gradient: {
                    0.0: "rgba(0,0,0,0)",
                    0.01: color,
                    1.0: color,
                },
            });
            this.setGroup(heatLayer);
        }
    }

    private async runPass(
        spacingMeters: number,
        sources: [number, number, number][],
        exclusionRings: [number, number][][],
        signal: AbortSignal
    ): Promise<HeatPoint[]> {
        const [west, south, east, north] = this._bbox;
        const midLat = (south + north) / 2;
        const latStep = spacingMeters / 111320;
        const lngStep = spacingMeters / (111320 * Math.cos((midLat * Math.PI) / 180));

        const raw: HeatPoint[] = [];

        let lat = south + latStep / 2;
        while (lat < north) {
            if (signal.aborted) return [];
            await new Promise<void>(resolve => setTimeout(resolve, 0));
            if (signal.aborted) return [];

            let lon = west + lngStep / 2;
            while (lon < east) {
                if (!VoidLayerComputer.isExcluded(lat, lon, exclusionRings)) {
                    const effectiveDist = VoidLayerComputer.nearestEffectiveDist(lat, lon, sources);
                    if (effectiveDist > 0) {
                        raw.push({ latLng: [lat, lon], weight: effectiveDist });
                    }
                }
                lon += lngStep;
            }
            lat += latStep;
        }

        const maxWeight = raw.reduce((m, p) => Math.max(m, p.weight), 0);
        if (maxWeight === 0) return [];

        // Suppress cells very close to any source edge to avoid heatmap accumulation
        // bleed around dense feature clusters.
        const THRESHOLD = 0.05;
        return raw
            .filter(p => p.weight / maxWeight > THRESHOLD)
            .map(p => {
                const normalized = (p.weight / maxWeight - THRESHOLD) / (1 - THRESHOLD);
                return { latLng: p.latLng, weight: normalized };
            });
    }

    private featureRadiusM(feature: { properties?: Record<string, unknown> }): number | undefined {
        const r = feature.properties?.["radius_m"];
        if (typeof r === "number") return r;
        const a = feature.properties?.["area_sqm"];
        if (typeof a === "number") return Math.sqrt(a / Math.PI);
        return undefined;
    }

    private isPolygonFeature(value: unknown): value is PolygonFeature {
        if (typeof value !== "object" || value === null) return false;
        const f = value as { type?: unknown; geometry?: { type?: unknown; coordinates?: unknown } };
        return (
            f.type === "Feature" &&
            f.geometry?.type === "Polygon" &&
            Array.isArray(f.geometry.coordinates)
        );
    }

    private isMultiPolygonFeature(value: unknown): value is MultiPolygonFeature {
        if (typeof value !== "object" || value === null) return false;
        const f = value as { type?: unknown; geometry?: { type?: unknown; coordinates?: unknown } };
        return (
            f.type === "Feature" &&
            f.geometry?.type === "MultiPolygon" &&
            Array.isArray(f.geometry.coordinates)
        );
    }
}
