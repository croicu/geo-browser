import type { AreaSummary, Catalog } from "../protocols";
import { GeoArea } from "./area";

export class GeoCatalog {
    private readonly catalogUrl: string;
    _version: number;
    _createdAt: string;
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

        this._version = catalog.version;
        this._createdAt = catalog.createdAt;
        this._areas = catalog.areas.map((area: AreaSummary) => new GeoArea(area));
    }

    get version(): number {

        return this._version;
    }

    get createdAt(): string {

        return this._createdAt;
    }
    
    get areas(): readonly GeoArea[] {
        if (!this._areas) {
            throw new Error("Catalog not loaded");
        }

        return this._areas;
    }

    getArea(areaId: string): GeoArea {
        if (!this._areas) {
            throw new Error("Catalog not loaded");
        }

        const area = this._areas.find((area) => area.id === areaId);

        if (!area) {
            throw new Error(`Area not found: ${areaId}`);
        }

        return area;
    }
    
    isLoaded(): boolean {

        return this._areas !== undefined;
    }
}