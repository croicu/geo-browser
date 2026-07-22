import { describe, expect, it } from "vitest";
import { DEFAULT_CENTER, DEFAULT_ZOOM, MapViewState } from "../../../src/state/mapViewState";

describe("MapViewState", () => {
    it("uses defaults when constructed with no data", () => {
        const state = new MapViewState();

        expect(state.center).toEqual(DEFAULT_CENTER);
        expect(state.zoom).toBe(DEFAULT_ZOOM);
    });

    it("roundtrips through toJSON / fromJSON", () => {
        const state = new MapViewState({
            center: [40.8518, 14.2681],
            zoom: 7,
        });

        const restored = MapViewState.fromJSON(state.toJSON());

        expect(restored.center).toEqual([40.8518, 14.2681]);
        expect(restored.zoom).toBe(7);
    });
});
