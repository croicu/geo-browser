import googleMapsUrl from "../../../tasks/image.png?url";
import appleMapsUrl from "../../../tasks/image-1.png?url";
import type { MapHandle, WidgetHandle } from "../../contracts";
import { getLogger } from "../../services";

export interface ImageOverlayOptions {
    onImageLoaded?: () => void;
    onImageRemoved?: () => void;
}

interface OverlaySnapshot {
    url: string;
    source: string;
    offsetX: number;
    offsetY: number;
    scale: number;
    opacity: number;
    isLocked: boolean;
    anchorLatLng?: [number, number];
    anchorZoom: number;
    scaleAtAnchor: number;
}

let _snapshot: OverlaySnapshot | null = null;

export class ImageOverlayWidget {
    private readonly _map: MapHandle;
    private readonly _options: ImageOverlayOptions;

    private _toolbarHandle?: WidgetHandle;
    private _overlayDiv?: HTMLDivElement;
    private _img?: HTMLImageElement;
    private _activeUnlockedSection?: HTMLDivElement;
    private _activeLockedSection?: HTMLDivElement;
    private _opacitySlider?: HTMLInputElement;
    private _currentUrl = "";
    private _currentSource = "";
    private _currentBlobUrl?: string;
    private _pendingRestore?: OverlaySnapshot;

    private _scale = 1.0;
    private _opacity = 0.5;
    private _offsetX = 0;
    private _offsetY = 0;

    // Geo-lock state
    private _isLocked = false;
    private _anchorLatLng?: [number, number];
    private _anchorZoom = 0;
    private _scaleAtAnchor = 1.0;
    private _lockMoveCleanup?: () => void;

    // Pinch state
    private _initialPinchDistance = 0;
    private _initialScaleAtPinch = 1.0;

    // Mouse drag state
    private _isDraggingMouse = false;
    private _mouseDragStartX = 0;
    private _mouseDragStartY = 0;
    private _offsetXAtMouseDragStart = 0;
    private _offsetYAtMouseDragStart = 0;

    // Touch drag state (single finger)
    private _isDraggingTouch = false;
    private _touchDragId = 0;
    private _touchDragStartX = 0;
    private _touchDragStartY = 0;
    private _offsetXAtTouchDragStart = 0;
    private _offsetYAtTouchDragStart = 0;

    // Event cleanup
    private _wheelCleanup?: () => void;
    private _mouseDownCleanup?: () => void;
    private _mouseMoveCleanup?: () => void;
    private _mouseUpCleanup?: () => void;
    private _touchStartCleanup?: () => void;
    private _touchMoveCleanup?: () => void;
    private _touchEndCleanup?: () => void;

    constructor(map: MapHandle, options: ImageOverlayOptions = {}) {
        this._map = map;
        this._options = options;
    }

    render(): void {
        if (this._toolbarHandle) {
            return;
        }

        getLogger().info("image_overlay.render");

        const toolbar = this.buildToolbar();
        this._toolbarHandle = this._map.addControl("topleft", toolbar);
        this.registerGestureHandlers();

        if (_snapshot) {
            this.restoreFromSnapshot(_snapshot);
        }
    }

    destroy(): void {
        getLogger().info("image_overlay.destroy");
        this.saveSnapshot();

        this._lockMoveCleanup?.();
        this._lockMoveCleanup = undefined;

        this._wheelCleanup?.();
        this._wheelCleanup = undefined;

        this._mouseDownCleanup?.();
        this._mouseDownCleanup = undefined;

        this._mouseMoveCleanup?.();
        this._mouseMoveCleanup = undefined;

        this._mouseUpCleanup?.();
        this._mouseUpCleanup = undefined;

        this._touchStartCleanup?.();
        this._touchStartCleanup = undefined;

        this._touchMoveCleanup?.();
        this._touchMoveCleanup = undefined;

        this._touchEndCleanup?.();
        this._touchEndCleanup = undefined;

        this.clearOverlay();

        this._toolbarHandle?.remove();
        this._toolbarHandle = undefined;
    }

