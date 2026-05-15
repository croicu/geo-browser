import { fail } from "../../errors";
import { LayerView } from "./layerView";

export class HeatLayerView extends LayerView {
    async render(): Promise<void> {
        await this._layer.load();

        const payload = this._layer.payload;

        if (!this.isFeatureCollection(payload)) {
            fail("layer.invalid_geojson", "Layer payload is not a GeoJSON FeatureCollection.", undefined, {
                layerId: this._layer.id,
            });
        }

        const style = this._layer.style;
        const points = [];

        for (const feature of payload.features) {
            if (!this.isPointFeature(feature)) {
                continue;
            }

            const coordinates = feature.geometry.coordinates;
            const latLng = this.geoJsonPointToLatLng(coordinates);
            const weight = this.getWeight(feature);

            points.push({
                latLng,
                weight,
            });
        }

        const heatLayer = this._layerFactory.createHeatLayer(points, {
            radius: (style?.radius ?? 25) * (style?.radiusScale ?? 1),
            blur: style?.blur ?? 18,
            opacity: style?.opacity ?? 0.6,
            color: style?.color,
        });

        this.setGroup(heatLayer);
    }
}