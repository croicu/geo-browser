import { describe, expect, it } from "vitest";
import { GeoArea } from "../../../src/catalog/area";
import { BubbleWidget } from "../../../src/view/summary/bubbleWidget";

import type { ControllerActions } from "../../../src/contracts";
import type { AreaSummary } from "../../../src/protocols";

class FakeActions implements ControllerActions {
    public openedDetailAreaId: string | undefined;

    openSummary(): void {}

    openDetail(areaId: string): void {
        this.openedDetailAreaId = areaId;
    }

    zoomIn(): void {}
    zoomOut(): void {}
    setZoom(_zoomLevel: number): void {}
}

const areaSummary: AreaSummary = {
    id: "napoli",
    name: "Napoli",
    center: [40.8518, 14.2681],
    radiusMeters: 12000,
    minRadiusPx: 32,
    maxRadiusPx: 512,
    liveMapRadiusPx: 640,
    manifestUrl: "/areas/napoli/manifest.json",
    images: [
        { sizePx: 64, url: "/areas/napoli/intro/happy_r_64.png" },
    ],
};

describe("BubbleWidget", () => {
    it("renders image and label", () => {
        const root = document.createElement("div");
        const area = new GeoArea(areaSummary);
        const actions = new FakeActions();
        const widget = new BubbleWidget(root, area, actions);

        widget.render();

        const bubble = root.querySelector(".bubble-widget") as HTMLElement;
        const image = root.querySelector(".bubble-image") as HTMLImageElement;
        const label = root.querySelector(".bubble-label") as HTMLElement;

        expect(bubble.dataset.areaId).toBe("napoli");
        expect(image.src).toContain("/areas/napoli/intro/happy_r_64.png");
        expect(image.alt).toBe("Napoli");
        expect(label.textContent).toBe("Napoli");

        expect(bubble.style.width).toBe("64px");
        expect(bubble.style.height).toBe("64px");
        expect(image.style.width).toBe("100%");
        expect(image.style.height).toBe("100%");
    });

    it("opens detail on click", () => {
        const root = document.createElement("div");
        const area = new GeoArea(areaSummary);
        const actions = new FakeActions();
        const widget = new BubbleWidget(root, area, actions);

        widget.render();

        const bubble = root.querySelector(".bubble-image") as HTMLElement;
        bubble.click();

        expect(actions.openedDetailAreaId).toBe("napoli");
    });

    it("destroys itself", () => {
        const root = document.createElement("div");
        const area = new GeoArea(areaSummary);
        const actions = new FakeActions();
        const widget = new BubbleWidget(root, area, actions);

        widget.render();
        widget.destroy();

        expect(root.children.length).toBe(0);
    });
});