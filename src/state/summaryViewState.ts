// state/SummaryViewState.ts
import type { SummaryViewStateData, LatLng } from "../protocols";
import { isLatLng, isNumber, isString } from "../validate"

const DEFAULT_CENTER: LatLng = [0, 0];
const DEFAULT_ZOOM = 2;
const STORAGE_KEY = "geo-browser.summaryViewState";

export class SummaryViewState {
    private _center: LatLng;
    private _zoom: number;
    private _selectedAreaId?: string;
    private _hoveredAreaId?: string;

    constructor(data?: unknown) {
        if (!data || typeof data !== "object") {
            this._center = DEFAULT_CENTER;
            this._zoom = DEFAULT_ZOOM;
            return;
        }

        const d = data as Partial<SummaryViewStateData>;

        this._center = isLatLng(d.center) ? d.center : DEFAULT_CENTER;
        this._zoom = isNumber(d.zoom) ? d.zoom : DEFAULT_ZOOM;

        this._selectedAreaId = isString(d.selectedAreaId)
            ? d.selectedAreaId
            : undefined;

        this._hoveredAreaId = isString(d.hoveredAreaId)
            ? d.hoveredAreaId
            : undefined;
    }

    // --- center ---
    get center(): LatLng {
        return this._center;
    }

    set center(value: LatLng) {
        this._center = value;
    }

    // --- zoom ---
    get zoom(): number {
        return this._zoom;
    }

    set zoom(value: number) {
        this._zoom = value;
    }

    // --- selectedAreaId ---
    get selectedAreaId(): string | undefined {
        return this._selectedAreaId;
    }

    set selectedAreaId(value: string | undefined) {
        this._selectedAreaId = value;
    }

    // --- hoveredAreaId ---
    get hoveredAreaId(): string | undefined {
        return this._hoveredAreaId;
    }

    set hoveredAreaId(value: string | undefined) {
        this._hoveredAreaId = value;
    }

    save(): void {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.toJSON()));
    }

    static load(): SummaryViewState {
        const value = localStorage.getItem(STORAGE_KEY);

        if (!value) {
            return new SummaryViewState();
        }

        try {
            return SummaryViewState.fromJSON(JSON.parse(value));
        } catch {
            return new SummaryViewState();
        }
    }

    // --- serialization ---
    toJSON(): SummaryViewStateData {
        return {
            center: this._center,
            zoom: this._zoom,
            selectedAreaId: this._selectedAreaId,
            hoveredAreaId: this._hoveredAreaId,
        };
    }

    static fromJSON(data: SummaryViewStateData): SummaryViewState {
        return new SummaryViewState(data);
    }
}