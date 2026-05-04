import { describe, expect, it } from "vitest";
import { SummaryView } from "../../../src/view/summary/summaryView";
import { SummaryViewState } from "../../../src/state/summaryViewState";

// minimal stub
const catalogStub = {
    areas: [],
};

describe("SummaryView", () => {
    it("renders summary shell", () => {
        const root = document.createElement("div");
        const state = new SummaryViewState();
        const view = new SummaryView(root, state);

        view.render(catalogStub as any);

        expect(root.querySelector(".summary-map")).not.toBeNull();
        expect(root.querySelector(".world-map")).not.toBeNull();
        expect(root.querySelector(".bubbles-layer")).not.toBeNull();
        expect(view.bubblesRoot.className).toBe("bubbles-layer");
    });
});