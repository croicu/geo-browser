import { describe, expect, it } from "vitest";
import { DEFAULT_CENTER, DEFAULT_ZOOM, SummaryViewState } from "../../../src/state/summaryViewState";

describe("SummaryViewState", () => {
    it("uses defaults when constructed with no data", () => {
        const state = new SummaryViewState();

        expect(state.center).toEqual(DEFAULT_CENTER);
        expect(state.zoom).toBe(DEFAULT_ZOOM);
    });

    it("roundtrips through toJSON / fromJSON", () => {
        const state = new SummaryViewState({
            center: [40.8518, 14.2681],
            zoom: 7,
            selectedAreaId: "napoli",
        });

        const restored = SummaryViewState.fromJSON(state.toJSON());

        expect(restored.center).toEqual([40.8518, 14.2681]);
        expect(restored.zoom).toBe(7);
        expect(restored.selectedAreaId).toBe("napoli");
    });
});
