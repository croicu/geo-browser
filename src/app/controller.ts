import { getLogger } from "../services";
import { GeoCatalog } from "../catalog/catalog";
import { Context } from "../runtime/context";
import type { ControllerActions, ControllerState, GatewayService, StorageService, View } from "../contracts";
import type { LatLng } from "../protocols";
import type { GeoState } from "../state/geoState";
import { AddArea, OK } from "../api";

import { GeoStateStore } from "../state/geoStateStore";
import { SummaryViewState } from "../state/summaryViewState";
import { SummaryView } from "../view/summary/summaryView";
import { DetailView } from "../view/detail/detailView";
import { DetailViewState } from "../state/detailViewState";
import { fail } from "../errors";

export interface ControllerOptions {
    catalog: GeoCatalog;
    storage: StorageService;
    gateway: GatewayService | null;
    initialCenter?: LatLng;
    initialZoom?: number;
}

export class Controller implements ControllerActions, ControllerState, GeoState {
    private readonly _catalog: GeoCatalog;
    private readonly _gateway: GatewayService | null;
    private readonly _geoStateStore: GeoStateStore;
    private readonly _summaryViewState: SummaryViewState;
    private _detailViewState?: DetailViewState;
    private _app!: HTMLElement;
    private _view?: View;
    private _zoomLevel: number = 12;

    constructor(options: ControllerOptions) {
        this._catalog = options.catalog;
        this._gateway = options.gateway;
        this._geoStateStore = new GeoStateStore(options.storage);
        this._summaryViewState = this._geoStateStore.loadSummaryViewState();

        if (options.initialCenter !== undefined) {
            this._summaryViewState.center = options.initialCenter;
        }
        if (options.initialZoom !== undefined) {
            this._summaryViewState.zoom = options.initialZoom;
        }
    }

    async start(): Promise<void> {
        const logger = getLogger();

        logger.info("geo-browser starting", {
            center: this._summaryViewState.center,
            zoom: this._summaryViewState.zoom,
        });

        const app = document.querySelector<HTMLDivElement>("#app");
        if (!app) {
            fail("app.missing_root", "Missing #app element.");
        }
        this._app = app;

        await this._catalog.load();

        logger.info("catalog loaded", {
            areaCount: this._catalog.areas.length,
        });

        this.openSummary();
    }

    get catalog(): GeoCatalog | undefined {
        return this._catalog;
    }

    // ControllerActions

    async openSummary(): Promise<void> {
        getLogger().info("open summary");

        const summaryView: View = new SummaryView(
            this._app,
            this,
            this._catalog,
            this._summaryViewState,
            { gateway: this._gateway }
        );

        this.switchView(summaryView);
    }

    async openDetail(areaId: string): Promise<void> {
        getLogger().info("open detail", { areaId });

        const area = this._catalog.getArea(areaId);

        await area.load();

        const saved = this.loadDetailViewState(areaId);

        const visibleLayers: Record<string, boolean> = {};
        for (const layer of area.layers) {
            visibleLayers[layer.id] = saved
                ? saved.isLayerVisible(layer.id, layer.isVisible())
                : layer.isVisible();
        }

        this._detailViewState = new DetailViewState({
            areaId: area.id,
            center: saved?.center ?? area.center,
            zoom: saved?.zoom ?? this._zoomLevel,
            visibleLayers,
        });

        const detailView: View = new DetailView(
            this._app,
            this,
            area,
            this._detailViewState,
            { gateway: this._gateway, geoLocation: Context.Instance.geoLocation }
        );

        this.switchView(detailView);
    }

    setLayerVisible(
        areaId: string,
        layerId: string,
        visible: boolean
    ): void {
        this._catalog.getArea(areaId);

        if (!this._detailViewState) {
            fail("detail_state.missing", "DetailViewState is not available.");
        }

        this._detailViewState.setLayerVisible(layerId, visible);
        this.saveDetailViewState(this._detailViewState);

        this._view?.render();
    }

    saveSummaryViewport(center: [number, number], zoom: number): void {
        this._summaryViewState.center = center;
        this._summaryViewState.zoom = zoom;
        this.saveSummaryViewState(this._summaryViewState);
    }

    saveDetailViewport(areaId: string, center: [number, number], zoom: number): void {
        if (!this._detailViewState || this._detailViewState.areaId !== areaId) {
            return;
        }
        this._detailViewState.center = center;
        this._detailViewState.zoom = zoom;
        this.saveDetailViewState(this._detailViewState);
    }

    newArea(): void {
        getLogger().info("new area");
    }

    commitArea(bbox: [number, number, number, number], name: string): void {
        const logger = getLogger();
        logger.info("commit area", { bbox, name });

        if (!this._gateway) {
            logger.warning("commitArea: no gateway, ignoring");
            return;
        }

        this._gateway.invoke(AddArea, { areaName: name, bbox }, (response) => {
            if (response.error !== OK) {
                logger.error("commitArea failed", undefined, {
                    error: response.error,
                    errorDescription: response.errorDescription,
                });
                // Defer so any in-flight click events from the name-prompt OK button
                // settle before the new summary view mounts its bubble markers.
                setTimeout(() => this.openSummary(), 0);
                return;
            }

            if (response.area) {
                this._catalog.addArea(response.area);
            }

            const areaId = response.area?.id;
            setTimeout(() => areaId ? this.openDetail(areaId) : this.openSummary(), 0);
        });
    }

    discardArea(): void {
        getLogger().info("discard area");
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

    // GeoState

    loadSummaryViewState(): SummaryViewState {
        return this._geoStateStore.loadSummaryViewState();
    }

    saveSummaryViewState(state: SummaryViewState): void {
        this._geoStateStore.saveSummaryViewState(state);
    }

    loadDetailViewState(areaId: string): DetailViewState | undefined {
        return this._geoStateStore.loadDetailViewState(areaId);
    }

    saveDetailViewState(state: DetailViewState): void {
        this._geoStateStore.saveDetailViewState(state);
    }

    // Private

    private switchView(nextView: View): void {
        const previousView = this._view;

        this._view = nextView;
        this._view.render();

        previousView?.destroy();
    }
}
