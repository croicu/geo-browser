// view/detail/leafletLayerFactory.ts
import L from "leaflet";

import type {
    CircleMarkerOptions,
    LeafletLayerFactory,
    MapLayerHandle,
} from "../../contracts";

export class DefaultLeafletLayerFactory implements LeafletLayerFactory {
    createLayerGroup(): MapLayerHandle {
        return L.layerGroup();
    }

    createCircleMarker(
        latLng: [number, number],
        options: CircleMarkerOptions
    ): MapLayerHandle {
        return L.circleMarker(latLng, options);
    }
}


export interface LeafletMapFactory {
    createMap(root: HTMLElement, center: [number, number], zoom: number): L.Map;
}

export class DefaultLeafletMapFactory implements LeafletMapFactory {
    createMap(root: HTMLElement, center: [number, number], zoom: number): L.Map {
        const map = L.map(root).setView(center, zoom);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: "&copy; OpenStreetMap contributors",
        }).addTo(map);

        return map;
    }
}

