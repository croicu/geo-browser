import type { HeadingService } from "../contracts";

type DeviceOrientationEventWithPermission = typeof DeviceOrientationEvent & {
    requestPermission?: () => Promise<PermissionState>;
};

type DeviceOrientationEventWithCompass = DeviceOrientationEvent & {
    webkitCompassHeading?: number;
};

export class BrowserHeadingService implements HeadingService {
    get isAvailable(): boolean {
        return typeof DeviceOrientationEvent !== "undefined";
    }

    async requestPermission(): Promise<boolean> {
        const ctor = DeviceOrientationEvent as DeviceOrientationEventWithPermission;
        if (typeof ctor.requestPermission === "function") {
            const result = await ctor.requestPermission();
            return result === "granted";
        }
        return true;
    }

    watch(onHeading: (heading: number | null) => void): () => void {
        const handler = (event: Event) => {
            const e = event as DeviceOrientationEventWithCompass;
            if (typeof e.webkitCompassHeading === "number" && !isNaN(e.webkitCompassHeading)) {
                onHeading(e.webkitCompassHeading);
                return;
            }
            if (e.absolute && e.alpha !== null) {
                onHeading((360 - e.alpha) % 360);
                return;
            }
            onHeading(null);
        };
        window.addEventListener("deviceorientation", handler);
        return () => window.removeEventListener("deviceorientation", handler);
    }
}