    private buildToolbar(): HTMLDivElement {
        const container = document.createElement("div");
        container.className = "image-overlay-toolbar";

        // Prevent all pointer interaction on the toolbar from reaching the map.
        // mousedown must be blocked or dragging the opacity slider pans the map.
        container.addEventListener("click", e => e.stopPropagation());
        container.addEventListener("dblclick", e => e.stopPropagation());
        container.addEventListener("mousedown", e => e.stopPropagation());
        container.addEventListener("touchstart", e => e.stopPropagation(), { passive: true });
        container.addEventListener("touchmove", e => e.stopPropagation(), { passive: true });

        const gmBtn = this.buildIconButton("/icons/img-google.svg", "Google Maps", () => this.loadImage(googleMapsUrl, "google_maps"));
        container.appendChild(gmBtn);

        const amBtn = this.buildIconButton("/icons/img-apple.svg", "Apple Maps", () => this.loadImage(appleMapsUrl, "apple_maps"));
        container.appendChild(amBtn);

        const pasteBtn = this.buildIconButton("/icons/img-paste.svg", "Paste image from clipboard", () => { void this.handlePaste(); });
        container.appendChild(pasteBtn);

        // Unlocked section: opacity slider + lock + delete
        const unlockedSection = document.createElement("div");
        unlockedSection.className = "image-overlay-toolbar-active";
        unlockedSection.hidden = true;
        this._activeUnlockedSection = unlockedSection;

        const slider = document.createElement("input");
        slider.type = "range";
        slider.min = "0";
        slider.max = "100";
        slider.value = String(Math.round(this._opacity * 100));
        slider.className = "image-overlay-opacity-slider";
        slider.title = "Opacity";
        slider.addEventListener("input", () => {
            this._opacity = Number(slider.value) / 100;
            this.applyOpacity();
        });
        this._opacitySlider = slider;
        unlockedSection.appendChild(slider);

        const lockBtn = this.buildIconButton("/icons/img-lock.svg", "Lock image to map coordinates", () => this.lock());
        unlockedSection.appendChild(lockBtn);

        const removeBtn = this.buildButton("✕", () => this.removeOverlay());
        removeBtn.title = "Remove overlay";
        unlockedSection.appendChild(removeBtn);

        container.appendChild(unlockedSection);

        // Locked section: unlock only
        const lockedSection = document.createElement("div");
        lockedSection.className = "image-overlay-toolbar-active";
        lockedSection.hidden = true;
        this._activeLockedSection = lockedSection;

        const unlockBtn = this.buildIconButton("/icons/img-unlock.svg", "Unlock image from map coordinates", () => this.unlock());
        lockedSection.appendChild(unlockBtn);

        container.appendChild(lockedSection);

        return container;
    }

    private buildButton(label: string, onClick: () => void): HTMLButtonElement {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "image-overlay-toolbar-btn";
        btn.textContent = label;
        btn.addEventListener("click", e => {
            e.preventDefault();
            onClick();
        });
        return btn;
    }

    private buildIconButton(iconUrl: string, title: string, onClick: () => void): HTMLButtonElement {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "image-overlay-toolbar-btn image-overlay-toolbar-btn--icon";
        btn.title = title;

        const img = document.createElement("img");
        img.src = iconUrl;
        img.alt = title;
        btn.appendChild(img);

        btn.addEventListener("click", e => {
            e.preventDefault();
            onClick();
        });
        return btn;
    }

    private async handlePaste(): Promise<void> {
        getLogger().info("image_overlay.paste.start");

        if (!navigator.clipboard?.read) {
            getLogger().warning("image_overlay.paste.unsupported");
            return;
        }

        try {
            const items = await navigator.clipboard.read();
            for (const item of items) {
                const imageType = item.types.find(t => t.startsWith("image/"));
                if (imageType) {
                    const blob = await item.getType(imageType);
                    const url = URL.createObjectURL(blob);
                    this.loadImage(url, "paste");
                    getLogger().info("image_overlay.paste.end");
                    return;
                }
            }
            getLogger().warning("image_overlay.paste.no_image");
        } catch (err) {
            getLogger().error("image_overlay.paste.error", err);
        }
    }

