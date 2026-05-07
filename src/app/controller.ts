import { getLogger } from "../services";
import { GeoCatalog } from "../catalog/catalog";
import type { ControllerActions, ControllerState, View } from "../contracts";

import { SummaryViewState } from "../state/summaryViewState";
import { SummaryView } from "../view/summary/summaryView";
import { DetailView } from "../view/detail/detailView";
import type { DetailViewState } from "../state/detailViewState";

export interface ControllerOptions {
    catalog: GeoCatalog;
    summaryViewState?: SummaryViewState;
}

export class Controller implements ControllerActions, ControllerState {
    private readonly _catalog: GeoCatalog;
    private readonly _summaryViewState: SummaryViewState;
    private readonly _detailViewState: DetailViewState;
    private _app: HTMLElement;
    private _view?: View;
    private _zoomLevel: number = 3;

    constructor(options: ControllerOptions) {
        this._catalog = options.catalog;
        this._summaryViewState =
            options.summaryViewState ?? SummaryViewState.load();
    }

    async start(): Promise<void> {
        const logger = getLogger();

        logger.info("geo-browser starting", {
            center: this._summaryViewState.center,
            zoom: this._summaryViewState.zoom,
        });

        this._app = document.querySelector<HTMLDivElement>("#app");
        if (!this._app) {
            throw new Error("Missing #app element.");
        }

        await this._catalog.load();

        logger.info("catalog loaded", {
            areaCount: this._catalog.areas.length,
        });

        this.openSummary();
    }

    get catalog(): GeoCatalog | undefined {
        return this._catalog;
    }

    // ControlerActions
    async openSummary(): Promise<void> {
        const logger = getLogger();

        logger.info("open summary");

        const summaryView: View = new SummaryView(
            this._app, 
            this, 
            this._catalog, 
            this._summaryViewState
        );

        this.switchView(summaryView);
     }

    async openDetail(areaId: string): Promise<void> {
        const logger = getLogger();

        logger.info("open detail", { areaId });

        const area = this._catalog.getArea(areaId);
        await area.load();

        const detailView: View = new DetailView(
            this._app,
            this,
            area,
            this._detailViewState
        );

        this.switchView(detailView);
    }

    zoomIn(): void {
        this.setZoom(this._zoomLevel + 1);
    }

    zoomOut(): void {
        this.setZoom(this._zoomLevel - 1);
    }

    setZoom(zoomLevel: number): void {
        const clamped = Math.max(this.minZoom, Math.min(this.maxZoom, zoomLevel));

        if (clamped === this._zoomLevel) {
            return;
        }

        this._zoomLevel = clamped;
    }

    // ControllerState
    get zoom(): number {
        return this._zoomLevel;
    }

    get minZoom(): number {
        return 3;
    }

    get maxZoom(): number {
        return 18;
    }

    // Private methods
    private switchView(nextView: View): void {
        const previousView = this._view;

        this._view = nextView;
        this._view.render();

        previousView?.destroy();
    }    
}
 