// view/summary/SummaryView.ts

import { GeoCatalog } from "../../catalog/catalog";
import { SummaryViewState } from "../../state/summaryViewState";

export class SummaryView {
    private readonly _root: HTMLElement;
    private readonly _state: SummaryViewState;
    private _bubblesRoot?: HTMLElement;

    constructor(root: HTMLElement, state: SummaryViewState) {
        this._root = root;
        this._state = state;
    }

    get bubblesRoot(): HTMLElement {
        if (!this._bubblesRoot) {
            throw new Error("SummaryView has not been rendered.");
        }

        return this._bubblesRoot;
    }

    render(catalog: GeoCatalog): void {
        this._root.innerHTML = "";

        const main = document.createElement("main");
        main.className = "summary-map";

        const worldMap = document.createElement("img");
        worldMap.className = "world-map";
        worldMap.src = "/world.svg";
        worldMap.alt = "World map";

        const bubblesLayer = document.createElement("div");
        bubblesLayer.className = "bubbles-layer";

        main.appendChild(worldMap);
        main.appendChild(bubblesLayer);

        this._root.appendChild(main);

        this._bubblesRoot = bubblesLayer;

        void catalog;
        void this._state;
    }
}