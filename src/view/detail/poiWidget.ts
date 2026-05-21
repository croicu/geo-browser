import type { LayerFactory, MapHandle, MapLayerHandle, MapPopupHandle, PoiInfo } from "../../contracts";

export class PoiWidget {
    private readonly _map: MapHandle;
    private readonly _latLng: [number, number];
    private readonly _layerFactory: LayerFactory;

    private _marker?: MapLayerHandle;
    private _popup?: MapPopupHandle;
    private _element?: HTMLElement;
    private readonly _infos: PoiInfo[] = [];

    constructor(map: MapHandle, latLng: [number, number], layerFactory: LayerFactory) {
        this._map = map;
        this._latLng = latLng;
        this._layerFactory = layerFactory;
    }

    render(): void {
        const marker = this._layerFactory.createCircleMarker(this._latLng, {
            radius: 6,
            color: "#e74c3c",
            fillColor: "#e74c3c",
            opacity: 1,
        });
        marker.addTo(this._map);
        this._marker = marker;
    }

    addInfo(info: PoiInfo): void {
        this._infos.push(info);

        if (!this._element) {
            this._element = document.createElement("div");
            this._element.className = "poi-popup";
            this._popup = this._map.createPopup(this._latLng, this._element);
        }

        this.updateContent();
    }

    destroy(): void {
        this._popup?.remove();
        this._popup = undefined;
        this._marker?.remove();
        this._marker = undefined;
        this._element = undefined;
        this._infos.length = 0;
    }

    private updateContent(): void {
        if (!this._element || !this._popup) return;

        this._element.innerHTML = "";

        for (const info of this._infos) {
            const section = document.createElement("div");
            section.className = "poi-section";

            if (info.name) {
                const el = document.createElement("div");
                el.className = "poi-name";
                el.textContent = info.name;
                section.appendChild(el);
            }

            if (info.category) {
                const el = document.createElement("div");
                el.className = "poi-category";
                el.textContent = info.category;
                section.appendChild(el);
            }

            if (info.address) {
                const el = document.createElement("div");
                el.className = "poi-address";
                el.textContent = info.address;
                section.appendChild(el);
            }

            if (info.neighbourhood) {
                const el = document.createElement("div");
                el.className = "poi-neighbourhood";
                el.textContent = info.neighbourhood;
                section.appendChild(el);
            }

            if (info.city) {
                const el = document.createElement("div");
                el.className = "poi-city";
                el.textContent = info.city;
                section.appendChild(el);
            }

            if (info.country) {
                const el = document.createElement("div");
                el.className = "poi-country";
                el.textContent = info.country;
                section.appendChild(el);
            }

            const src = document.createElement("div");
            src.className = "poi-source";
            src.textContent = info.source;
            section.appendChild(src);

            this._element.appendChild(section);
        }

        this._popup.update(this._element);
    }
}
