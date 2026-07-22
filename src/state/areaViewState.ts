// state/areaViewState.ts

import type { AreaViewStateData } from "../protocols";

// Per-area layer-visibility preferences (tasks/layer_lifecycle.md) — no
// center/zoom anymore, since there's one shared map viewport (MapViewState)
// rather than one per area. Successor of DetailViewState.
export class AreaViewState {
    private readonly _areaId: string;
    private _visibleLayers: Record<string, boolean>;

    constructor(data: AreaViewStateData) {
        this._areaId = data.areaId;
        this._visibleLayers = data.visibleLayers ?? {};
    }

    get areaId(): string {
        return this._areaId;
    }

    get visibleLayers(): Record<string, boolean> {
        return this._visibleLayers;
    }

    setLayerVisible(layerId: string, visible: boolean): void {
        this._visibleLayers[layerId] = visible;
    }

    isLayerVisible(layerId: string, defaultVisible: boolean = false): boolean {
        return this._visibleLayers[layerId] ?? defaultVisible;
    }

    toJSON(): AreaViewStateData {
        return {
            areaId: this._areaId,
            visibleLayers: this._visibleLayers,
        };
    }

    static fromJSON(data: AreaViewStateData): AreaViewState {
        return new AreaViewState(data);
    }
}
