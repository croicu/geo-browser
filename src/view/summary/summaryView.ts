// view/summary/SummaryView.ts

import type { ControllerActions, View } from "../../contracts"
import { BubbleWidget } from "./bubbleWidget";
import { SummaryViewState } from "../../state/summaryViewState";
import type { GeoCatalog } from "../../catalog/catalog";

export class SummaryView implements View {
    private readonly _root: HTMLElement;
    private readonly _actions: ControllerActions;
    private readonly _catalog: GeoCatalog;
    private readonly _state: SummaryViewState;
    private _main: HTMLElement;
    private _bubblesRoot?: HTMLElement;
    private _bubbleWidgets: BubbleWidget[] = [];

    constructor(
        root: HTMLElement, 
        actions: ControllerActions, 
        catalog: GeoCatalog, 
        state: SummaryViewState
    ) {
        this._root = root;
        this._actions = actions;
        this._catalog = catalog;
        this._state = state;

        void this._state;
    }

    destroy(): void {
        this._main?.remove();

        this._main = undefined;
        this._main = undefined;
    }

    get bubblesRoot(): HTMLElement {
        if (!this._bubblesRoot) {
            throw new Error("SummaryView has not been rendered.");
        }

        return this._bubblesRoot;
    }

    render(): void {
        if (!this._main)
            this.create();

        for (const bubbleWidget of this._bubbleWidgets) {
            bubbleWidget.render();
        }
    }

    private create(): void {
        this._main = document.createElement("main");
        this._main.className = "summary-map";

        const worldMap = document.createElement("img");
        worldMap.className = "world-map";
        worldMap.src = "/world.svg";
        worldMap.alt = "World map";

        const bubblesLayer = document.createElement("div");
        bubblesLayer.className = "bubbles-layer";

        this._main.appendChild(worldMap);
        this._main.appendChild(bubblesLayer);

        this._root.appendChild(this._main);
        this._bubblesRoot = bubblesLayer;

        this._bubbleWidgets = [];

        for (const area of this._catalog.areas) {
            const bubbleView = new BubbleWidget(
                this.bubblesRoot,
                area,
                this._actions
            );

            this._bubbleWidgets.push(bubbleView);
       }
    }

}