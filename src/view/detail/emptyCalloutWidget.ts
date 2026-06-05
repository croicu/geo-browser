import { getLogger } from "../../services";
import { StarRatingControl } from "./starRatingControl";
import type { StarCount } from "./starRatingControl";

export interface EmptyCalloutWidgetOptions {
    latLng: [number, number];
    showCoords?: boolean;
    showMapLinks?: boolean;
    existingStars?: StarCount;
    isBookmarked?: boolean;
    onStarSelected?: (stars: StarCount) => void;
    onBookmarkToggled?: (bookmarked: boolean) => void;
}

export class EmptyCalloutWidget {
    private readonly _options: EmptyCalloutWidgetOptions;

    constructor(options: EmptyCalloutWidgetOptions) {
        this._options = options;
    }

    render(): HTMLElement {
        const log = getLogger();
        log.info("empty_callout.render.start");

        const { latLng, showCoords, showMapLinks, existingStars, isBookmarked, onStarSelected, onBookmarkToggled } = this._options;

        const lat = latLng[0].toFixed(4);
        const lng = latLng[1].toFixed(4);

        const root = document.createElement("div");
        root.className = "poi-popup";

        const title = document.createElement("div");
        title.className = "poi-name";
        title.textContent = "New Location";
        root.appendChild(title);

        if (showCoords) {
            const coords = document.createElement("div");
            coords.className = "poi-coords";
            coords.textContent = `Location: ${lat}, ${lng}`;
            root.appendChild(coords);
        }

        if (showMapLinks) {
            root.appendChild(document.createElement("br"));
            root.appendChild(this.buildLink(
                `https://maps.google.com/?q=${lat},${lng}`,
                "Open in Google Maps"
            ));
            root.appendChild(document.createElement("br"));
            root.appendChild(this.buildLink(
                `https://maps.apple.com/?q=${lat},${lng}`,
                "Open in Apple Maps"
            ));
            root.appendChild(document.createElement("br"));
            root.appendChild(this.buildLink(
                `https://maps.google.com/maps?q=&layer=c&cbll=${lat},${lng}`,
                "Open in Street View"
            ));
        }

        const starRow = this.buildStarRow(existingStars, onStarSelected);
        if (starRow !== null || onBookmarkToggled !== undefined) {
            root.appendChild(document.createElement("br"));
            const bottomRow = document.createElement("div");
            bottomRow.className = "callout-bottom-row";
            if (starRow) bottomRow.appendChild(starRow);
            if (onBookmarkToggled !== undefined) {
                bottomRow.appendChild(this.buildBookmarkToggle(isBookmarked ?? false, onBookmarkToggled));
            }
            root.appendChild(bottomRow);
        }

        log.info("empty_callout.render.end");
        return root;
    }

    private buildBookmarkToggle(
        isBookmarked: boolean,
        onBookmarkToggled: (bookmarked: boolean) => void
    ): HTMLElement {
        const log = getLogger();
        let active = isBookmarked;
        const btn = document.createElement("button");
        btn.className = "callout-bookmark-btn";

        const img = document.createElement("img");
        img.className = "callout-bookmark-icon";
        img.alt = "Bookmark";
        img.src = active ? "/icons/solid_bookmark.svg" : "/icons/bookmark.svg";
        btn.appendChild(img);

        btn.addEventListener("click", () => {
            log.info("empty_callout.bookmark_toggle.click", { active });
            active = !active;
            img.src = active ? "/icons/solid_bookmark.svg" : "/icons/bookmark.svg";
            onBookmarkToggled(active);
        });

        return btn;
    }

    private buildStarRow(
        existingStars: StarCount | undefined,
        onStarSelected: ((stars: StarCount) => void) | undefined
    ): HTMLElement | null {
        if (existingStars !== undefined) {
            return new StarRatingControl({ mode: "readonly", value: existingStars }).render();
        }
        if (onStarSelected !== undefined) {
            return new StarRatingControl({
                mode: "interactive",
                onChange: stars => onStarSelected(stars),
            }).render();
        }
        return null;
    }

    private buildLink(href: string, label: string): HTMLElement {
        const a = document.createElement("a");
        a.className = "poi-website";
        a.href = href;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = label;
        return a;
    }
}
