import L from "leaflet";

import type { GeoArea } from "../../catalog/area";
import type { ControllerActions, View } from "../../contracts";
import type { DetailViewState } from "../../state/detailViewState";

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

export class DetailView implements View {
    private readonly _root: HTMLElement;
    private readonly _actions: ControllerActions;
    private readonly _area: GeoArea;
    private readonly _state: DetailViewState;
    private readonly _mapFactory: LeafletMapFactory;

    private _element?: HTMLElement;
    private _mapRoot?: HTMLElement;
    private _map?: L.Map;

    constructor(
        root: HTMLElement,
        actions: ControllerActions,
        area: GeoArea,
        state: DetailViewState,
        mapFactory: LeafletMapFactory = new DefaultLeafletMapFactory()
    ) {
        this._root = root;
        this._actions = actions;
        this._area = area;
        this._state = state;
        this._mapFactory = mapFactory;

        void this._actions;
    }

    create(): void {
        this._element = document.createElement("div");
        this._element.className = "detail-view";

        this._mapRoot = document.createElement("div");
        this._mapRoot.className = "detail-map";

        this._element.appendChild(this._mapRoot);
        this._root.appendChild(this._element);
    }

    render(): void {
        if (!this._mapRoot) {
            this.create();
        }

        if (!this._map) {
            this.createMap();
        }
    }

    destroy(): void {
        this._map?.remove();
        this._map = undefined;

        this._element?.remove();
        this._element = undefined;
        this._mapRoot = undefined;
    }

    private createMap(): void {
        let center;
        let zoom;

        if (!this._mapRoot) {
            return;
        }

        if (this._state) {
            center = this._state.center;
            zoom = this._state.zoom;
        } else {
            center = this._area.summary.center;
            zoom = 12;
        }

        this._map = this._mapFactory.createMap(this._mapRoot, center, zoom);
    }
}