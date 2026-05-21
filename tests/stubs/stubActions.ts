import type { ControllerActions } from "../../src/contracts";

export class StubActions implements ControllerActions {
    public openedSummary = false;
    public openedDetailAreaId?: string;
    public openedDetailCenter?: [number, number];
    public openedDetailZoom?: number;
    public setLayerVisibleAreaId?: string;
    public setLayerVisibleLayerId?: string;
    public setLayerVisibleValue?: boolean;
    public savedSummaryCenter?: [number, number];
    public savedSummaryZoom?: number;
    public savedDetailAreaId?: string;
    public savedDetailCenter?: [number, number];
    public savedDetailZoom?: number;

    openSummary(): void {
        this.openedSummary = true;
    }

    openDetail(areaId: string, center?: [number, number], zoom?: number): void {
        this.openedDetailAreaId = areaId;
        this.openedDetailCenter = center;
        this.openedDetailZoom = zoom;
    }

    setLayerVisible(areaId: string, layerId: string, visible: boolean): void {
        this.setLayerVisibleAreaId = areaId;
        this.setLayerVisibleLayerId = layerId;
        this.setLayerVisibleValue = visible;
    }

    saveSummaryViewport(center: [number, number], zoom: number): void {
        this.savedSummaryCenter = center;
        this.savedSummaryZoom = zoom;
    }

    saveDetailViewport(areaId: string, center: [number, number], zoom: number): void {
        this.savedDetailAreaId = areaId;
        this.savedDetailCenter = center;
        this.savedDetailZoom = zoom;
    }

    zoomIn(): void {}
    zoomOut(): void {}
    setZoom(): void {}
    newArea(): void {}
    commitArea(_bbox: [number, number, number, number], _name: string): void {}
    discardArea(): void {}
}
