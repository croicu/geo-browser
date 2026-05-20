import type { GeoLocationService, GeoPosition } from "../../src/contracts";

export class StubGeoLocationService implements GeoLocationService {
    public available = true;
    public watchCalled = false;
    private _onPosition?: (position: GeoPosition) => void;
    private _onDenied?: () => void;
    private _onRecovered?: () => void;

    get isAvailable(): boolean {
        return this.available;
    }

    watch(
        onPosition: (position: GeoPosition) => void,
        onDenied: () => void,
        onRecovered?: () => void
    ): () => void {
        this.watchCalled = true;
        this._onPosition = onPosition;
        this._onDenied = onDenied;
        this._onRecovered = onRecovered;
        return () => {
            this._onPosition = undefined;
            this._onDenied = undefined;
            this._onRecovered = undefined;
        };
    }

    simulatePosition(latLng: [number, number], accuracy = 50): void {
        this._onPosition?.({ latLng, accuracy });
    }

    simulateDenied(): void {
        this._onDenied?.();
    }

    simulateRecovery(): void {
        this._onRecovered?.();
    }
}
