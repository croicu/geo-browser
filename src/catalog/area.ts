import type { AreaDetail, AreaSummary } from "../protocols";
import { GeoLayer } from "./layer";

export class GeoArea {
    private readonly summary: AreaSummary;
    private _detail: AreaDetail | undefined;
    private _layers: GeoLayer[] | undefined;

    constructor(summary: AreaSummary) {
        this.summary = summary;
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

    get id(): string {
        return this.summary.id;
    }

    get name(): string {
        return this.summary.name;
    }

    get center(): [number, number] {
        return this.summary.center;
    }
    get radiusMeters(): number {
        return this.summary.radiusMeters;
    }

    get detail(): AreaDetail | undefined
    {
        return this._detail;
    }
}