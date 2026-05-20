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
        let stopped = false;
        let removePermissionListener: (() => void) | null = null;

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
                    if (stopped) return;
                    const handler = () => {
                        if (status.state === "granted") {
                            startWatch();
                            onRecovered();
                        }
                    };
                    status.addEventListener("change", handler);
                    removePermissionListener = () => status.removeEventListener("change", handler);
                    if (stopped) {
                        removePermissionListener();
                        removePermissionListener = null;
                    }
                })
                .catch(() => {});
        }

        return () => {
            stopped = true;
            if (watchId !== null) {
                navigator.geolocation.clearWatch(watchId);
                watchId = null;
            }
            removePermissionListener?.();
            removePermissionListener = null;
        };
    }
}
