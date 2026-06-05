import { describe, expect, it, vi } from "vitest";
import { StarRatingControl } from "../../src/view/detail/starRatingControl";
import type { StarCount } from "../../src/view/detail/starRatingControl";

describe("StarRatingControl", () => {
    describe("render", () => {
        it("always creates five star images", () => {
            const ctrl = new StarRatingControl({ mode: "readonly" });
            const el = ctrl.render();
            expect(el.querySelectorAll(".star-rating-star").length).toBe(5);
        });

        it("fills stars up to the initial value in readonly mode", () => {
            const ctrl = new StarRatingControl({ mode: "readonly", value: 3 });
            const el = ctrl.render();
            const imgs = el.querySelectorAll<HTMLImageElement>(".star-rating-star");
            expect(imgs[0].src).toContain("gold_star.svg");
            expect(imgs[1].src).toContain("gold_star.svg");
            expect(imgs[2].src).toContain("gold_star.svg");
            expect(imgs[3].src).toContain("empty_star.svg");
            expect(imgs[4].src).toContain("empty_star.svg");
        });

        it("shows all empty stars when no value is set", () => {
            const ctrl = new StarRatingControl({ mode: "readonly" });
            const el = ctrl.render();
            const imgs = el.querySelectorAll<HTMLImageElement>(".star-rating-star");
            for (const img of imgs) {
                expect(img.src).toContain("empty_star.svg");
            }
        });

        it("adds interactive CSS class for interactive mode", () => {
            const ctrl = new StarRatingControl({ mode: "interactive" });
            const el = ctrl.render();
            expect(el.classList.contains("star-rating--interactive")).toBe(true);
        });

        it("does not add interactive CSS class for readonly mode", () => {
            const ctrl = new StarRatingControl({ mode: "readonly" });
            const el = ctrl.render();
            expect(el.classList.contains("star-rating--interactive")).toBe(false);
        });
    });

    describe("interactive mode", () => {
        it("calls onChange with the clicked star count", () => {
            const onChange = vi.fn<(stars: StarCount) => void>();
            const ctrl = new StarRatingControl({ mode: "interactive", onChange });
            const el = ctrl.render();

            const imgs = el.querySelectorAll<HTMLImageElement>(".star-rating-star");
            imgs[2].click(); // click 3rd star

            expect(onChange).toHaveBeenCalledOnce();
            expect(onChange).toHaveBeenCalledWith(3);
        });

        it("fills stars up to clicked position after click", () => {
            const ctrl = new StarRatingControl({ mode: "interactive", onChange: vi.fn() });
            const el = ctrl.render();

            const imgs = el.querySelectorAll<HTMLImageElement>(".star-rating-star");
            imgs[1].click(); // click 2nd star

            expect(imgs[0].src).toContain("gold_star.svg");
            expect(imgs[1].src).toContain("gold_star.svg");
            expect(imgs[2].src).toContain("empty_star.svg");
        });

        it("re-fires onChange on a second click with the new value", () => {
            const onChange = vi.fn<(stars: StarCount) => void>();
            const ctrl = new StarRatingControl({ mode: "interactive", onChange });
            const el = ctrl.render();

            const imgs = el.querySelectorAll<HTMLImageElement>(".star-rating-star");
            imgs[4].click(); // 5 stars
            imgs[0].click(); // 1 star

            expect(onChange).toHaveBeenCalledTimes(2);
            expect(onChange).toHaveBeenLastCalledWith(1);
        });
    });

    describe("readonly mode", () => {
        it("does not call onChange when stars are clicked", () => {
            const onChange = vi.fn();
            const ctrl = new StarRatingControl({ mode: "readonly", value: 2, onChange });
            const el = ctrl.render();

            const imgs = el.querySelectorAll<HTMLImageElement>(".star-rating-star");
            imgs[4].click();

            expect(onChange).not.toHaveBeenCalled();
        });
    });
});
