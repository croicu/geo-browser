import type { ClickableMapLayerHandle, LayerFactory, MapHandle, MapPopupHandle } from "../../contracts";
import type { GeoLayer } from "../../catalog/layer";
import { LayerView } from "./layerView";
import { getLogger } from "../../services";
import { StarRatingControl } from "./starRatingControl";
import type { StarCount } from "./starRatingControl";

export interface PoiBakedFeature {
    layerId: string;
    latLng: [number, number];
    name?: string;
    amenity?: string;
    cuisine?: string;
    openingHours?: string;
    address?: string;
    website?: string;
    wikipedia?: string;
    wikidata?: string;
    stars?: string;
    outdoorSeating?: boolean;
}

export interface PoiLayerViewOptions {
    getUserPoint?: (lat: number, lon: number) => { stars?: StarCount; bookmarked?: boolean } | null;
    onPoiStarSelected?: (latLng: [number, number], stars: StarCount) => void;
    onPoiBookmarkToggled?: (latLng: [number, number]) => void;
}

function isEnhanced(feature: PoiBakedFeature): boolean {
    return !!(feature.wikipedia || feature.wikidata || feature.stars || feature.outdoorSeating);
}

interface PoiMarker {
    dot: ClickableMapLayerHandle;
    ring?: ClickableMapLayerHandle;
}

export class PoiLayerView extends LayerView {
    private readonly _sourceLayers: GeoLayer[];
    private readonly _options: PoiLayerViewOptions;
    private _features: PoiBakedFeature[] = [];
    private _markersBySource = new Map<string, PoiMarker[]>();
    private _sourceVisible = new Map<string, boolean>();
    private _activePopup?: MapPopupHandle;
    private _mapClickCleanup?: () => void;
    private _zoomCleanup?: () => void;

    constructor(
        map: MapHandle,
        layer: GeoLayer,
        sourceLayers: readonly GeoLayer[],
        layerFactory: LayerFactory,
        options?: PoiLayerViewOptions
    ) {
        super(map, layer, layerFactory);
        this._sourceLayers = sourceLayers.filter(l => !l.isVirtual());
        this._options = options ?? {};
    }

    get features(): readonly PoiBakedFeature[] {
        return this._features;
    }

    async render(): Promise<void> {
        this._features = await this.collectFeatures();
        const features = this._features;
        const style = this._layer.style;
        const opacity = style?.opacity ?? 1;
        const fillColor = style?.color ?? "#7b241c";
        const strokeColor = style?.strokeColor ?? fillColor;
        const strokeWidth = style?.strokeWidth ?? 0;
        const enhancedColor = style?.enhancedColor ?? "#20b7dd";
        const outdoorColor = style?.outdoorColor ?? "#f5c518";

        for (const feature of features) {
            if (!this._markersBySource.has(feature.layerId)) {
                this._markersBySource.set(feature.layerId, []);
            }

            const enhanced = isEnhanced(feature);
            const dot = this._layerFactory.createCircleMarker(feature.latLng, {
                className: "poi-marker",
                radius: 5,
                color: strokeColor,
                weight: strokeWidth,
                fillColor: fillColor,
                fillOpacity: opacity,
                opacity: opacity,
            });

            let ring: ClickableMapLayerHandle | undefined;
            if (enhanced) {
                ring = this._layerFactory.createCircleMarker(feature.latLng, {
                    className: "poi-ring-marker",
                    radius: 5,
                    color: feature.outdoorSeating ? outdoorColor : enhancedColor,
                    weight: 10,
                    fillColor: fillColor,
                    fillOpacity: 0,
                    opacity: 1,
                });
            }

            const sourceVisible = this._sourceVisible.get(feature.layerId) !== false;
            if (sourceVisible) {
                ring?.addTo(this._map);
                dot.addTo(this._map);
            }

            dot.onClick(() => this.onMarkerClick(feature));
            this._markersBySource.get(feature.layerId)!.push({ dot, ring });
        }

        this._mapClickCleanup = this._map.onClick(() => this.closePopup());
        this._zoomCleanup = this._map.onZoom(zoom => this.updateRadii(zoom));
        this.updateRadii(this._map.getZoom());
    }

    setSourceVisible(layerId: string, visible: boolean): void {
        this._sourceVisible.set(layerId, visible);
        const markers = this._markersBySource.get(layerId);
        if (!markers) {
            return;
        }
        for (const { dot, ring } of markers) {
            if (visible) {
                ring?.addTo(this._map);
                dot.addTo(this._map);
            } else {
                ring?.remove();
                dot.remove();
            }
        }
        if (!visible) {
            this.closePopup();
        }
    }

