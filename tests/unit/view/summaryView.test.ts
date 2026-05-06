import { describe, expect, it } from "vitest";
import { SummaryView } from "../../../src/view/summary/summaryView";
import { SummaryViewState } from "../../../src/state/summaryViewState";

import type { ControllerActions } from "../../../src/contracts";
import type { GeoCatalog } from "../../../src/catalog/catalog";

class FakeActions implements ControllerActions {
    openSummary(): void {}
    openDetail(_areaId: string): void {}
    zoomIn(): void {}
    zoomOut(): void {}
    setZoom(_zoomLevel: number): void {}
}

describe("SummaryView", () => {
    it("renders summary shell", () => {
        const root = document.createElement("div");
        const state = new SummaryViewState();
        const actions = new FakeActions();

        const catalog = {
            areas: [],
        } as unknown as GeoCatalog;

        const view = new SummaryView(root, actions, catalog, state);

        view.render();

        expect(root.querySelector(".summary-map")).not.toBeNull();
        expect(root.querySelector(".world-map")).not.toBeNull();
        expect(root.querySelector(".bubbles-layer")).not.toBeNull();
        expect(view.bubblesRoot.className).toBe("bubbles-layer");
    });
});