    private registerGestureHandlers(): void {
        const mapContainer = this._map.getContainer();

        // Wheel → scale image when over it, otherwise let Leaflet zoom the map
        const wheelHandler = (e: WheelEvent) => this.onContainerWheel(e);
        mapContainer.addEventListener("wheel", wheelHandler, { passive: false, capture: true });
        this._wheelCleanup = () => mapContainer.removeEventListener("wheel", wheelHandler, { capture: true });

        // Mouse drag → move image when started inside it (map does not pan)
        const mouseDownHandler = (e: MouseEvent) => this.onContainerMouseDown(e);
        mapContainer.addEventListener("mousedown", mouseDownHandler, { capture: true });
        this._mouseDownCleanup = () => mapContainer.removeEventListener("mousedown", mouseDownHandler, { capture: true });

        const mouseMoveHandler = (e: MouseEvent) => this.onDocumentMouseMove(e);
        document.addEventListener("mousemove", mouseMoveHandler);
        this._mouseMoveCleanup = () => document.removeEventListener("mousemove", mouseMoveHandler);

        const mouseUpHandler = () => this.onDocumentMouseUp();
        document.addEventListener("mouseup", mouseUpHandler);
        this._mouseUpCleanup = () => document.removeEventListener("mouseup", mouseUpHandler);

        // Touch → pinch scales image; single finger inside image translates image
        const touchStartHandler = (e: TouchEvent) => this.onContainerTouchStart(e);
        mapContainer.addEventListener("touchstart", touchStartHandler, { passive: false, capture: true });
        this._touchStartCleanup = () => mapContainer.removeEventListener("touchstart", touchStartHandler, { capture: true });

        const touchMoveHandler = (e: TouchEvent) => this.onContainerTouchMove(e);
        mapContainer.addEventListener("touchmove", touchMoveHandler, { passive: false, capture: true });
        this._touchMoveCleanup = () => mapContainer.removeEventListener("touchmove", touchMoveHandler, { capture: true });

        const touchEndHandler = (e: TouchEvent) => this.onContainerTouchEnd(e);
        mapContainer.addEventListener("touchend", touchEndHandler, { capture: true });
        this._touchEndCleanup = () => mapContainer.removeEventListener("touchend", touchEndHandler, { capture: true });
    }

    private loadImage(url: string, source: string): void {
        getLogger().info("image_overlay.load.start", { source });

        // Revoke old blob URL when replacing with a different image
        if (this._currentBlobUrl && this._currentBlobUrl !== url) {
            URL.revokeObjectURL(this._currentBlobUrl);
            this._currentBlobUrl = undefined;
        }

        this.clearOverlay();
        this._currentUrl = url;
        this._currentSource = source;
        if (source === "paste") {
            this._currentBlobUrl = url;
        }

        const mapContainer = this._map.getContainer();

        const div = document.createElement("div");
        div.className = "image-overlay-container";

        const img = document.createElement("img");
        img.className = "image-overlay-img";
        img.alt = "Map overlay";
        img.style.opacity = String(this._opacity);

        img.addEventListener("load", () => {
            if (this._overlayDiv !== div) {
                return;
            }
            getLogger().info("image_overlay.load.end", { source });
            this._img = img;

            const restore = this._pendingRestore;
            this._pendingRestore = undefined;

            if (restore) {
                this._opacity = restore.opacity;
                this._offsetX = restore.offsetX;
                this._offsetY = restore.offsetY;
                this._scale   = restore.scale;
                img.style.opacity = String(this._opacity);

                if (restore.isLocked && restore.anchorLatLng) {
                    this._anchorLatLng  = restore.anchorLatLng;
                    this._anchorZoom    = restore.anchorZoom;
                    this._scaleAtAnchor = restore.scaleAtAnchor;
                    this._isLocked      = true;
                    this._lockMoveCleanup = this._map.onMove(() => this.updateLockedTransform());
                    this.updateLockedTransform();
                }
            } else {
                this._scale   = 1.0;
                this._offsetX = 0;
                this._offsetY = 0;
            }

            this.applyTransform();
            this.showActiveControls(true);
            this._options.onImageLoaded?.();
        });

        img.addEventListener("error", () => {
            getLogger().error("image_overlay.load.error", undefined, { source });
            if (this._overlayDiv === div) {
                this.clearOverlay();
            }
        });

        div.appendChild(img);
        mapContainer.appendChild(div);
        this._overlayDiv = div;

        img.src = url;
    }

    private clearOverlay(): void {
        this._overlayDiv?.remove();
        this._overlayDiv = undefined;
        this._img = undefined;
        this._currentUrl = "";
        this._currentSource = "";
    }

