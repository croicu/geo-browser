import { describe, expect, it, beforeEach } from "vitest";
import { SummaryViewState } from "../../../src/state/summaryViewState";

describe("SummaryViewState", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("uses defaults", () => {
        const state = new SummaryViewState();

        expect(state.center).toEqual([0, 0]);
        expect(state.zoom).toBe(2);
    });

    it("loads saved state", () => {
        localStorage.setItem("geo-browser.summaryViewState", JSON.stringify({
            center: [40.8518, 14.2681],
            zoom: 7,
            selectedAreaId: "napoli",
        }));

        const state = SummaryViewState.load();

        expect(state.center).toEqual([40.8518, 14.2681]);
        expect(state.zoom).toBe(7);
        expect(state.selectedAreaId).toBe("napoli");
    });

    it("falls back when storage is invalid", () => {
        localStorage.setItem("geo-browser.summaryViewState", "{bad json");

        const state = SummaryViewState.load();

        expect(state.center).toEqual([0, 0]);
        expect(state.zoom).toBe(2);
    });

    it("saves state", () => {
        const state = new SummaryViewState({
            center: [1, 2],
            zoom: 5,
            selectedAreaId: "napoli",
        });

        state.save();

        const raw = localStorage.getItem("geo-browser.summaryViewState");
        expect(raw).not.toBeNull();

        const data = JSON.parse(raw!);
        expect(data.center).toEqual([1, 2]);
        expect(data.zoom).toBe(5);
        expect(data.selectedAreaId).toBe("napoli");
    });
});