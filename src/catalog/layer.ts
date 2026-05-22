import { fail } from "../errors";
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

    get type(): string | undefined {
        return this._data.type;
    }

    get url(): string | null {
        return this._data.url;
    }

    isVirtual(): boolean {
        return this._data.url === null;
    }

    get style(): LayerStyle | undefined {
        return this._data.style;
    }
    
    get payload(): unknown {
        if (!this._payload) {
            fail("layer.not_loaded", `Layer has not been loaded: ${this.id}`, undefined, { layerId: this.id });
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

    invalidate(): void {
        this._payload = undefined;
    }

    async load(): Promise<void> {
        if (this._payload !== undefined || this._data.url === null) {
            return;
        }

        const response = await fetch(this._data.url, {
            cache: "no-store",
        });

        if (!response.ok) {
            fail("layer.load_failed", `Failed to load layer: ${this._data.url}`, undefined, { layerId: this.id });
        }

        this._payload = await response.json();
    }
}