    override destroy(): void {
        super.destroy();
        this.closePopup();
        this._mapClickCleanup?.();
        this._mapClickCleanup = undefined;
        this._zoomCleanup?.();
        this._zoomCleanup = undefined;
        for (const markers of this._markersBySource.values()) {
            for (const { dot, ring } of markers) {
                ring?.remove();
                dot.remove();
            }
        }
        this._markersBySource.clear();
        this._sourceVisible.clear();
    }

    private updateRadii(zoom: number): void {
        const r = zoom <= 12 ? 2 : zoom <= 13 ? 4 : zoom <= 14 ? 6 : 8;
        for (const markers of this._markersBySource.values()) {
            for (const { dot, ring } of markers) {
                dot.setRadius(r);
                ring?.setRadius(r);
            }
        }
    }

    private async collectFeatures(): Promise<PoiBakedFeature[]> {
        const features: PoiBakedFeature[] = [];

        for (const source of this._sourceLayers) {
            try {
                await source.load();
            } catch (err) {
                getLogger().warning("poi.source_load_failed", { layerId: source.id, cause: err });
                continue;
            }

            const payload = source.payload;
            if (!this.isFeatureCollection(payload)) continue;

            for (const f of payload.features) {
                if (!this.isPointFeature(f)) continue;
                if (f.properties?.hasDetails !== true) continue;

                const p = f.properties;
                features.push({
                    layerId: source.id,
                    latLng: this.geoJsonPointToLatLng(f.geometry.coordinates),
                    name: typeof p.name === "string" ? p.name : undefined,
                    amenity: typeof p.amenity === "string" ? p.amenity : undefined,
                    cuisine: typeof p.cuisine === "string" ? p.cuisine : undefined,
                    openingHours: typeof p.opening_hours === "string" ? p.opening_hours : undefined,
                    address: typeof p.address === "string" ? p.address : undefined,
                    website: typeof p.website === "string" ? p.website : undefined,
                    wikipedia: typeof p.wikipedia === "string" ? p.wikipedia : undefined,
                    wikidata: typeof p.wikidata === "string" ? p.wikidata : undefined,
                    stars: typeof p.stars === "string" ? p.stars : undefined,
                    outdoorSeating: p.outdoor_seating === "yes",
                });
            }
        }

        return features;
    }

    private onMarkerClick(feature: PoiBakedFeature): void {
        const log = getLogger();
        log.info("poi.tap.start", { name: feature.name });
        this.closePopup();
        const existingPoint = this._options.getUserPoint?.(feature.latLng[0], feature.latLng[1]) ?? null;
        const { root, imageContainer } = this.buildPopupElement(feature);
        root.appendChild(document.createElement("br"));
        root.appendChild(this.buildPoiBottomRow(feature, existingPoint));
        this._activePopup = this._map.createPopup(feature.latLng, root);
        if (feature.wikidata && imageContainer) {
            void this.loadWikidataImage(feature.wikidata, imageContainer);
        }
        log.info("poi.tap.end");
    }

    private buildPoiBottomRow(
        feature: PoiBakedFeature,
        existingPoint: { stars?: StarCount; bookmarked?: boolean } | null
    ): HTMLElement {
        const row = document.createElement("div");
        row.className = "callout-bottom-row";

        if (existingPoint?.stars !== undefined) {
            row.appendChild(new StarRatingControl({ mode: "readonly", value: existingPoint.stars }).render());
        } else {
            row.appendChild(new StarRatingControl({
                mode: "interactive",
                onChange: stars => this.onPoiStarClick(feature, stars),
            }).render());

            if (this._options.onPoiBookmarkToggled) {
                const isBookmarked = existingPoint?.bookmarked ?? false;
                row.appendChild(this.buildPoiBookmarkButton(isBookmarked, () => this.onPoiBookmarkClick(feature)));
            }
        }

        return row;
    }

    private buildPoiBookmarkButton(isBookmarked: boolean, onClick: () => void): HTMLElement {
        const btn = document.createElement("button");
        btn.className = "callout-bookmark-btn";
        const img = document.createElement("img");
        img.className = "callout-bookmark-icon";
        img.alt = "Bookmark";
        img.src = isBookmarked ? "/icons/solid_bookmark.svg" : "/icons/bookmark.svg";
        btn.appendChild(img);
        btn.addEventListener("click", () => {
            getLogger().info("poi.bookmark_toggle.click");
            onClick();
        });
        return btn;
    }

