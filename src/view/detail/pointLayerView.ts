import type { GeoLayer } from "../../catalog/layer";
import type { LayerFactory, MapHandle, MapLayerHandle } from "../../contracts";
import { fail } from "../../errors";
import { LayerView } from "./layerView";

export class PointLayerView extends LayerView {
    private _markers: MapLayerHandle[] = [];

    constructor(
        map: MapHandle,
        layer: GeoLayer,
        layerFactory: LayerFactory
    ) {
        super(map, layer, layerFactory);
    }

    async render(): Promise<void> {
        await this._layer.load();

        const payload = this._layer.payload;

        if (!this.isFeatureCollection(payload)) {
            fail("layer.invalid_geojson", "Layer payload is not a GeoJSON FeatureCollection.", undefined, {
                layerId: this._layer.id,
            });
        }

        this.destroy();

        const style = this._layer.style;

        for (const feature of payload.features) {
            if (!this.isPointFeature(feature)) {
                continue;
            }

            const coordinates = feature.geometry.coordinates;
            const latLng = this.geoJsonPointToLatLng(coordinates);
            const geoRadius = this.geoRadiusMeters(feature);

            const markerOptions = {
                color: style?.color,
                opacity: style?.opacity ?? 0.8,
            };

            const marker = geoRadius !== undefined
                ? this._layerFactory.createGeoCircle(latLng, geoRadius, markerOptions)
                : this._layerFactory.createCircleMarker(latLng, {
                    ...markerOptions,
                    radius: this.computePointRadius(feature, style ?? undefined),
                });

            marker.addTo(this._map);
            this._markers.push(marker);
        }
    }

    override destroy(): void {
        super.destroy();
        for (const marker of this._markers) {
            marker.remove();
        }
        this._markers = [];
    }
}
