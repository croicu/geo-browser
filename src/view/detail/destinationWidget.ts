import type {
    DestinationMarkerHandle,
    DestinationPoint,
    DestinationStore,
    LayerFactory,
    MapHandle,
    PositionMarkerHandle,
} from "../../contracts";
import { computeBearing } from "../../geo/bearing";
import { getLogger } from "../../services";

const PANE_NAME = "destination-pane";
// Below Leaflet's default markerPane (600) so the blue GPS indicator always renders on top —
// see tasks/destination_marker.md.
const PANE_Z_INDEX = "550";

export interface DestinationWidgetOptions {
    onMarkerTapped: (point: DestinationPoint) => void;
}

// Renders the fixed destination pin and the bearing cone anchored on the live GPS position.
// Passive with respect to GPS: does not start its own position watch, only reacts to
// onPosition() calls fed by GeoLocationWidget.onPositionUpdate (see DetailView wiring).
export class DestinationWidget {
    private readonly _map: MapHandle;
    private readonly _layerFactory: LayerFactory;
    private readonly _store: DestinationStore;
    private readonly _options: DestinationWidgetOptions;

    private _destination: DestinationPoint | null = null;
    private _lastPosition: [number, number] | null = null;
    private _marker?: DestinationMarkerHandle;
    private _cone?: PositionMarkerHandle;
    private _pane?: string;

    constructor(
        map: MapHandle,
        layerFactory: LayerFactory,
        store: DestinationStore,
        options: DestinationWidgetOptions
    ) {
        this._map = map;
        this._layerFactory = layerFactory;
        this._store = store;
        this._options = options;
    }

    render(): void {
        const log = getLogger();
        log.info("destination_widget.render.start");
        this._destination = this._store.get();
        this.syncMarker();
        this.syncCone();
        log.info("destination_widget.render.end", { hasDestination: this._destination !== null });
    }

    setDestination(point: DestinationPoint | null): void {
        this._destination = point;
        this.syncMarker();
        this.syncCone();
    }

    onPosition(latLng: [number, number] | null): void {
        this._lastPosition = latLng;
        this.syncCone();
    }

    destroy(): void {
        this._marker?.remove();
        this._marker = undefined;
        this._cone?.remove();
        this._cone = undefined;
    }

    private ensurePane(): string {
        if (!this._pane) {
            const pane = this._map.createPane(PANE_NAME);
            pane.style.zIndex = PANE_Z_INDEX;
            this._pane = PANE_NAME;
        }
        return this._pane;
    }

    private syncMarker(): void {
        this._marker?.remove();
        this._marker = undefined;
        if (!this._destination) return;

        const destination = this._destination;
        const latLng: [number, number] = [destination.lat, destination.lng];
        const marker = this._layerFactory.createDestinationMarker(latLng, this.ensurePane());
        marker.onClick(() => this._options.onMarkerTapped(destination));
        marker.addTo(this._map);
        this._marker = marker;
    }

    private syncCone(): void {
        if (!this._destination) {
            this._cone?.remove();
            this._cone = undefined;
            return;
        }
        if (!this._lastPosition) {
            this._cone?.setHeading(null);
            return;
        }

        const bearing = computeBearing(this._lastPosition, [this._destination.lat, this._destination.lng]);
        if (!this._cone) {
            this._cone = this._layerFactory.createDestinationCone(this._lastPosition, this.ensurePane());
            this._cone.addTo(this._map);
        }
        this._cone.setLatLng(this._lastPosition);
        this._cone.setHeading(bearing);
    }
}
