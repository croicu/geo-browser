import { describe, expect, it } from "vitest";
import { BubbleView } from "../../../src/view/summary/bubbleView";

import type { AreaSummary } from "../../../src/protocols";

const area: AreaSummary = {
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

describe("BubbleView", () => {
    it("renders image and label", () => {
        const root = document.createElement("div");
        const view = new BubbleView(root, area);

        view.render({
            x: 100,
            y: 200,
            radius: 32,
            imageUrl: "/areas/napoli/intro/happy_r_64.png",
        });

        const bubble = root.querySelector(".bubble-view") as HTMLElement;
        const image = root.querySelector(".bubble-image") as HTMLImageElement;
        const label = root.querySelector(".bubble-label") as HTMLElement;

        expect(bubble.dataset.areaId).toBe("napoli");
        expect(image.src).toContain("/areas/napoli/intro/happy_r_64.png");
        expect(image.alt).toBe("Napoli");
        expect(label.textContent).toBe("Napoli");

        expect(bubble.style.left).toBe("100px");
        expect(bubble.style.top).toBe("200px");
        expect(image.style.width).toBe("64px");
        expect(image.style.height).toBe("64px");
    });

    it("removes itself", () => {
        const root = document.createElement("div");
        const view = new BubbleView(root, area);

        view.render({
            x: 0,
            y: 0,
            radius: 32,
            imageUrl: "/test.png",
        });

        view.remove();

        expect(root.children.length).toBe(0);
    });
});