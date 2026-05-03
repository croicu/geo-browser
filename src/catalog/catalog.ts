import type { AreaSummary, Catalog } from "../protocols";
import { GeoArea } from "./area";

export class GeoCatalog {
    private readonly catalogUrl: string;
    private _areas: GeoArea[] | undefined;

    constructor(catalogUrl: string) {
        this.catalogUrl = catalogUrl;
    }

    async load(): Promise<void> {
        if (this._areas) {
            return;
        }

        const response = await fetch(this.catalogUrl, { cache: "no-store" });

        if (!response.ok) {
            throw new Error(`Failed to load catalog: ${this.catalogUrl}`);
        }

        const catalog = (await response.json()) as Catalog;

        this._areas = catalog.areas.map(
            (area: AreaSummary) => new GeoArea(area),
        );
    }

    get areas(): readonly GeoArea[] {
        if (!this._areas) {
            throw new Error("Catalog not loaded");
        }
        return this._areas;
    }

    isLoaded(): boolean {
        return this._areas !== undefined;
    }
}