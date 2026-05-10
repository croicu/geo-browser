import { GeoLayer } from "../../catalog/layer";
import type { LayerFactory, MapHandle, MapLayerHandle, View } from "../../contracts";

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


export abstract class LayerView implements View {
    protected readonly _map: MapHandle;
    protected readonly _layer: GeoLayer;
    protected readonly _layerFactory: LayerFactory;

    protected _group?: MapLayerHandle;

    constructor(
        map: MapHandle, 
        layer: GeoLayer,
        layerFactory: LayerFactory
    ) {
        this._map = map;
        this._layer = layer;
        this._layerFactory = layerFactory;
    }

    abstract render(): Promise<void>;

    destroy(): void {
        if (!this._group) {
            return;
        }

        this._group.remove();
        this._group = undefined;
    }

    protected setGroup(group: MapLayerHandle): void {
        this.destroy();
        this._group = group;
        this._group.addTo(this._map);
    }

    protected isFeatureCollection(value: unknown): value is GeoJsonFeatureCollection {
        if (typeof value !== "object" || value === null) {
            return false;
        }

        const candidate = value as { type?: unknown; features?: unknown };

        return candidate.type === "FeatureCollection" && Array.isArray(candidate.features);
    }

    protected isPointFeature(value: unknown): value is GeoJsonPointFeature {
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

    protected geoJsonPointToLatLng(coordinates: [number, number]): [number, number] {
        const longitude = coordinates[0];
        const latitude = coordinates[1];

        return [latitude, longitude];
    }

    protected getWeight(feature: GeoJsonPointFeature): number {
        const weight = feature.properties?.weight;

        if (typeof weight === "number") {
            return weight;
        }

        return 1;
    }

    protected weightToRadius(weight: number): number {
        return 4 + weight * 12;
    }
}
