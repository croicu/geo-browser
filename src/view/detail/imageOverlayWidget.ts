import googleMapsUrl from "../../../tasks/google_maps.png?url";
import appleMapsUrl from "../../../tasks/apple_maps.png?url";
import type { MapHandle, WidgetHandle } from "../../contracts";
import { getLogger } from "../../services";
import { Context } from "../../runtime/context";
import { detectBlueDot, AUTO_PIN_THRESHOLD } from "../../vision/blueDotDetector";

export interface ImageOverlayOptions {
    areaBbox?: [number, number, number, number];
    onImageLoaded?: () => void;
    onImageRemoved?: () => void;
    getCurrentLatLng?: () => [number, number] | undefined;
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
    isPinned: boolean;
    pinAnchorLatLng?: [number, number];
    pinAnchorLocalX: number;
    pinAnchorLocalY: number;
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
    private _pinBtn?: HTMLButtonElement;
    private _currentUrl = "";
    private _currentSource = "";
    private _currentBlobUrl?: string;
    private _pendingRestore?: OverlaySnapshot;

    private _scale = 1.0;
    private _opacity = 0.5;
    private _offsetX = 0;
    private _offsetY = 0;

    // Geo-lock state (0-DOF: both translation and scale derived from map zoom)
    private _isLocked = false;
    private _anchorLatLng?: [number, number];
    private _anchorZoom = 0;
    private _scaleAtAnchor = 1.0;
    private _lockMoveCleanup?: () => void;
    private _lockZoomAnimCleanup?: () => void;

    // Pin state (1-DOF: translation follows anchor, scale free)
    private _isPinned = false;
    private _pinAnchorLatLng?: [number, number];
    private _pinAnchorLocalX = 0;
    private _pinAnchorLocalY = 0;
    private _pinMoveCleanup?: () => void;
    private _pinZoomAnimCleanup?: () => void;
    private _pinAnchorMarker?: HTMLDivElement;

    // Long-press detection for pin gesture
    private _longPressTimer?: ReturnType<typeof setTimeout>;

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
    private _dblClickCleanup?: () => void;
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

        this._lockZoomAnimCleanup?.();
        this._lockZoomAnimCleanup = undefined;

        this.clearPinState();

        this._wheelCleanup?.();
        this._wheelCleanup = undefined;

        this._mouseDownCleanup?.();
        this._mouseDownCleanup = undefined;

        this._mouseMoveCleanup?.();
        this._mouseMoveCleanup = undefined;

        this._mouseUpCleanup?.();
        this._mouseUpCleanup = undefined;

        this._dblClickCleanup?.();
        this._dblClickCleanup = undefined;

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

        if (Context.Instance.debug) {
            const gmBtn = this.buildIconButton("/icons/img-google.svg", "Google Maps", () => this.loadImage(googleMapsUrl, "google_maps"));
            container.appendChild(gmBtn);

            const amBtn = this.buildIconButton("/icons/img-apple.svg", "Apple Maps", () => this.loadImage(appleMapsUrl, "apple_maps"));
            container.appendChild(amBtn);
        }

        const pasteBtn = this.buildIconButton("/icons/img-paste.svg", "Paste image from clipboard", () => { void this.handlePaste(); });
        container.appendChild(pasteBtn);

        // Unlocked section: opacity slider + pin (hidden until pinned) + lock + delete
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

        const luckyBtn = this.buildIconButton("/icons/img-lucky.svg", "I feel lucky — auto-detect blue dot", () => this.handleLucky());
        unlockedSection.appendChild(luckyBtn);

        const pinBtn = this.buildIconButton("/icons/img-pinned.svg", "Pin image to GPS location", () => this.handlePinButtonClick());
        this._pinBtn = pinBtn;
        unlockedSection.appendChild(pinBtn);

        const lockBtn = this.buildIconButton("/icons/img-lock.svg", "Lock image to map coordinates", () => this.lock());
        unlockedSection.appendChild(lockBtn);

        const removeBtn = this.buildIconButton("/icons/img-close.svg", "Remove overlay", () => this.removeOverlay());
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

        // Double-click → pin anchor (desktop equivalent of long-press)
        const dblClickHandler = (e: MouseEvent) => this.onContainerDblClick(e);
        mapContainer.addEventListener("dblclick", dblClickHandler, { capture: true });
        this._dblClickCleanup = () => mapContainer.removeEventListener("dblclick", dblClickHandler, { capture: true });

