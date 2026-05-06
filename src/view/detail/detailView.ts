import type { GeoArea } from "../../catalog/area";
import type { ControllerActions, View } from "../../contracts";
import { fail } from "../../errors";
import type { DetailViewState } from "../../state/detailViewState";

export class DetailView implements View {
    private readonly _root: HTMLElement;
    private readonly _actions: ControllerActions;
    private readonly _area: GeoArea;
    private readonly _state: DetailViewState;

    private _element: HTMLElement;
    private _mapRoot: HTMLElement;

    constructor(
        root: HTMLElement,
        actions: ControllerActions,
        area: GeoArea,
        state: DetailViewState
    ) {
        this._root = root;
        this._actions = actions;
        this._area = area;
        this._state = state;

        void this._actions;
        void this._state;
    }

    render(): void {
        if (!this._mapRoot) {
            this.create();
        }

        // Leaflet later.
        this._mapRoot.textContent = `Detail: ${this._area.id}`;
    }

    destroy(): void {
        this._element?.remove();

        this._element = undefined;
        this._mapRoot = undefined;
    }

    create(): void {
        this._element = document.createElement("div");
        this._element.className = "detail-view";

        this._mapRoot = document.createElement("div");
        this._mapRoot.className = "detail-map";

        this._element.appendChild(this._mapRoot);
        this._root.appendChild(this._element);
    }
}