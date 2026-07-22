import { getLogger } from "../services";
import { GeoCatalog } from "../catalog/catalog";
import { Context } from "../runtime/context";
import type { ControllerActions, GatewayService, StorageService } from "../contracts";
import type { LatLng } from "../protocols";
import { AddArea, OK } from "../api";

import { GeoStateStore } from "../state/geoStateStore";
import { MapViewState } from "../state/mapViewState";
import { MapView } from "../view/map/mapView";
import { LocalStorageUserPointsStore, GatewayUserPointsStore } from "../runtime/userPointsStore";
import { LocalStorageDestinationStore } from "../runtime/destinationStore";
import { fail } from "../errors";
import { initStatusWidget } from "../view/statusWidget";

export interface ControllerOptions {
    catalog: GeoCatalog;
    storage: StorageService;
    gateway: GatewayService | null;
    initialCenter?: LatLng;
    initialZoom?: number;
}

export class Controller implements ControllerActions {
    private readonly _catalog: GeoCatalog;
    private readonly _gateway: GatewayService | null;
    private readonly _geoStateStore: GeoStateStore;
    private readonly _viewportState: MapViewState;
    private _app!: HTMLElement;
    private _mapView?: MapView;

    constructor(options: ControllerOptions) {
        this._catalog = options.catalog;
        this._gateway = options.gateway;
        this._geoStateStore = new GeoStateStore(options.storage);
        this._viewportState = this._geoStateStore.loadMapViewState();

        if (options.initialCenter !== undefined) {
            this._viewportState.center = options.initialCenter;
        }
        if (options.initialZoom !== undefined) {
            this._viewportState.zoom = options.initialZoom;
        }
    }

    async start(): Promise<void> {
        const logger = getLogger();

        logger.info("geo-browser starting", {
            center: this._viewportState.center,
            zoom: this._viewportState.zoom,
        });

        const app = document.querySelector<HTMLDivElement>("#app");
        if (!app) {
            fail("app.missing_root", "Missing #app element.");
        }
        this._app = app;
        initStatusWidget();

        await this._catalog.load();

        logger.info("catalog loaded", {
            areaCount: this._catalog.areas.length,
        });

        const userPointsStore = this._gateway
            ? new GatewayUserPointsStore(this._gateway)
            : new LocalStorageUserPointsStore(Context.Instance.storage);
        const destinationStore = new LocalStorageDestinationStore(Context.Instance.storage);

        this._mapView = new MapView(
            this._app,
            this,
            this._geoStateStore,
            this._catalog,
            this._viewportState,
            {
                gateway: this._gateway,
                geoLocation: Context.Instance.geoLocation,
                userPointsStore,
                destinationStore,
            }
        );
        this._mapView.render();
    }

    get catalog(): GeoCatalog | undefined {
        return this._catalog;
    }

    // ControllerActions

    setLayerVisible(
        areaId: string,
        layerId: string,
        visible: boolean
    ): void {
        this.mapView.setLayerVisible(areaId, layerId, visible);
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
                return;
            }

            if (response.area) {
                this._catalog.addArea(response.area);
                const areaId = response.area.id;
                // Defer so any in-flight click events from the name-prompt OK
                // button settle before panning/zooming to the new area.
                setTimeout(() => this.mapView.addAreaAndFocus(areaId), 0);
            }
        });
    }

    discardArea(): void {
        getLogger().info("discard area");
    }

    // Private

    private get mapView(): MapView {
        if (!this._mapView) {
            fail("map_view.missing", "MapView is not available.");
        }
        return this._mapView;
    }
}