        // Touch → pinch scales image; single finger translates; long-press pins
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
                    this._lockMoveCleanup     = this._map.onMove(() => this.updateLockedTransform());
                    this._lockZoomAnimCleanup = this._map.onZoomAnim((c, z) => this.updateLockedTransformAt(c, z));
                    this.updateLockedTransform();
                } else if (restore.isPinned && restore.pinAnchorLatLng) {
                    this._isPinned         = true;
                    this._pinAnchorLatLng  = restore.pinAnchorLatLng;
                    this._pinAnchorLocalX  = restore.pinAnchorLocalX;
                    this._pinAnchorLocalY  = restore.pinAnchorLocalY;
                    this._pinMoveCleanup     = this._map.onMove(() => this.updatePinnedTransform());
                    this._pinZoomAnimCleanup = this._map.onZoomAnim((c, z) => this.updatePinnedTransformAt(c, z));
                    this.createAnchorMarker();
                    this.updatePinnedTransform();
                }
            } else {
                this._scale   = 1.0;
                this._offsetX = 0;
                this._offsetY = 0;

                this.tryAutoPin(img);
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

        // Clear lock without UI update — showActiveControls(false) below handles it
        if (this._isLocked) {
            this._isLocked = false;
            this._anchorLatLng = undefined;
            this._lockMoveCleanup?.();
            this._lockMoveCleanup = undefined;
        }

        this.clearPinState();

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
            url:            this._currentUrl,
            source:         this._currentSource,
            offsetX:        this._offsetX,
            offsetY:        this._offsetY,
            scale:          this._scale,
            opacity:        this._opacity,
            isLocked:       this._isLocked,
            anchorLatLng:   this._anchorLatLng ? [this._anchorLatLng[0], this._anchorLatLng[1]] : undefined,
            anchorZoom:     this._anchorZoom,
            scaleAtAnchor:  this._scaleAtAnchor,
            isPinned:       this._isPinned,
            pinAnchorLatLng: this._pinAnchorLatLng ? [this._pinAnchorLatLng[0], this._pinAnchorLatLng[1]] : undefined,
            pinAnchorLocalX: this._pinAnchorLocalX,
            pinAnchorLocalY: this._pinAnchorLocalY,
        };
        getLogger().info("image_overlay.snapshot.save", { source: this._currentSource });
    }

    private restoreFromSnapshot(snapshot: OverlaySnapshot): void {
        getLogger().info("image_overlay.snapshot.restore", { source: snapshot.source });
        this._pendingRestore = snapshot;
        this.loadImage(snapshot.url, snapshot.source);
    }

    // ── Lock (0-DOF) ───────────────────────────────────────────────────────────

    private lock(): void {
        if (!this._img) {
            return;
        }

        getLogger().info("image_overlay.lock");

        // Pin and lock are mutually exclusive
        this.clearPinState();

        const container = this._map.getContainer();
        const imageCenterX = container.offsetWidth  / 2 + this._offsetX;
        const imageCenterY = container.offsetHeight / 2 + this._offsetY;

        this._anchorLatLng  = this._map.containerPointToLatLng([imageCenterX, imageCenterY]);
        this._anchorZoom    = this._map.getZoom();
        this._scaleAtAnchor = this._scale;
        this._isLocked      = true;

        this._lockMoveCleanup     = this._map.onMove(() => this.updateLockedTransform());
        this._lockZoomAnimCleanup = this._map.onZoomAnim((c, z) => this.updateLockedTransformAt(c, z));

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

        this._lockZoomAnimCleanup?.();
        this._lockZoomAnimCleanup = undefined;

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

    private updateLockedTransformAt(center: [number, number], zoom: number): void {
        const anchor = this._anchorLatLng;
        if (!anchor) return;
        const container = this._map.getContainer();
        const screenPos = this.latLngToContainerPointAt(anchor, center, zoom);
        this._offsetX = screenPos[0] - container.offsetWidth  / 2;
        this._offsetY = screenPos[1] - container.offsetHeight / 2;
        this._scale   = this._scaleAtAnchor * Math.pow(2, zoom - this._anchorZoom);
        this.applyTransform();
    }

    // ── Pin (1-DOF) ────────────────────────────────────────────────────────────

    private pin(containerX: number, containerY: number, latLng?: [number, number]): void {
        if (!this._img || this._isLocked) {
            return;
        }

        const imgRect       = this._img.getBoundingClientRect();
        const containerRect = this._map.getContainer().getBoundingClientRect();
        const imgNormX = (containerX - (imgRect.left - containerRect.left)) / imgRect.width;
        const imgNormY = (containerY - (imgRect.top  - containerRect.top )) / imgRect.height;
        getLogger().info("image_overlay.pin", {
            normX: Math.round(imgNormX * 1000) / 1000,
            normY: Math.round(imgNormY * 1000) / 1000,
        });

        const container = this._map.getContainer();

        this._pinAnchorLatLng  = latLng ?? this._map.containerPointToLatLng([containerX, containerY]);
        this._pinAnchorLocalX  = (containerX - (container.offsetWidth  / 2 + this._offsetX)) / this._scale;
        this._pinAnchorLocalY  = (containerY - (container.offsetHeight / 2 + this._offsetY)) / this._scale;

        if (!this._isPinned) {
            this._isPinned = true;
            this._pinMoveCleanup     = this._map.onMove(() => this.updatePinnedTransform());
            this._pinZoomAnimCleanup = this._map.onZoomAnim((c, z) => this.updatePinnedTransformAt(c, z));
            this.createAnchorMarker();
        } else {
            // Re-pinning to a new point — update marker position immediately
            this.updateAnchorMarkerPosition();
        }

        this.showActiveControls(true);
    }

    private unpin(): void {
        if (!this._isPinned) {
            return;
        }

        getLogger().info("image_overlay.unpin");

        this.clearPinState();
        this.showActiveControls(this._img !== undefined);
    }

    private handlePinButtonClick(): void {
        getLogger().info("image_overlay.pin_button.click", { isPinned: this._isPinned });
        if (this._isPinned) {
            this.unpin();
        } else {
            this.pinToCenter();
        }
    }

    private pinToCenter(): void {
        const img = this._img;
        if (!img) {
            getLogger().warning("image_overlay.pin_to_center.no_image");
            return;
        }
        const imgRect = img.getBoundingClientRect();
        const containerRect = this._map.getContainer().getBoundingClientRect();
        const cx = imgRect.left + imgRect.width / 2 - containerRect.left;
        const cy = imgRect.top + imgRect.height / 2 - containerRect.top;
        this.pin(cx, cy, this._options.getCurrentLatLng?.());
        this.updatePinnedTransform();
    }

    private clearPinState(): void {
        this._isPinned = false;
        this._pinAnchorLatLng = undefined;

        this._pinMoveCleanup?.();
        this._pinMoveCleanup = undefined;

        this._pinZoomAnimCleanup?.();
        this._pinZoomAnimCleanup = undefined;

        this.cancelLongPress();
        this.removeAnchorMarker();
    }

    private updatePinnedTransform(): void {
        const anchor = this._pinAnchorLatLng;
        if (!anchor) {
            return;
        }

        const container    = this._map.getContainer();
        const screenAnchor = this._map.latLngToContainerPoint(anchor);

        this._offsetX = screenAnchor[0] - this._pinAnchorLocalX * this._scale - container.offsetWidth  / 2;
        this._offsetY = screenAnchor[1] - this._pinAnchorLocalY * this._scale - container.offsetHeight / 2;

        this.applyTransform();
        this.updateAnchorMarkerPosition();
    }

    private updatePinnedTransformAt(center: [number, number], zoom: number): void {
        const anchor = this._pinAnchorLatLng;
        if (!anchor) return;
        const container    = this._map.getContainer();
        const screenAnchor = this.latLngToContainerPointAt(anchor, center, zoom);
        this._offsetX = screenAnchor[0] - this._pinAnchorLocalX * this._scale - container.offsetWidth  / 2;
        this._offsetY = screenAnchor[1] - this._pinAnchorLocalY * this._scale - container.offsetHeight / 2;
        this.applyTransform();
        this.updateAnchorMarkerPosition(center, zoom);
    }

    private latLngToContainerPointAt(latLng: [number, number], center: [number, number], zoom: number): [number, number] {
        const p  = this._map.project(latLng, zoom);
        const cp = this._map.project(center, zoom);
        const container = this._map.getContainer();
        return [
            p[0] - cp[0] + container.offsetWidth  / 2,
            p[1] - cp[1] + container.offsetHeight / 2,
        ];
    }

    private createAnchorMarker(): void {
        const marker = document.createElement("div");
        marker.className = "pin-anchor-marker";

        marker.addEventListener("dblclick", e => {
            e.stopPropagation();
            this.unpin();
        });

        let markerLongPressTimer: ReturnType<typeof setTimeout> | undefined;

        marker.addEventListener("touchstart", e => {
            e.stopPropagation();
            e.preventDefault();
            markerLongPressTimer = setTimeout(() => {
                markerLongPressTimer = undefined;
                this.unpin();
            }, 500);
        }, { passive: false });

        marker.addEventListener("touchmove", () => {
            clearTimeout(markerLongPressTimer);
            markerLongPressTimer = undefined;
        });

        marker.addEventListener("touchend", () => {
            clearTimeout(markerLongPressTimer);
            markerLongPressTimer = undefined;
        });

        this._map.getContainer().appendChild(marker);
        this._pinAnchorMarker = marker;
        this.updateAnchorMarkerPosition();
    }

    private updateAnchorMarkerPosition(animCenter?: [number, number], animZoom?: number): void {
        const anchor = this._pinAnchorLatLng;
        if (!anchor || !this._pinAnchorMarker) {
            return;
        }
        const screenPos = (animCenter !== undefined && animZoom !== undefined)
            ? this.latLngToContainerPointAt(anchor, animCenter, animZoom)
            : this._map.latLngToContainerPoint(anchor);
        this._pinAnchorMarker.style.left = `${screenPos[0]}px`;
        this._pinAnchorMarker.style.top  = `${screenPos[1]}px`;
    }

    private removeAnchorMarker(): void {
        this._pinAnchorMarker?.remove();
        this._pinAnchorMarker = undefined;
    }

    private tryAutoPin(img: HTMLImageElement): void {
        if (!this.isLocationAvailable() || img.naturalWidth === 0 || img.naturalHeight === 0) {
            return;
        }

        const hit = detectBlueDot(img);
        getLogger().info("image_overlay.blue_dot_scan", { confidence: hit?.confidence ?? 0 });

        if (!hit || hit.confidence < AUTO_PIN_THRESHOLD) {
            return;
        }

        this.pinAtDetectionResult(img, hit);
        getLogger().info("image_overlay.auto_pin", { confidence: hit.confidence });
    }

    private handleLucky(): void {
        getLogger().info("image_overlay.lucky.click");

        const img = this._img;
        if (!img) {
            getLogger().warning("image_overlay.lucky.no_image");
            return;
        }
        if (!this.isLocationAvailable()) {
            getLogger().warning("image_overlay.lucky.no_gps");
            return;
        }
        if (img.naturalWidth === 0 || img.naturalHeight === 0) {
            getLogger().warning("image_overlay.lucky.zero_dimensions");
            return;
        }

        getLogger().info("image_overlay.lucky.start");
        const hit = detectBlueDot(img);

        if (!hit) {
            getLogger().warning("image_overlay.lucky.no_candidate");
            return;
        }

        this.pinAtDetectionResult(img, hit);
        getLogger().info("image_overlay.lucky.end", { confidence: hit.confidence });
    }

    private pinAtDetectionResult(img: HTMLImageElement, hit: { x: number; y: number }): void {
        const imgRect       = img.getBoundingClientRect();
        const containerRect = this._map.getContainer().getBoundingClientRect();
        const cx = imgRect.left + hit.x * imgRect.width  - containerRect.left;
        const cy = imgRect.top  + hit.y * imgRect.height - containerRect.top;
        const currentLatLng = this._options.getCurrentLatLng?.();
        this.pin(cx, cy, currentLatLng);
        this.updatePinnedTransform();
    }

    // ── Shared state display ───────────────────────────────────────────────────

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
            if (this._pinBtn) {
                const imgEl = this._pinBtn.querySelector("img");
                const pinTitle = this._isPinned ? "Unpin image from anchor" : "Pin image to GPS location";
                if (imgEl) {
                    imgEl.src = this._isPinned ? "/icons/img-unpinned.svg" : "/icons/img-pinned.svg";
                    imgEl.alt = pinTitle;
                }
                this._pinBtn.title = pinTitle;
            }
            if (this._activeLockedSection) { this._activeLockedSection.hidden = true; }
        }
    }

    private isLocationAvailable(): boolean {
        const latLng = this._options.getCurrentLatLng?.();
        if (!latLng) return false;
        const bbox = this._options.areaBbox;
        if (!bbox) return true;
        const [west, south, east, north] = bbox;
        return latLng[0] >= south && latLng[0] <= north && latLng[1] >= west && latLng[1] <= east;
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

    // ── Long-press helpers ─────────────────────────────────────────────────────

    private startLongPressTimer(clientX: number, clientY: number): void {
        this.cancelLongPress();
        this._longPressTimer = setTimeout(() => {
            this._longPressTimer = undefined;
            this._isDraggingTouch = false;
            const rect = this._map.getContainer().getBoundingClientRect();
            this.pin(clientX - rect.left, clientY - rect.top);
        }, 500);
    }

    private cancelLongPress(): void {
        if (this._longPressTimer !== undefined) {
            clearTimeout(this._longPressTimer);
            this._longPressTimer = undefined;
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

        if (this._isPinned) {
            this.updatePinnedTransform();
        } else {
            this.applyTransform();
        }
    }

    // ── Mouse drag (move image only; map does not pan) ────────────────────────

    private onContainerMouseDown(e: MouseEvent): void {
        if (!this._img || this._isLocked || this._isPinned || !this.isOverImage(e.clientX, e.clientY)) {
            return;
        }

        e.stopImmediatePropagation();

        this._isDraggingMouse = true;
        this._mouseDragStartX = e.clientX;
        this._mouseDragStartY = e.clientY;
        this._offsetXAtMouseDragStart = this._offsetX;
        this._offsetYAtMouseDragStart = this._offsetY;
    }

    // Double-click on image → pin anchor (desktop equivalent of long-press)
    private onContainerDblClick(e: MouseEvent): void {
        if (!this._img || this._isLocked) {
            return;
        }
        // Let the anchor marker's own dblclick handler run instead
        if (this._pinAnchorMarker && this._pinAnchorMarker.contains(e.target as Node)) {
            return;
        }
        if (!this.isOverImage(e.clientX, e.clientY)) {
            return;
        }

        e.preventDefault();
        e.stopImmediatePropagation();

        const rect = this._map.getContainer().getBoundingClientRect();
        this.pin(e.clientX - rect.left, e.clientY - rect.top);
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

    // ── Touch (pinch = scale; single finger = move or long-press to pin) ───────

    private onContainerTouchStart(e: TouchEvent): void {
        if (!this._img) {
            return;
        }

        // Let anchor marker handle its own touch events (capture won't fire after stopPropagation on target)
        if (this._pinAnchorMarker && this._pinAnchorMarker.contains(e.target as Node)) {
            return;
        }

        if (!this._isLocked && e.touches.length === 2 && this.bothTouchesOverImage(e)) {
            e.preventDefault();
            e.stopImmediatePropagation();
            this.cancelLongPress();
            this._isDraggingTouch = false;
            this._initialPinchDistance = this.touchDistance(e);
            this._initialScaleAtPinch = this._scale;
            return;
        }

        if (e.touches.length === 1) {
            const touch = e.touches[0];
            if (this.isOverImage(touch.clientX, touch.clientY)) {
                e.preventDefault();
                e.stopImmediatePropagation();

                // Track position for both drag and long-press detection
                this._touchDragId = touch.identifier;
                this._touchDragStartX = touch.clientX;
                this._touchDragStartY = touch.clientY;
                this._offsetXAtTouchDragStart = this._offsetX;
                this._offsetYAtTouchDragStart = this._offsetY;

                // Start long-press timer; drag activates only if finger moves first
                this.startLongPressTimer(touch.clientX, touch.clientY);
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

            if (this._isPinned) {
                this.updatePinnedTransform();
            } else {
                this.applyTransform();
            }
            return;
        }

        if (e.touches.length === 1) {
            // Check if the finger moved enough to cancel long-press and start drag
            if (this._longPressTimer !== undefined) {
                let movedTouch: Touch | undefined;
                for (let i = 0; i < e.touches.length; i++) {
                    if (e.touches[i].identifier === this._touchDragId) {
                        movedTouch = e.touches[i];
                        break;
                    }
                }
                if (movedTouch) {
                    const dx = Math.abs(movedTouch.clientX - this._touchDragStartX);
                    const dy = Math.abs(movedTouch.clientY - this._touchDragStartY);
                    if (dx > 8 || dy > 8) {
                        this.cancelLongPress();
                        if (!this._isPinned && !this._isLocked) {
                            this._isDraggingTouch = true;
                        }
                    }
                }
            }

            if (this._isDraggingTouch) {
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
    }

    private onContainerTouchEnd(e: TouchEvent): void {
        this.cancelLongPress();
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
