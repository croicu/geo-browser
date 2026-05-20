import type { GeoLocationService, GeoPosition } from "../contracts";

export class BrowserGeoLocationService implements GeoLocationService {
    get isAvailable(): boolean {
        return !!navigator.geolocation;
    }

    watch(
        onPosition: (position: GeoPosition) => void,
        onDenied: () => void,
        onRecovered?: () => void
    ): () => void {
        if (!navigator.geolocation) {
            onDenied();
            return () => {};
        }

        let watchId: number | null = null;
        const permissionCleanups: (() => void)[] = [];

        const startWatch = () => {
            watchId = navigator.geolocation.watchPosition(
                (pos) => {
                    onPosition({
                        latLng: [pos.coords.latitude, pos.coords.longitude],
                        accuracy: pos.coords.accuracy,
                    });
                },
                (error) => {
                    if (error.code === GeolocationPositionError.PERMISSION_DENIED) {
                        if (watchId !== null) {
                            navigator.geolocation.clearWatch(watchId);
                            watchId = null;
                        }
                        onDenied();
                    }
                },
                { enableHighAccuracy: true }
            );
        };

        startWatch();

        if (onRecovered && navigator.permissions) {
            navigator.permissions.query({ name: "geolocation" })
                .then((status) => {
                    const handler = () => {
                        if (status.state === "granted") {
                            startWatch();
                            onRecovered();
                        }
                    };
                    status.addEventListener("change", handler);
                    permissionCleanups.push(() => status.removeEventListener("change", handler));
                })
                .catch(() => {});
        }

        return () => {
            if (watchId !== null) {
                navigator.geolocation.clearWatch(watchId);
                watchId = null;
            }
            for (const cleanup of permissionCleanups) {
                cleanup();
            }
            permissionCleanups.length = 0;
        };
    }
}
