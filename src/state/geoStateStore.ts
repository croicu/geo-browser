import type { StorageService } from "../contracts";
import type { GeoState, LastViewData } from "./geoState";
import { SummaryViewState } from "./summaryViewState";
import { DetailViewState } from "./detailViewState";

const KEY_SUMMARY = "geo-browser.summaryViewState";
const KEY_DETAIL = "geo-browser.detailViewState.";
const KEY_LAST_VIEW = "geo-browser.lastView";

export class GeoStateStore implements GeoState {
    private readonly _storage: StorageService;

    constructor(storage: StorageService) {
        this._storage = storage;
    }

    loadSummaryViewState(): SummaryViewState {
        const raw = this._storage.getItem(KEY_SUMMARY);

        if (!raw) {
            return new SummaryViewState();
        }

        try {
            return SummaryViewState.fromJSON(JSON.parse(raw));
        } catch {
            return new SummaryViewState();
        }
    }

    saveSummaryViewState(state: SummaryViewState): void {
        this._storage.setItem(KEY_SUMMARY, JSON.stringify(state.toJSON()));
    }

    loadDetailViewState(areaId: string): DetailViewState | undefined {
        const raw = this._storage.getItem(`${KEY_DETAIL}${areaId}`);

        if (!raw) {
            return undefined;
        }

        try {
            return DetailViewState.fromJSON(JSON.parse(raw));
        } catch {
            return undefined;
        }
    }

    saveDetailViewState(state: DetailViewState): void {
        this._storage.setItem(
            `${KEY_DETAIL}${state.areaId}`,
            JSON.stringify(state.toJSON())
        );
    }

    loadLastView(): LastViewData | null {
        const raw = this._storage.getItem(KEY_LAST_VIEW);
        if (!raw) return null;
        try {
            return JSON.parse(raw) as LastViewData;
        } catch {
            return null;
        }
    }

    saveLastView(data: LastViewData): void {
        this._storage.setItem(KEY_LAST_VIEW, JSON.stringify(data));
    }
}