    private removeOverlay(): void {
        getLogger().info("image_overlay.remove");

        // Clean up lock subscription silently — no UI update needed since we hide everything below
        if (this._isLocked) {
            this._isLocked = false;
            this._anchorLatLng = undefined;
            this._lockMoveCleanup?.();
            this._lockMoveCleanup = undefined;
        }

        if (this._currentBlobUrl) {
            URL.revokeObjectURL(this._currentBlobUrl);
            this._currentBlobUrl = undefined;
        }

        this.clearOverlay();
        _snapshot = null;
        this.showActiveControls(false);
        this._options.onImageRemoved?.();
    }

    private saveSnapshot(): void {
        if (!this._img || !this._currentUrl) {
            _snapshot = null;
            return;
        }
        _snapshot = {
            url:           this._currentUrl,
            source:        this._currentSource,
            offsetX:       this._offsetX,
            offsetY:       this._offsetY,
            scale:         this._scale,
            opacity:       this._opacity,
            isLocked:      this._isLocked,
            anchorLatLng:  this._anchorLatLng ? [this._anchorLatLng[0], this._anchorLatLng[1]] : undefined,
            anchorZoom:    this._anchorZoom,
            scaleAtAnchor: this._scaleAtAnchor,
        };
        getLogger().info("image_overlay.snapshot.save", { source: this._currentSource });
    }

    private restoreFromSnapshot(snapshot: OverlaySnapshot): void {
        getLogger().info("image_overlay.snapshot.restore", { source: snapshot.source });
        this._pendingRestore = snapshot;
        this.loadImage(snapshot.url, snapshot.source);
    }

    private lock(): void {
        if (!this._img) {
            return;
        }

        getLogger().info("image_overlay.lock");

        const container = this._map.getContainer();
        const imageCenterX = container.offsetWidth  / 2 + this._offsetX;
        const imageCenterY = container.offsetHeight / 2 + this._offsetY;

        this._anchorLatLng  = this._map.containerPointToLatLng([imageCenterX, imageCenterY]);
        this._anchorZoom    = this._map.getZoom();
        this._scaleAtAnchor = this._scale;
        this._isLocked      = true;

        this._lockMoveCleanup = this._map.onMove(() => this.updateLockedTransform());

        this.showActiveControls(true);
    }

    private unlock(): void {
        if (!this._isLocked) {
            return;
        }

        getLogger().info("image_overlay.unlock");

        this._isLocked = false;
        this._anchorLatLng = undefined;

        this._lockMoveCleanup?.();
        this._lockMoveCleanup = undefined;

        this.showActiveControls(true);
    }

    private updateLockedTransform(): void {
        const anchor = this._anchorLatLng;
        if (!anchor) {
            return;
        }

        const container = this._map.getContainer();
        const screenPos = this._map.latLngToContainerPoint(anchor);

        this._offsetX = screenPos[0] - container.offsetWidth  / 2;
        this._offsetY = screenPos[1] - container.offsetHeight / 2;
        this._scale   = this._scaleAtAnchor * Math.pow(2, this._map.getZoom() - this._anchorZoom);

        this.applyTransform();
    }

    private showActiveControls(visible: boolean): void {
        if (!visible) {
            if (this._activeUnlockedSection) { this._activeUnlockedSection.hidden = true; }
            if (this._activeLockedSection)   { this._activeLockedSection.hidden   = true; }
            return;
        }

        if (this._isLocked) {
            if (this._activeUnlockedSection) { this._activeUnlockedSection.hidden = true; }
            if (this._activeLockedSection)   { this._activeLockedSection.hidden   = false; }
        } else {
            if (this._activeUnlockedSection) {
                this._activeUnlockedSection.hidden = false;
                if (this._opacitySlider) {
                    this._opacitySlider.value = String(Math.round(this._opacity * 100));
                }
            }
            if (this._activeLockedSection) { this._activeLockedSection.hidden = true; }
        }
    }

    private applyOpacity(): void {
        if (this._img) {
            this._img.style.opacity = String(this._opacity);
        }
    }

    private applyTransform(): void {
        if (this._img) {
            this._img.style.transform =
                `translate(${this._offsetX}px, ${this._offsetY}px) scale(${this._scale})`;
        }
    }

    // ── Wheel (scale) ──────────────────────────────────────────────────────────

    private onContainerWheel(e: WheelEvent): void {
        if (!this._img || this._isLocked || !this.isOverImage(e.clientX, e.clientY)) {
            return;
        }

        e.preventDefault();
        e.stopImmediatePropagation();

        const factor = e.deltaY < 0 ? 1.1 : (1 / 1.1);
        this._scale = Math.max(0.1, Math.min(10, this._scale * factor));
        this.applyTransform();
    }

