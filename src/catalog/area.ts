import type { AreaDetail, AreaImage, AreaSummary } from "../protocols";
import { GeoLayer } from "./layer";

export class GeoArea {
    private readonly _summary: AreaSummary;
    private _detail: AreaDetail | undefined;
    private _layers: GeoLayer[] | undefined;

    constructor(summary: AreaSummary) {
        this._summary = summary;
    }

    async load(): Promise<void> {
        if (this._layers) {
            return;
        }

        const response = await fetch(this.summary.manifestUrl, {
            cache: "no-store",
        });

        if (!response.ok) {
            throw new Error(`Failed to load area: ${this.summary.manifestUrl}`);
        }

        const detail = (await response.json()) as AreaDetail;

        this._detail = detail;
        this._layers = detail.layers.map((l) => new GeoLayer(l));
    }

    get layers(): readonly GeoLayer[] {
        if (!this._layers) {
            throw new Error("Area not loaded");
        }
        return this._layers;
    }

    isLoaded(): boolean {
        return this._layers !== undefined;
    }

    get summary(): AreaSummary {
        return this._summary;
    }

    get id(): string {
        return this._summary.id;
    }

    get name(): string {
        return this._summary.name;
    }

    get center(): [number, number] {
        return this._summary.center;
    }

    get radiusMeters(): number {
        return this._summary.radiusMeters;
    }

    get minRadiusPx(): number {
        return this._summary.minRadiusPx;
    }

    get maxRadiusPx(): number {
        return this._summary.maxRadiusPx;
    }

    get images(): AreaImage[]
    {
        return this._summary.images;
    }
    
    get detail(): AreaDetail | undefined
    {
        return this._detail;
    }
}