import { fail } from "../errors";
import type { AreaDetail, AreaImage, AreaSummary } from "../protocols";
import { GeoLayer } from "./layer";
import { resolveUrl } from "./loader";

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
            fail("area.load_failed", `Failed to load area: ${this.summary.manifestUrl}`);
        }

        const detail = (await response.json()) as AreaDetail;

        this._detail = detail;
        this._layers = detail.layers.map((l) => {
            const url = l.url != null ? resolveUrl(l.url, this.summary.manifestUrl) : null;
            return new GeoLayer({ ...l, url });
        });
    }

    get layers(): readonly GeoLayer[] {
        if (!this._layers) {
            fail("area.not_loaded", "Area not loaded");
        }
        return this._layers;
    }

    async reload(): Promise<void> {
        this._detail = undefined;
        this._layers = undefined;
        await this.load();
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

    get bbox(): [number, number, number, number] {
        return this._summary.bbox;
    }

    get center(): [number, number] {
        const [west, south, east, north] = this._summary.bbox;
        return [(south + north) / 2, (west + east) / 2];
    }

    get radiusMeters(): number {
        const [west, south, east, north] = this._summary.bbox;
        const lat = (south + north) / 2;
        const latRadius = (north - south) * 111320 / 2;
        const lngRadius = (east - west) * 111320 * Math.cos(lat * Math.PI / 180) / 2;
        return (latRadius + lngRadius) / 2;
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