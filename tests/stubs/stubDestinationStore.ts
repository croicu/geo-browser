import type { DestinationPoint, DestinationStore } from "../../src/contracts";

export class StubDestinationStore implements DestinationStore {
    private _point: DestinationPoint | null = null;

    get(): DestinationPoint | null {
        return this._point;
    }

    set(point: DestinationPoint): void {
        this._point = point;
    }

    clear(): void {
        this._point = null;
    }
}