    private onPoiStarClick(feature: PoiBakedFeature, stars: StarCount): void {
        const log = getLogger();
        log.info("poi.star_selected.start", { name: feature.name, stars });
        this._options.onPoiStarSelected?.(feature.latLng, stars);
        this.closePopup();
        log.info("poi.star_selected.end");
    }

    private onPoiBookmarkClick(feature: PoiBakedFeature): void {
        const log = getLogger();
        log.info("poi.bookmark_toggle.start", { name: feature.name });
        this._options.onPoiBookmarkToggled?.(feature.latLng);
        this.closePopup();
        log.info("poi.bookmark_toggle.end");
    }

    private closePopup(): void {
        this._activePopup?.remove();
        this._activePopup = undefined;
    }

    private buildPopupElement(feature: PoiBakedFeature): { root: HTMLElement; imageContainer?: HTMLElement } {
        const root = document.createElement("div");
        root.className = "poi-popup";

        if (feature.name) {
            const el = document.createElement("div");
            el.className = "poi-name";
            el.textContent = feature.name.replace(/\|/g, " / ");
            root.appendChild(el);
        }

        let imageContainer: HTMLElement | undefined;
        if (feature.wikidata) {
            imageContainer = document.createElement("div");
            imageContainer.className = "poi-image-container";
            root.appendChild(imageContainer);
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

        if (feature.stars) {
            root.appendChild(document.createElement("br"));
            root.appendChild(this.buildStars(feature.stars));
        }

        if (feature.outdoorSeating) {
            const el = document.createElement("div");
            el.className = "poi-outdoor-seating";
            el.textContent = "Outdoor seating";
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

        if (feature.wikipedia) {
            const href = feature.wikidata
                ? `https://www.wikidata.org/wiki/Special:GoToLinkedPage/enwiki/${feature.wikidata}`
                : this.buildWikipediaUrl(feature.wikipedia);
            if (href) {
                root.appendChild(document.createElement("br"));
                const a = document.createElement("a");
                a.className = "poi-wikipedia";
                a.href = href;
                a.target = "_blank";
                a.rel = "noopener noreferrer";
                a.textContent = "Wikipedia";
                root.appendChild(a);
            }
        }

        if (feature.name) {
            root.appendChild(document.createElement("br"));
            root.appendChild(this.buildReviewLinks(feature.name, feature.latLng, feature.address));
        }

        return { root, imageContainer };
    }

    private async loadWikidataImage(wikidataId: string, container: HTMLElement): Promise<void> {
        const log = getLogger();
        log.info("poi.wikidata_image.start", { wikidataId });
        try {
            const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${encodeURIComponent(wikidataId)}&props=claims&format=json&origin=*`;
            const response = await fetch(url);
            const data = await response.json() as { entities?: Record<string, { claims?: Record<string, Array<{ mainsnak?: { datavalue?: { value?: unknown } } }>> }> };
            const filename = data?.entities?.[wikidataId]?.claims?.["P18"]?.[0]?.mainsnak?.datavalue?.value;
            if (typeof filename !== "string" || !filename) {
                log.info("poi.wikidata_image.no_image", { wikidataId });
                return;
            }
            if (!container.isConnected) {
                return;
            }
            const img = document.createElement("img");
            img.className = "poi-image";
            img.src = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=200`;
            img.alt = "";
            container.appendChild(img);
            log.info("poi.wikidata_image.end", { wikidataId, filename });
        } catch (err) {
            log.error("poi.wikidata_image.error", err);
        }
    }

    private buildStars(stars: string): HTMLElement {
        const count = Math.min(Math.max(parseInt(stars, 10), 0), 5);
        const el = document.createElement("div");
        el.className = "poi-stars";
        for (let i = 0; i < count; i++) {
            const img = document.createElement("img");
            img.src = "/icons/star.svg";
            img.alt = "★";
            img.className = "poi-star-icon";
            el.appendChild(img);
        }
        return el;
    }

    private buildWikipediaUrl(raw: string): string | null {
        const sep = raw.indexOf(":");
        if (sep < 1) return null;
        const lang = raw.slice(0, sep);
        const title = raw.slice(sep + 1).replace(/ /g, "_");
        return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`;
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

        const streetView = document.createElement("a");
        streetView.href = `https://maps.google.com/maps?layer=c&cbll=${lat},${lng}`;
        streetView.target = "_blank";
        streetView.rel = "noopener noreferrer";
        streetView.textContent = "Street View";
        const streetViewRow = document.createElement("div");
        streetViewRow.appendChild(streetView);
        links.appendChild(streetViewRow);

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
