import type { Layer } from "../protocols";

export class GeoLayer {
    private readonly data: Layer;

    constructor(data: Layer) {
        this.data = data;
    }

    isVisible(): boolean {
        return this.data.visible;
    }

    isHeatmap(): boolean {
        return this.data.type === "heatmap";
    }
}