import type { GeoLayer } from "../../catalog/layer";
import type { LayerFactory, MapHandle } from "../../contracts";
import { fail } from "../../errors";
import { LayerView } from "./layerView";

export class PointLayerView extends LayerView {

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

        const group = this._layerFactory.createLayerGroup();

        for (const feature of payload.features) {
            if (!this.isPointFeature(feature)) {
                continue;
            }

            const coordinates = feature.geometry.coordinates;
            const latLng = this.geoJsonPointToLatLng(coordinates);
            const weight = this.getWeight(feature);
            const style = this._layer.style;

            this._layerFactory.createCircleMarker(latLng, {
                radius: this.weightToRadius(weight),
                color: style?.color,
                opacity: style?.opacity ?? 0.8,
                fillOpacity: 0.5,
            }).addTo(group);
        }

        this.destroy();

        this._group = group;
        this._group.addTo(this._map);
    }
}