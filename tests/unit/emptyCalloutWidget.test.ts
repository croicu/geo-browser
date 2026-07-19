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
            const onStarSelected = vi.fn<(stars: StarCount) => void>();
            const widget = new EmptyCalloutWidget({ latLng, onStarSelected });
            const el = widget.render();

            const imgs = el.querySelectorAll<HTMLImageElement>(".star-rating-star");
            imgs[2].click(); // 3rd star

            expect(onStarSelected).toHaveBeenCalledOnce();
            expect(onStarSelected).toHaveBeenCalledWith(3);
        });
    });

    describe("bookmark toggle", () => {
        it("shows no bookmark button when onBookmarkToggled is not provided", () => {
            const widget = new EmptyCalloutWidget({ latLng });
            const el = widget.render();
            expect(el.querySelector(".callout-bookmark-btn")).toBeNull();
        });

        it("shows bookmark button when onBookmarkToggled is provided", () => {
            const widget = new EmptyCalloutWidget({ latLng, onBookmarkToggled: vi.fn() });
            const el = widget.render();
            expect(el.querySelector(".callout-bookmark-btn")).not.toBeNull();
        });

        it("shows empty bookmark icon when isBookmarked is false", () => {
            const widget = new EmptyCalloutWidget({ latLng, isBookmarked: false, onBookmarkToggled: vi.fn() });
            const el = widget.render();
            const img = el.querySelector<HTMLImageElement>(".callout-bookmark-icon");
            expect(img?.src).toContain("bookmark.svg");
            expect(img?.src).not.toContain("solid_bookmark.svg");
        });

        it("shows solid bookmark icon when isBookmarked is true", () => {
            const widget = new EmptyCalloutWidget({ latLng, isBookmarked: true, onBookmarkToggled: vi.fn() });
            const el = widget.render();
            const img = el.querySelector<HTMLImageElement>(".callout-bookmark-icon");
            expect(img?.src).toContain("solid_bookmark.svg");
        });

        it("calls onBookmarkToggled with true on first click", () => {
            const onBookmarkToggled = vi.fn<(bookmarked: boolean) => void>();
            const widget = new EmptyCalloutWidget({ latLng, isBookmarked: false, onBookmarkToggled });
            const el = widget.render();
            (el.querySelector(".callout-bookmark-btn") as HTMLButtonElement).click();
            expect(onBookmarkToggled).toHaveBeenCalledWith(true);
        });

        it("calls onBookmarkToggled with false on second click", () => {
            const onBookmarkToggled = vi.fn<(bookmarked: boolean) => void>();
            const widget = new EmptyCalloutWidget({ latLng, isBookmarked: false, onBookmarkToggled });
            const el = widget.render();
            const btn = el.querySelector(".callout-bookmark-btn") as HTMLButtonElement;
            btn.click();
            btn.click();
            expect(onBookmarkToggled).toHaveBeenCalledTimes(2);
            expect(onBookmarkToggled).toHaveBeenLastCalledWith(false);
        });

        it("toggles icon src on click", () => {
            const widget = new EmptyCalloutWidget({ latLng, isBookmarked: false, onBookmarkToggled: vi.fn() });
            const el = widget.render();
            const btn = el.querySelector(".callout-bookmark-btn") as HTMLButtonElement;
            const img = el.querySelector<HTMLImageElement>(".callout-bookmark-icon")!;
            btn.click();
            expect(img.src).toContain("solid_bookmark.svg");
            btn.click();
            expect(img.src).toContain("bookmark.svg");
            expect(img.src).not.toContain("solid_bookmark.svg");
        });
    });

    describe("delete button", () => {
        it("shows no delete button when onDeleteRequested is not provided", () => {
            const widget = new EmptyCalloutWidget({ latLng });
            const el = widget.render();
            expect(el.querySelector(".callout-delete-btn")).toBeNull();
        });

        it("shows delete button when onDeleteRequested is provided", () => {
            const widget = new EmptyCalloutWidget({ latLng, onDeleteRequested: vi.fn() });
            const el = widget.render();
            const img = el.querySelector<HTMLImageElement>(".callout-delete-icon");
            expect(img?.src).toContain("delete.svg");
        });

        it("fires onDeleteRequested when clicked", () => {
            const onDeleteRequested = vi.fn();
            const widget = new EmptyCalloutWidget({ latLng, onDeleteRequested });
            const el = widget.render();
            (el.querySelector(".callout-delete-btn") as HTMLButtonElement).click();
            expect(onDeleteRequested).toHaveBeenCalledOnce();
        });

        it("takes priority over the bookmark toggle when both are provided", () => {
            const widget = new EmptyCalloutWidget({
                latLng,
                onDeleteRequested: vi.fn(),
                onBookmarkToggled: vi.fn(),
            });
            const el = widget.render();
            expect(el.querySelector(".callout-delete-btn")).not.toBeNull();
            expect(el.querySelector(".callout-bookmark-btn")).toBeNull();
        });
    });

    describe("destination toggle", () => {
        it("shows no destination button when onDestinationToggled is not provided", () => {
            const widget = new EmptyCalloutWidget({ latLng });
            const el = widget.render();
            expect(el.querySelector(".callout-destination-btn")).toBeNull();
        });

        it("shows destination button when onDestinationToggled is provided", () => {
            const widget = new EmptyCalloutWidget({ latLng, onDestinationToggled: vi.fn() });
            const el = widget.render();
            const img = el.querySelector<HTMLImageElement>(".callout-destination-icon");
            expect(img?.src).toContain("destination.svg");
        });

        it("is not marked active when isDestination is false", () => {
            const widget = new EmptyCalloutWidget({ latLng, isDestination: false, onDestinationToggled: vi.fn() });
            const el = widget.render();
            expect(el.querySelector(".callout-destination-btn")?.classList.contains("active")).toBe(false);
        });

        it("is marked active when isDestination is true", () => {
            const widget = new EmptyCalloutWidget({ latLng, isDestination: true, onDestinationToggled: vi.fn() });
            const el = widget.render();
            expect(el.querySelector(".callout-destination-btn")?.classList.contains("active")).toBe(true);
        });

        it("shows the plain destination icon when isDestination is false", () => {
            const widget = new EmptyCalloutWidget({ latLng, isDestination: false, onDestinationToggled: vi.fn() });
            const el = widget.render();
            const img = el.querySelector<HTMLImageElement>(".callout-destination-icon");
            expect(img?.src).toContain("/icons/destination.svg");
            expect(img?.src).not.toContain("remove_destination.svg");
        });

        it("shows the remove_destination icon when isDestination is true", () => {
            const widget = new EmptyCalloutWidget({ latLng, isDestination: true, onDestinationToggled: vi.fn() });
            const el = widget.render();
            const img = el.querySelector<HTMLImageElement>(".callout-destination-icon");
            expect(img?.src).toContain("/icons/remove_destination.svg");
        });

        it("fires onDestinationToggled when clicked", () => {
            const onDestinationToggled = vi.fn();
            const widget = new EmptyCalloutWidget({ latLng, onDestinationToggled });
            const el = widget.render();
            (el.querySelector(".callout-destination-btn") as HTMLButtonElement).click();
            expect(onDestinationToggled).toHaveBeenCalledOnce();
        });

        it("renders independently alongside the delete button (no mutual exclusivity)", () => {
            const widget = new EmptyCalloutWidget({
                latLng,
                onDeleteRequested: vi.fn(),
                onDestinationToggled: vi.fn(),
            });
            const el = widget.render();
            expect(el.querySelector(".callout-delete-btn")).not.toBeNull();
            expect(el.querySelector(".callout-destination-btn")).not.toBeNull();
        });

        it("renders independently alongside the bookmark toggle (no mutual exclusivity)", () => {
            const widget = new EmptyCalloutWidget({
                latLng,
                onBookmarkToggled: vi.fn(),
                onDestinationToggled: vi.fn(),
            });
            const el = widget.render();
            expect(el.querySelector(".callout-bookmark-btn")).not.toBeNull();
            expect(el.querySelector(".callout-destination-btn")).not.toBeNull();
        });

        it("groups bookmark and destination together in the right-aligned actions wrapper", () => {
            const widget = new EmptyCalloutWidget({
                latLng,
                onBookmarkToggled: vi.fn(),
                onDestinationToggled: vi.fn(),
            });
            const el = widget.render();
            const actions = el.querySelector(".callout-actions-right");
            expect(actions).not.toBeNull();
            expect(actions!.querySelector(".callout-bookmark-btn")).not.toBeNull();
            expect(actions!.querySelector(".callout-destination-btn")).not.toBeNull();
        });

        it("right-aligns the destination button even with no star row (bare destination pin callout)", () => {
            const widget = new EmptyCalloutWidget({ latLng, isDestination: true, onDestinationToggled: vi.fn() });
            const el = widget.render();
            const actions = el.querySelector(".callout-actions-right");
            expect(actions).not.toBeNull();
            expect(actions!.querySelector(".callout-destination-btn")).not.toBeNull();
            expect(el.querySelector(".star-rating")).toBeNull();
        });
    });
});
