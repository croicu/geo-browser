import type { Layer, LayerStyle } from "../protocols";

export class GeoLayer {
    private readonly _data: Layer;
    private _payload?: unknown;

    constructor(data: Layer) {
        this._data = data;
    }

    get id(): string {
        return this._data.id;
    }

    get name(): string | undefined {
        return this._data.name;
    }

    get url(): string {
        return this._data.url;
    }

    get style(): LayerStyle {
        return this._data.style;
    }
    
    get payload(): unknown {
        if (!this._payload) {
            throw new Error(`Layer has not been loaded: ${this.id}`);
        }

        return this._payload;
    }

    isVisible(): boolean {
        return this._data.visible;
    }

    isHeatmap(): boolean {
        return this._data.type === "heatmap";
    }

    isLoaded(): boolean {
        return this._payload !== undefined;
    }

    async load(): Promise<void> {
        if (this._payload !== undefined) {
            return;
        }

        const response = await fetch(this._data.url, {
            cache: "no-store",
        });

        if (!response.ok) {
            throw new Error(`Failed to load layer: ${this._data.url}`);
        }

        this._payload = await response.json();
    }
}