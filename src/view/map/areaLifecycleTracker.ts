import { boundsIntersectBbox } from "../../geo/mercator";
import { AreaRenderClassifier } from "./areaRenderClassifier";
import { CurrentAreaSelector } from "./currentAreaSelector";

export interface AreaLifecycleInput {
    id: string;
    bbox: [number, number, number, number];
    center: [number, number];
}

export interface ViewportSnapshot {
    bounds: { sw: [number, number]; ne: [number, number] };
    zoom: number;
}

export type AreaRenderKind = "circle" | "outline" | "loaded";
export type BaseLayerResidency = "none" | "hidden" | "visible";

export type BundleAction =
    | { kind: "none" }
    | { kind: "hide"; areaId: string }
    | { kind: "hide-skipped"; areaId: string }
    | { kind: "show"; areaId: string }
    | { kind: "build"; areaId: string; previousAreaId: string | null };

export interface AreaTransitions {
    renderKinds: ReadonlyMap<string, AreaRenderKind>;
    toLoad: string[];
    toShow: string[];
    toHide: string[];
    toDestroy: string[];
    pinnedAreaId: string | null;
    bundle: BundleAction;
}

// The state machine behind tasks/layer_lifecycle.md: per-area render kind
// (circle/outline/loaded), base-layer residency (none/hidden/visible) with
// its two-phase Hide/Destroy discard, the empty-viewport fallback pin, and
// the singleton "current area" virtual-layer bundle. Pure — no Leaflet, no
// GeoArea/GeoLayer references, only plain {id, bbox, center} tuples in and
// a diff of what changed out. recompute() is the only stateful entry point.
export class AreaLifecycleTracker {
    private readonly _areas = new Map<string, AreaLifecycleInput>();
    private readonly _residency = new Map<string, BaseLayerResidency>();
    private _renderKinds = new Map<string, AreaRenderKind>();
    private _currentAreaId: string | null = null;
    private _bundleAreaId: string | null = null;
    private _bundleAttached = false;

    constructor(areas: readonly AreaLifecycleInput[] = []) {
        for (const area of areas) {
            this.addArea(area);
        }
    }

    addArea(area: AreaLifecycleInput): void {
        this._areas.set(area.id, area);
        if (!this._residency.has(area.id)) {
            this._residency.set(area.id, "none");
        }
    }

    get currentAreaId(): string | null {
        return this._currentAreaId;
    }

    getRenderKind(areaId: string): AreaRenderKind {
        return this._renderKinds.get(areaId) ?? "circle";
    }

    getResidency(areaId: string): BaseLayerResidency {
        return this._residency.get(areaId) ?? "none";
    }

    recompute(viewport: ViewportSnapshot): AreaTransitions {
        const areas = [...this._areas.values()];
        const viewportCenter: [number, number] = [
            (viewport.bounds.sw[0] + viewport.bounds.ne[0]) / 2,
            (viewport.bounds.sw[1] + viewport.bounds.ne[1]) / 2,
        ];

        const sizeBig = new Map<string, boolean>();
        const intersects = new Map<string, boolean>();
        for (const area of areas) {
            sizeBig.set(area.id, AreaRenderClassifier.classifySize(area.bbox, viewport.zoom) === "big");
            intersects.set(area.id, boundsIntersectBbox(area.bbox, viewport.bounds));
        }

        const pinnedAreaId = this.computeFallbackPin(areas, intersects, viewportCenter);

        const { toLoad, toShow, toHide } = this.applyResidencyTransitions(
            areas, sizeBig, intersects, pinnedAreaId, viewport.zoom
        );

        const toDestroy = this.sweepDestroy(areas, toLoad, pinnedAreaId);

        const renderKinds = this.computeRenderKinds(areas, sizeBig, pinnedAreaId, viewport.zoom);
        this._renderKinds = renderKinds;

        const currentAreaId = this.selectCurrentArea(areas, intersects, pinnedAreaId, viewportCenter);
        this._currentAreaId = currentAreaId;

        const bundle = this.computeBundleAction(currentAreaId, intersects);

        return { renderKinds, toLoad, toShow, toHide, toDestroy, pinnedAreaId, bundle };
    }

    private computeFallbackPin(
        areas: readonly AreaLifecycleInput[],
        intersects: ReadonlyMap<string, boolean>,
        viewportCenter: [number, number]
    ): string | null {
        if (areas.length === 0 || areas.some(a => intersects.get(a.id) === true)) {
            return null;
        }
        return CurrentAreaSelector.selectNearest(
            areas.map(a => ({ id: a.id, center: a.center })),
            viewportCenter
        );
    }

