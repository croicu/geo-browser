import type { ControllerActions } from "../../src/contracts";

export class StubActions implements ControllerActions {
    public openedSummary = false;
    public openedDetailAreaId?: string;
    public setLayerVisibleAreaId?: string;
    public setLayerVisibleLayerId?: string;
    public setLayerVisibleValue?: boolean;

    openSummary(): void {
        this.openedSummary = true;
    }

    openDetail(areaId: string): void {
        this.openedDetailAreaId = areaId;
    }

    setLayerVisible(areaId: string, layerId: string, visible: boolean): void {
        this.setLayerVisibleAreaId = areaId;
        this.setLayerVisibleLayerId = layerId;
        this.setLayerVisibleValue = visible;
    }

    zoomIn(): void {}
    zoomOut(): void {}
    setZoom(): void {}
}
