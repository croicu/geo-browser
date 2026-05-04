// view/summary/bubbleView.ts

import type { AreaSummary } from "../../protocols";

export interface BubbleViewLayout {
    x: number;
    y: number;
    radius: number;
    imageUrl: string;
}

export class BubbleView {
    private readonly _root: HTMLElement;
    private readonly _area: AreaSummary;
    private _element?: HTMLDivElement;
    private _image?: HTMLImageElement;
    private _label?: HTMLSpanElement;

    constructor(root: HTMLElement, area: AreaSummary) {
        this._root = root;
        this._area = area;
    }

    get areaId(): string {
        return this._area.id;
    }

    render(layout: BubbleViewLayout): void {
        if (!this._element) {
            this._element = document.createElement("div");
            this._element.className = "bubble-view";
            this._element.dataset.areaId = this._area.id;

            this._image = document.createElement("img");
            this._image.className = "bubble-image";
            this._image.alt = this._area.name;

            this._label = document.createElement("span");
            this._label.className = "bubble-label";

            this._element.appendChild(this._image);
            this._element.appendChild(this._label);
            this._root.appendChild(this._element);
        }

        const diameter = layout.radius * 2;

        // position
        this._element.style.position = "absolute";
        this._element.style.left = `${layout.x}px`;
        this._element.style.top = `${layout.y}px`;
        this._element.style.transform = "translate(-50%, -50%)";

        // image
        this._image!.src = layout.imageUrl;
        this._image!.style.width = `${diameter}px`;
        this._image!.style.height = `${diameter}px`;
        this._image!.style.display = "block";

        // label
        this._label!.textContent = this._area.name;
    }

    remove(): void {
        this._element?.remove();
        this._element = undefined;
        this._image = undefined;
        this._label = undefined;
    }
}