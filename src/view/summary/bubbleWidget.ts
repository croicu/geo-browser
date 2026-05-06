import type { GeoArea } from "../../catalog/area";
import type { ControllerActions, Widget } from "../../contracts";

export class BubbleWidget implements Widget {
    private readonly _root: HTMLElement;
    private readonly _area: GeoArea;
    private readonly _actions: ControllerActions;

    private _element?: HTMLElement;
    private _image?: HTMLImageElement;
    private _label?: HTMLSpanElement;

    public constructor(
        root: HTMLElement,
        area: GeoArea,
        actions: ControllerActions
    ) {
        this._root = root;
        this._area = area;
        this._actions = actions;
    }

    public render(): void {
        if (!this._image) {
            this.create();
        }

        const radius = this._area.minRadiusPx;
        const diameter = radius * 2;
        const imageUrl = this.getImageUrl(diameter);

        // Temporary layout until summary geo projection is added.
        const x = 850;
        const y = 300;

        this._element.style.position = "absolute";
        this._element.style.left = `${x - radius}px`;
        this._element.style.top = `${y - radius}px`;
        this._element.style.width = `${diameter}px`;
        this._element.style.height = `${diameter}px`;

        this._image.style.width = `100%`;
        this._image.style.height = `100%`;

        this._image.src = imageUrl;
    }

    public destroy(): void {
        this._element?.remove();

        this._element = undefined;
        this._image = undefined;
        this._label = undefined;
    }

    private create(): void {
        if (this._image) {
            return;
        }

        this._element = document.createElement("div");
        this._element.className = "bubble-widget";
        this._element.title = this._area.name;
        this._element.dataset.areaId = this._area.id;

        this._image = document.createElement("img");
        this._image.className = "bubble-image";
        this._image.alt = this._area.name;
        this._image.draggable = false;

        this._label = document.createElement("span");
        this._label.className = "bubble-label";
        this._label.textContent = this._area.name;

        this._element.appendChild(this._image);
        this._element.appendChild(this._label);

        this._element.addEventListener("click", () => this.onClick());

        this._root.appendChild(this._element);
    }

    private onClick(): void {
        this._actions.openDetail(this._area.id);
    }

    private getImageUrl(targetPx: number): string {
        const summary = this._area.summary;
        const sorted = [...summary.images].sort((a, b) => a.sizePx - b.sizePx);
        const match = sorted.find((image) => image.sizePx >= targetPx);
 
        return match?.url ?? sorted[sorted.length - 1]?.url ?? "";
    }
}