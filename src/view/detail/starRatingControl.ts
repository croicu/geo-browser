import { getLogger } from "../../services";

export type StarCount = 1 | 2 | 3 | 4 | 5;

export interface StarRatingControlOptions {
    mode: "interactive" | "readonly";
    value?: StarCount;
    onChange?: (stars: StarCount) => void;
}

export class StarRatingControl {
    private readonly _options: StarRatingControlOptions;
    private _current: StarCount | undefined;
    private _imgs: HTMLImageElement[] = [];

    constructor(options: StarRatingControlOptions) {
        this._options = options;
        this._current = options.value;
    }

    render(): HTMLElement {
        const log = getLogger();
        log.info("star_rating.render.start", { mode: this._options.mode, value: this._current });

        const container = document.createElement("div");
        container.className = "star-rating";
        if (this._options.mode === "interactive") {
            container.classList.add("star-rating--interactive");
        }

        for (let i = 1; i <= 5; i++) {
            const img = document.createElement("img");
            img.className = "star-rating-star";
            img.alt = `${i} star${i > 1 ? "s" : ""}`;
            this.updateImg(img, i, this._current);
            this._imgs.push(img);

            if (this._options.mode === "interactive") {
                const position = i as StarCount;
                img.addEventListener("click", () => this.onStarClick(position));
            }

            container.appendChild(img);
        }

        log.info("star_rating.render.end");
        return container;
    }

    private onStarClick(stars: StarCount): void {
        const log = getLogger();
        log.info("star_rating.click", { stars });
        this._current = stars;
        this.refreshDisplay();
        this._options.onChange?.(stars);
    }

    private refreshDisplay(): void {
        this._imgs.forEach((img, i) => this.updateImg(img, i + 1, this._current));
    }

    private updateImg(img: HTMLImageElement, position: number, current: StarCount | undefined): void {
        const filled = current !== undefined && position <= current;
        img.src = filled ? "/icons/gold_star.svg" : "/icons/empty_star.svg";
    }
}
