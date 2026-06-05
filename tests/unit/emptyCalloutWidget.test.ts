import { describe, expect, it, vi } from "vitest";
import { EmptyCalloutWidget } from "../../src/view/detail/emptyCalloutWidget";
import type { StarCount } from "../../src/view/detail/starRatingControl";

describe("EmptyCalloutWidget", () => {
    const latLng: [number, number] = [40.8518, 14.2681];

    describe("coords and map links", () => {
        it("always renders the title", () => {
            const widget = new EmptyCalloutWidget({ latLng });
            const el = widget.render();
            expect(el.querySelector(".poi-name")?.textContent).toBe("New Location");
        });

        it("shows coordinates with Location label when showCoords is true", () => {
            const widget = new EmptyCalloutWidget({ latLng, showCoords: true });
            const el = widget.render();
            const coords = el.querySelector(".poi-coords");
            expect(coords).not.toBeNull();
            expect(coords!.textContent).toBe("Location: 40.8518, 14.2681");
        });

        it("omits coordinates when showCoords is false", () => {
            const widget = new EmptyCalloutWidget({ latLng, showCoords: false });
            const el = widget.render();
            expect(el.querySelector(".poi-coords")).toBeNull();
        });

        it("shows map links when showMapLinks is true", () => {
            const widget = new EmptyCalloutWidget({ latLng, showMapLinks: true });
            const el = widget.render();
            const links = el.querySelectorAll<HTMLAnchorElement>("a.poi-website");
            expect(links.length).toBe(3);
        });

        it("omits map links when showMapLinks is false", () => {
            const widget = new EmptyCalloutWidget({ latLng, showMapLinks: false });
            const el = widget.render();
            expect(el.querySelectorAll("a.poi-website").length).toBe(0);
        });
    });

    describe("star row", () => {
        it("shows interactive star row when onStarSelected is provided", () => {
            const widget = new EmptyCalloutWidget({ latLng, onStarSelected: vi.fn() });
            const el = widget.render();
            expect(el.querySelector(".star-rating--interactive")).not.toBeNull();
        });

        it("shows readonly star row when existingStars is provided", () => {
            const widget = new EmptyCalloutWidget({ latLng, existingStars: 4 });
            const el = widget.render();
            expect(el.querySelector(".star-rating--interactive")).toBeNull();
            const imgs = el.querySelectorAll<HTMLImageElement>(".star-rating-star");
            expect(imgs.length).toBe(5);
            // first 4 should be filled
            expect(imgs[3].src).toContain("gold_star.svg");
            expect(imgs[4].src).toContain("empty_star.svg");
        });

        it("shows no star row when neither existingStars nor onStarSelected is provided", () => {
            const widget = new EmptyCalloutWidget({ latLng });
            const el = widget.render();
            expect(el.querySelector(".star-rating")).toBeNull();
        });

        it("prefers existingStars over onStarSelected when both are provided", () => {
            const widget = new EmptyCalloutWidget({
                latLng,
                existingStars: 2,
                onStarSelected: vi.fn(),
            });
            const el = widget.render();
            expect(el.querySelector(".star-rating--interactive")).toBeNull();
        });

        it("fires onStarSelected when an interactive star is clicked", () => {
            const onStarSelected = vi.fn<[StarCount], void>();
            const widget = new EmptyCalloutWidget({ latLng, onStarSelected });
            const el = widget.render();

            const imgs = el.querySelectorAll<HTMLImageElement>(".star-rating-star");
            imgs[2].click(); // 3rd star

            expect(onStarSelected).toHaveBeenCalledOnce();
            expect(onStarSelected).toHaveBeenCalledWith(3);
        });
    });
});
