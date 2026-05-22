import type { ClickableMapLayerHandle, LayerFactory, MapHandle, MapPopupHandle } from "../../contracts";
import type { GeoLayer } from "../../catalog/layer";
import { LayerView } from "./layerView";

interface PoiBakedFeature {
    latLng: [number, number];
    name?: string;
    amenity?: string;
    cuisine?: string;
    openingHours?: string;
    address?: string;
    website?: string;
}

export class PoiLayerView extends LayerView {
    private readonly _sourceLayers: GeoLayer[];
    private _markers: ClickableMapLayerHandle[] = [];
    private _activePopup?: MapPopupHandle;
    private _mapClickCleanup?: () => void;
    private _zoomCleanup?: () => void;

    constructor(
        map: MapHandle,
        layer: GeoLayer,
        sourceLayers: readonly GeoLayer[],
        layerFactory: LayerFactory
    ) {
        super(map, layer, layerFactory);
        this._sourceLayers = sourceLayers.filter(l => !l.isVirtual());
    }

    async render(): Promise<void> {
        const features = await this.collectFeatures();
        const opacity = this._layer.style?.opacity ?? 1;

        for (const feature of features) {
            const marker = this._layerFactory.createCircleMarker(feature.latLng, {
                radius: 5,
                color: "#7b241c",
                weight: 0,
                fillColor: "#7b241c",
                fillOpacity: opacity,
                opacity: opacity,
            });
            marker.addTo(this._map);
            marker.onClick(() => this.onMarkerClick(feature));
            this._markers.push(marker);
        }

        this._mapClickCleanup = this._map.onClick(() => this.closePopup());
        this._zoomCleanup = this._map.onZoom(zoom => this.updateRadii(zoom));
        this.updateRadii(this._map.getZoom());
    }

    override destroy(): void {
        super.destroy();
        this.closePopup();
        this._mapClickCleanup?.();
        this._mapClickCleanup = undefined;
        this._zoomCleanup?.();
        this._zoomCleanup = undefined;
        for (const marker of this._markers) {
            marker.remove();
        }
        this._markers = [];
    }

    private updateRadii(zoom: number): void {
        const r = zoom <= 12 ? 2 : zoom <= 13 ? 4 : zoom <= 14 ? 6 : 8;
        for (const marker of this._markers) {
            marker.setRadius(r);
        }
    }

    private async collectFeatures(): Promise<PoiBakedFeature[]> {
        const features: PoiBakedFeature[] = [];

        for (const source of this._sourceLayers) {
            await source.load();

            const payload = source.payload;
            if (!this.isFeatureCollection(payload)) continue;

            for (const f of payload.features) {
                if (!this.isPointFeature(f)) continue;
                if (f.properties?.hasDetails !== true) continue;

                features.push({
                    latLng: this.geoJsonPointToLatLng(f.geometry.coordinates),
                    name: typeof f.properties.name === "string" ? f.properties.name : undefined,
                    amenity: typeof f.properties.amenity === "string" ? f.properties.amenity : undefined,
                    cuisine: typeof f.properties.cuisine === "string" ? f.properties.cuisine : undefined,
                    openingHours: typeof f.properties.opening_hours === "string" ? f.properties.opening_hours : undefined,
                    address: typeof f.properties.address === "string" ? f.properties.address : undefined,
                    website: typeof f.properties.website === "string" ? f.properties.website : undefined,
                });
            }
        }

        return features;
    }

    private onMarkerClick(feature: PoiBakedFeature): void {
        this.closePopup();
        const element = this.buildPopupElement(feature);
        this._activePopup = this._map.createPopup(feature.latLng, element);
    }

    private closePopup(): void {
        this._activePopup?.remove();
        this._activePopup = undefined;
    }

    private buildPopupElement(feature: PoiBakedFeature): HTMLElement {
        const root = document.createElement("div");
        root.className = "poi-popup";

        if (feature.name) {
            const el = document.createElement("div");
            el.className = "poi-name";
            el.textContent = feature.name.replace(/\|/g, " / ");
            root.appendChild(el);
        }

        if (feature.amenity) {
            const el = document.createElement("div");
            el.className = "poi-amenity";
            el.textContent = feature.amenity.replace(/_/g, " ");
            root.appendChild(el);
        }

        if (feature.cuisine) {
            const el = document.createElement("div");
            el.className = "poi-cuisine";
            el.textContent = feature.cuisine.replace(/;/g, ", ");
            root.appendChild(el);
        }

        if (feature.openingHours) {
            const el = document.createElement("div");
            el.className = "poi-hours";
            el.textContent = feature.openingHours;
            root.appendChild(el);
        }

        if (feature.address) {
            const el = document.createElement("div");
            el.className = "poi-address";
            el.textContent = feature.address;
            root.appendChild(el);
        }

        if (feature.website) {
            root.appendChild(document.createElement("br"));
            const a = document.createElement("a");
            a.className = "poi-website";
            a.href = feature.website;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            a.textContent = "Website";
            root.appendChild(a);
        }

        if (feature.name) {
            root.appendChild(document.createElement("br"));
            root.appendChild(this.buildReviewLinks(feature.name, feature.latLng, feature.address));
        }

        return root;
    }

    private buildReviewLinks(name: string, latLng: [number, number], address?: string): HTMLElement {
        const links = document.createElement("div");
        links.className = "poi-links";

        const [lat, lng] = latLng;
        const query = encodeURIComponent(name);

        const google = document.createElement("a");
        google.href = `https://www.google.com/maps/search/${query}/@${lat},${lng},15z`;
        google.target = "_blank";
        google.rel = "noopener noreferrer";
        google.textContent = "Google Maps";
        const googleRow = document.createElement("div");
        googleRow.appendChild(google);
        links.appendChild(googleRow);

        if (address) {
            const yelp = document.createElement("a");
            yelp.href = `https://www.yelp.com/search?find_desc=${query}&find_loc=${encodeURIComponent(address)}`;
            yelp.target = "_blank";
            yelp.rel = "noopener noreferrer";
            yelp.textContent = "Yelp";
            const yelpRow = document.createElement("div");
            yelpRow.appendChild(yelp);
            links.appendChild(yelpRow);
        }

        const foursquare = document.createElement("a");
        foursquare.href = `https://foursquare.com/search?query=${query}&near=${lat},${lng}`;
        foursquare.target = "_blank";
        foursquare.rel = "noopener noreferrer";
        foursquare.textContent = "Foursquare";
        const foursquareRow = document.createElement("div");
        foursquareRow.appendChild(foursquare);
        links.appendChild(foursquareRow);

        const tripadvisor = document.createElement("a");
        tripadvisor.href = `https://www.tripadvisor.com/Search?q=${query}`;
        tripadvisor.target = "_blank";
        tripadvisor.rel = "noopener noreferrer";
        tripadvisor.textContent = "TripAdvisor";
        const tripadvisorRow = document.createElement("div");
        tripadvisorRow.appendChild(tripadvisor);
        links.appendChild(tripadvisorRow);

        return links;
    }
}
