import type {
    AccuracyRingHandle,
    GeoLocationService,
    GeoLocationWidgetHandle,
    GeoPosition,
    HeadingService,
    LayerFactory,
    MapHandle,
    PositionMarkerHandle,
    WidgetFactory,
} from "../../contracts";

export class GeoLocationWidget {
    private readonly _map: MapHandle;
    private readonly _service: GeoLocationService;
    private readonly _widgetFactory: WidgetFactory;
    private readonly _layerFactory: LayerFactory;
    private readonly _bounds?: { sw: [number, number]; ne: [number, number] };
    private readonly _debug: boolean;
    private readonly _headingService?: HeadingService;

    private _handle?: GeoLocationWidgetHandle;
    private _accuracyRing?: AccuracyRingHandle;
    private _positionMarker?: PositionMarkerHandle;
    private _stopWatching?: () => void;
    private _stopWatchingMove?: () => void;
    private _stopWatchingZoom?: () => void;
    private _stopWatchingHeading?: () => void;
    private _following = false;
    private _programmaticMove = false;
    private _lastPosition?: GeoPosition;
    private _sensorHeading: number | null = null;
    private _headingPermissionRequested = false;
    private _debugHeading = 0;
    private _debugInterval?: ReturnType<typeof setInterval>;

    constructor(
        map: MapHandle,
        service: GeoLocationService,
        widgetFactory: WidgetFactory,
        layerFactory: LayerFactory,
        bounds?: { sw: [number, number]; ne: [number, number] },
        debug = false,
        headingService?: HeadingService
    ) {
        this._map = map;
        this._service = service;
        this._widgetFactory = widgetFactory;
        this._layerFactory = layerFactory;
        this._bounds = bounds;
        this._debug = debug;
        this._headingService = headingService;
    }

    render(): void {
        if (this._handle) {
            return;
        }

        this._handle = this._widgetFactory.createGeoLocationWidget(
            this._service.isAvailable,
            () => this.onToggle()
        );
        this._handle.addTo(this._map);

        if (this._service.isAvailable) {
            this._stopWatching = this._service.watch(
                pos => this.onPosition(pos),
                () => this.onDenied(),
                () => this.onRecovered()
            );
        }

        if (this._headingService?.isAvailable) {
            this._stopWatchingHeading = this._headingService.watch(h => this.onSensorHeading(h));
        }

        this._stopWatchingMove = this._map.onMoveEnd(() => this.onMapMoved());
        this._stopWatchingZoom = this._map.onZoom(() => this.cancelFollowing());
    }

    destroy(): void {
        this._stopWatching?.();
        this._stopWatching = undefined;
        this._stopWatchingMove?.();
        this._stopWatchingMove = undefined;
        this._stopWatchingZoom?.();
        this._stopWatchingZoom = undefined;
        this._stopWatchingHeading?.();
        this._stopWatchingHeading = undefined;

        clearInterval(this._debugInterval);
        this._debugInterval = undefined;

        this._accuracyRing?.remove();
        this._accuracyRing = undefined;

        this._positionMarker?.remove();
        this._positionMarker = undefined;

        this._handle?.remove();
        this._handle = undefined;

        this._following = false;
        this._lastPosition = undefined;
        this._sensorHeading = null;
    }

    private onToggle(): void {
        this._following = !this._following;
        this._handle?.setFollowing(this._following);

        if (this._following && !this._headingPermissionRequested && this._headingService) {
            this._headingPermissionRequested = true;
            void this._headingService.requestPermission();
        }

        if (this._following && this._lastPosition) {
            this._programmaticMove = true;
            this._map.panTo(this._lastPosition.latLng);
        }
    }

    private onSensorHeading(heading: number | null): void {
        this._sensorHeading = heading;
        if (heading !== null) {
            this._positionMarker?.setHeading(heading);
        }
    }

    private onPosition(position: GeoPosition): void {
        this._lastPosition = position;

        if (!this.isInBounds(position.latLng)) {
            if (this._following) {
                this._following = false;
                this._handle?.setFollowing(false);
            }
            this._handle?.setAvailable(false);
        } else {
            this._handle?.setAvailable(true);
        }

        if (this._accuracyRing) {
            this._accuracyRing.setLatLng(position.latLng);
            this._accuracyRing.setRadius(position.accuracy);
        } else {
            this._accuracyRing = this._layerFactory.createAccuracyRing(position.latLng, position.accuracy);
            this._accuracyRing.addTo(this._map);
        }

        if (this._positionMarker) {
            this._positionMarker.setLatLng(position.latLng);
        } else {
            this._positionMarker = this._layerFactory.createPositionMarker(position.latLng);
            this._positionMarker.addTo(this._map);
        }

        if (this._sensorHeading === null) {
            this._positionMarker.setHeading(position.heading);
        }

        const noHeading = this._sensorHeading === null && position.heading === null;
        if (this._debug && noHeading && !this._debugInterval) {
            this._debugInterval = setInterval(() => this.tickDebugHeading(), 50);
        }

        if (this._following) {
            this._programmaticMove = true;
            this._map.panTo(position.latLng);
        }
    }

    private tickDebugHeading(): void {
        this._debugHeading = (this._debugHeading + 2) % 360;
        this._positionMarker?.setHeading(this._debugHeading);
    }

    private isInBounds(latLng: [number, number]): boolean {
        if (!this._bounds) {
            return true;
        }
        const { sw, ne } = this._bounds;
        return latLng[0] >= sw[0] && latLng[0] <= ne[0]
            && latLng[1] >= sw[1] && latLng[1] <= ne[1];
    }

    private onMapMoved(): void {
        if (this._programmaticMove) {
            this._programmaticMove = false;
            return;
        }
        this.cancelFollowing();
    }

    private cancelFollowing(): void {
        if (!this._following) return;
        this._following = false;
        this._handle?.setFollowing(false);
    }

    private onDenied(): void {
        this._following = false;
        clearInterval(this._debugInterval);
        this._debugInterval = undefined;
        this._accuracyRing?.remove();
        this._accuracyRing = undefined;
        this._positionMarker?.remove();
        this._positionMarker = undefined;
        this._handle?.setAvailable(false);
        this._handle?.setFollowing(false);
    }

    getLastPosition(): [number, number] | undefined {
        return this._lastPosition?.latLng;
    }

    private onRecovered(): void {
        this._handle?.setAvailable(true);
    }
}
