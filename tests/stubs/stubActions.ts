import type { ControllerActions } from "../../src/contracts";

export class StubActions implements ControllerActions {
    public setLayerVisibleAreaId?: string;
    public setLayerVisibleLayerId?: string;
    public setLayerVisibleValue?: boolean;

    setLayerVisible(areaId: string, layerId: string, visible: boolean): void {
        this.setLayerVisibleAreaId = areaId;
        this.setLayerVisibleLayerId = layerId;
        this.setLayerVisibleValue = visible;
    }

    newArea(): void {}
    commitArea(_bbox: [number, number, number, number], _name: string): void {}
    discardArea(): void {}
}
