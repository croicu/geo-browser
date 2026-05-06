import { fail } from "../../errors";
import { GeoLayer } from "../../catalog/layer";
import type { LeafletLayerFactory, MapLayerHandle } from "../../contracts";

export class LayerView {
    private readonly _map: unknown;
    private readonly _layer: GeoLayer;
    private readonly _layerFactory: LeafletLayerFactory;

    private _group?: MapLayerHandle;

    constructor(
        map: unknown, 
        layer: GeoLayer,
        layerFactory: LeafletLayerFactory
    ) {
        this._map = map;
        this._layer = layer;
        this._layerFactory = layerFactory;
    }

    async render(): Promise<void> {
        await this._layer.load();

        const payload = this._layer.payload;

        if (!isFeatureCollection(payload)) {
            fail("layer.invalid_geojson", "Layer payload is not a GeoJSON FeatureCollection.", undefined, {
                layerId: this._layer.id,
            });
        }

        const group = this._layerFactory.createLayerGroup();

        for (const feature of payload.features) {
            if (!isPointFeature(feature)) {
                continue;
            }

            const coordinates = feature.geometry.coordinates;
            const latLng = geoJsonPointToLatLng(coordinates);
            const weight = getWeight(feature);
            const style = this._layer.style;

            this._layerFactory.createCircleMarker(latLng, {
                radius: weightToRadius(weight),
                color: style?.color,
                opacity: style?.opacity ?? 0.8,
                fillOpacity: 0.5,
            }).addTo(group);
        }

        this.destroy();

        this._group = group;
        this._group.addTo(this._map);
    }

    destroy(): void {
        if (!this._group) {
            return;
        }

        this._group.remove();
        this._group = undefined;
    }
}

interface GeoJsonFeatureCollection {
    type: "FeatureCollection";
    features: unknown[];
}

interface GeoJsonPointFeature {
    type: "Feature";
    properties?: Record<string, unknown>;
    geometry: {
        type: "Point";
        coordinates: [number, number];
    };
}

function isFeatureCollection(value: unknown): value is GeoJsonFeatureCollection {
    if (typeof value !== "object" || value === null) {
        return false;
    }

    const candidate = value as { type?: unknown; features?: unknown };

    return candidate.type === "FeatureCollection" && Array.isArray(candidate.features);
}

function isPointFeature(value: unknown): value is GeoJsonPointFeature {
    if (typeof value !== "object" || value === null) {
        return false;
    }

    const candidate = value as {
        type?: unknown;
        geometry?: {
            type?: unknown;
            coordinates?: unknown;
        };
    };

    if (candidate.type !== "Feature") {
        return false;
    }

    if (!candidate.geometry || candidate.geometry.type !== "Point") {
        return false;
    }

    const coordinates = candidate.geometry.coordinates;

    return (
        Array.isArray(coordinates) &&
        coordinates.length === 2 &&
        typeof coordinates[0] === "number" &&
        typeof coordinates[1] === "number"
    );
}

function geoJsonPointToLatLng(coordinates: [number, number]): [number, number] {
    const longitude = coordinates[0];
    const latitude = coordinates[1];

    return [latitude, longitude];
}

function getWeight(feature: GeoJsonPointFeature): number {
    const weight = feature.properties?.weight;

    if (typeof weight === "number") {
        return weight;
    }

    return 1;
}

function weightToRadius(weight: number): number {
    return 4 + weight * 12;
}