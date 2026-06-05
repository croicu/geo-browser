import { getLogger } from "../../services";
import { StarRatingControl } from "./starRatingControl";
import type { StarCount } from "./starRatingControl";

export interface EmptyCalloutWidgetOptions {
    latLng: [number, number];
    showCoords?: boolean;
    showMapLinks?: boolean;
    existingStars?: StarCount;
    onStarSelected?: (stars: StarCount) => void;
}

export class EmptyCalloutWidget {
    private readonly _options: EmptyCalloutWidgetOptions;

    constructor(options: EmptyCalloutWidgetOptions) {
        this._options = options;
    }

    render(): HTMLElement {
        const log = getLogger();
        log.info("empty_callout.render.start");

        const { latLng, showCoords, showMapLinks, existingStars, onStarSelected } = this._options;

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
        if (starRow) {
            root.appendChild(document.createElement("br"));
            root.appendChild(starRow);
        }

        log.info("empty_callout.render.end");
        return root;
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