    private applyResidencyTransitions(
        areas: readonly AreaLifecycleInput[],
        sizeBig: ReadonlyMap<string, boolean>,
        intersects: ReadonlyMap<string, boolean>,
        pinnedAreaId: string | null,
        zoom: number
    ): { toLoad: string[]; toShow: string[]; toHide: string[] } {
        const toLoad: string[] = [];
        const toShow: string[] = [];
        const toHide: string[] = [];
        const aboveZoomFloor = zoom >= AreaRenderClassifier.MIN_LOADED_ZOOM;

        for (const area of areas) {
            const prev = this._residency.get(area.id) ?? "none";
            const isPinned = area.id === pinnedAreaId;
            const eligible = isPinned
                || (aboveZoomFloor && (sizeBig.get(area.id) ?? false) && (intersects.get(area.id) ?? false));

            if (eligible) {
                if (prev === "none") {
                    toLoad.push(area.id);
                    this._residency.set(area.id, "visible");
                } else if (prev === "hidden") {
                    toShow.push(area.id);
                    this._residency.set(area.id, "visible");
                }
            } else if (prev === "visible") {
                toHide.push(area.id);
                this._residency.set(area.id, "hidden");
            }
        }

        return { toLoad, toShow, toHide };
    }

    private sweepDestroy(
        areas: readonly AreaLifecycleInput[],
        toLoad: readonly string[],
        pinnedAreaId: string | null
    ): string[] {
        if (toLoad.length === 0) {
            return [];
        }

        const toDestroy: string[] = [];
        for (const area of areas) {
            if (area.id === pinnedAreaId) {
                continue;
            }
            if (this._residency.get(area.id) === "hidden") {
                toDestroy.push(area.id);
                this._residency.set(area.id, "none");
            }
        }
        return toDestroy;
    }

    private computeRenderKinds(
        areas: readonly AreaLifecycleInput[],
        sizeBig: ReadonlyMap<string, boolean>,
        pinnedAreaId: string | null,
        zoom: number
    ): Map<string, AreaRenderKind> {
        const belowZoomFloor = zoom < AreaRenderClassifier.MIN_LOADED_ZOOM;
        const renderKinds = new Map<string, AreaRenderKind>();
        for (const area of areas) {
            if (area.id === pinnedAreaId) {
                renderKinds.set(area.id, "loaded");
                continue;
            }
            // Circle vs. outline is purely a bbox-size question (below the
            // fixed-diameter circle's own on-screen area, per
            // AreaRenderClassifier.classifySize) -- independent of the zoom
            // floor below, which only ever gates loaded vs. outline.
            if (!sizeBig.get(area.id)) {
                renderKinds.set(area.id, "circle");
                continue;
            }
            if (belowZoomFloor) {
                renderKinds.set(area.id, "outline");
                continue;
            }
            renderKinds.set(area.id, this._residency.get(area.id) === "visible" ? "loaded" : "outline");
        }
        return renderKinds;
    }

    private selectCurrentArea(
        areas: readonly AreaLifecycleInput[],
        intersects: ReadonlyMap<string, boolean>,
        pinnedAreaId: string | null,
        viewportCenter: [number, number]
    ): string | null {
        const candidates = areas.filter(a =>
            a.id !== pinnedAreaId
            && this._residency.get(a.id) === "visible"
            && intersects.get(a.id) === true
        );
        return CurrentAreaSelector.selectNearest(
            candidates.map(a => ({ id: a.id, center: a.center })),
            viewportCenter
        );
    }

    private computeBundleAction(
        currentAreaId: string | null,
        intersects: ReadonlyMap<string, boolean>
    ): BundleAction {
        if (currentAreaId !== null) {
            if (this._bundleAreaId === currentAreaId && this._bundleAttached) {
                return { kind: "none" };
            }
            if (this._bundleAreaId === currentAreaId && !this._bundleAttached) {
                this._bundleAttached = true;
                return { kind: "show", areaId: currentAreaId };
            }
            const previousAreaId = this._bundleAreaId;
            this._bundleAreaId = currentAreaId;
            this._bundleAttached = true;
            return { kind: "build", areaId: currentAreaId, previousAreaId };
        }

        if (this._bundleAreaId === null || !this._bundleAttached) {
            return { kind: "none" };
        }

        const outgoing = this._bundleAreaId;
        this._bundleAttached = false;
        const stillIntersects = intersects.get(outgoing) ?? false;
        return stillIntersects
            ? { kind: "hide", areaId: outgoing }
            : { kind: "hide-skipped", areaId: outgoing };
    }
}
