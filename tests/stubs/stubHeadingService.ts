import type { HeadingService } from "../../src/contracts";

export class StubHeadingService implements HeadingService {
    public available = true;
    public watchCalled = false;
    public permissionRequested = false;
    private _onHeading?: (heading: number | null) => void;

    get isAvailable(): boolean {
        return this.available;
    }

    async requestPermission(): Promise<boolean> {
        this.permissionRequested = true;
        return true;
    }

    watch(onHeading: (heading: number | null) => void): () => void {
        this.watchCalled = true;
        this._onHeading = onHeading;
        return () => { this._onHeading = undefined; };
    }

    simulateHeading(heading: number | null): void {
        this._onHeading?.(heading);
    }
}
