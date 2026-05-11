import type { SummaryViewState } from "./summaryViewState";
import type { DetailViewState } from "./detailViewState";

export interface GeoState {
    loadSummaryViewState(): SummaryViewState;
    saveSummaryViewState(state: SummaryViewState): void;

    loadDetailViewState(areaId: string): DetailViewState | undefined;
    saveDetailViewState(state: DetailViewState): void;
}