    // ── Mouse drag (move image only; map does not pan) ────────────────────────

    private onContainerMouseDown(e: MouseEvent): void {
        if (!this._img || this._isLocked || !this.isOverImage(e.clientX, e.clientY)) {
            return;
        }

        e.stopImmediatePropagation();

        this._isDraggingMouse = true;
        this._mouseDragStartX = e.clientX;
        this._mouseDragStartY = e.clientY;
        this._offsetXAtMouseDragStart = this._offsetX;
        this._offsetYAtMouseDragStart = this._offsetY;
    }

    private onDocumentMouseMove(e: MouseEvent): void {
        if (!this._isDraggingMouse || !this._img) {
            return;
        }

        this._offsetX = this._offsetXAtMouseDragStart + (e.clientX - this._mouseDragStartX);
        this._offsetY = this._offsetYAtMouseDragStart + (e.clientY - this._mouseDragStartY);
        this.applyTransform();
    }

    private onDocumentMouseUp(): void {
        this._isDraggingMouse = false;
    }

    // ── Touch (pinch = scale; single finger inside image = move image) ─────────

    private onContainerTouchStart(e: TouchEvent): void {
        if (!this._img) {
            return;
        }

        if (!this._isLocked && e.touches.length === 2 && this.bothTouchesOverImage(e)) {
            e.preventDefault();
            e.stopImmediatePropagation();

            this._isDraggingTouch = false;
            this._initialPinchDistance = this.touchDistance(e);
            this._initialScaleAtPinch = this._scale;
            return;
        }

        if (!this._isLocked && e.touches.length === 1) {
            const touch = e.touches[0];
            if (this.isOverImage(touch.clientX, touch.clientY)) {
                e.preventDefault();
                e.stopImmediatePropagation();

                this._isDraggingTouch = true;
                this._touchDragId = touch.identifier;
                this._touchDragStartX = touch.clientX;
                this._touchDragStartY = touch.clientY;
                this._offsetXAtTouchDragStart = this._offsetX;
                this._offsetYAtTouchDragStart = this._offsetY;
            }
        }
    }

    private onContainerTouchMove(e: TouchEvent): void {
        if (!this._img) {
            return;
        }

        if (e.touches.length === 2 && this._initialPinchDistance !== 0 && this.bothTouchesOverImage(e)) {
            e.preventDefault();
            e.stopImmediatePropagation();

            const newDistance = this.touchDistance(e);
            const raw = this._initialScaleAtPinch * (newDistance / this._initialPinchDistance);
            this._scale = Math.max(0.1, Math.min(10, raw));
            this.applyTransform();
            return;
        }

        if (e.touches.length === 1 && this._isDraggingTouch) {
            let touch: Touch | undefined;
            for (let i = 0; i < e.touches.length; i++) {
                if (e.touches[i].identifier === this._touchDragId) {
                    touch = e.touches[i];
                    break;
                }
            }

            if (touch) {
                e.preventDefault();
                e.stopImmediatePropagation();

                this._offsetX = this._offsetXAtTouchDragStart + (touch.clientX - this._touchDragStartX);
                this._offsetY = this._offsetYAtTouchDragStart + (touch.clientY - this._touchDragStartY);
                this.applyTransform();
            }
        }
    }

    private onContainerTouchEnd(e: TouchEvent): void {
        if (e.touches.length < 2) {
            this._initialPinchDistance = 0;
        }
        if (e.touches.length === 0) {
            this._isDraggingTouch = false;
        }
    }

    // ── Geometry helpers ───────────────────────────────────────────────────────

    private isOverImage(clientX: number, clientY: number): boolean {
        const img = this._img;
        if (!img) {
            return false;
        }
        const rect = img.getBoundingClientRect();
        return clientX >= rect.left && clientX <= rect.right
            && clientY >= rect.top  && clientY <= rect.bottom;
    }

    private bothTouchesOverImage(e: TouchEvent): boolean {
        return this.isOverImage(e.touches[0].clientX, e.touches[0].clientY)
            && this.isOverImage(e.touches[1].clientX, e.touches[1].clientY);
    }

    private touchDistance(e: TouchEvent): number {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }
}
