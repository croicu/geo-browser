import { describe, expect, it, vi } from "vitest";

import { SummaryWidget } from "../../../src/view/detail/summaryWidget";

import type {
    ControllerActions,
    WidgetFactory,
    MapHandle,
    WidgetHandle,
} from "../../../src/contracts";

// --- stubs ---

class StubMap implements MapHandle {
    remove(): void {
    }
}

class StubWidgetHandle implements WidgetHandle {
    public addedTo?: MapHandle;
    public removed = false;

    addTo(map: MapHandle): void {
        this.addedTo = map;
    }

    remove(): void {
        this.removed = true;
    }
}

class StubWidgetFactory implements WidgetFactory {
    public createdLabel?: string;
    public createdOnClick?: () => void;

    private readonly _handle = new StubWidgetHandle();

    createSummaryWidget(
        label: string,
        onClick: () => void
    ): WidgetHandle {

        this.createdLabel = label;
        this.createdOnClick = onClick;

        return this._handle;
    }

    get handle(): StubWidgetHandle {
        return this._handle;
    }
}

class StubActions implements ControllerActions {
    public openedSummary = false;

    openSummary(): void {
        this.openedSummary = true;
    }

    openDetail(): void {
    }

    zoomIn(): void {
    }

    zoomOut(): void {
    }

    setZoom(): void {
    }
}

// --- tests ---

describe("SummaryWidget", () => {

    it("creates widget on render", () => {
        const map = new StubMap();
        const actions = new StubActions();
        const factory = new StubWidgetFactory();

        const widget = new SummaryWidget(
            map,
            actions,
            factory
        );

        widget.render();

        expect(factory.createdLabel).toBe("Summary");
        expect(factory.createdOnClick).toBeDefined();
    });

    it("adds widget to map", () => {
        const map = new StubMap();
        const actions = new StubActions();
        const factory = new StubWidgetFactory();

        const widget = new SummaryWidget(
            map,
            actions,
            factory
        );

        widget.render();
        widget.addTo(map);

        expect(factory.handle.addedTo).toBe(map);
    });

    it("opens summary on click", () => {
        const map = new StubMap();
        const actions = new StubActions();
        const factory = new StubWidgetFactory();

        const widget = new SummaryWidget(
            map,
            actions,
            factory
        );

        widget.render();

        if (!factory.createdOnClick) {
            throw new Error("Missing click handler.");
        }

        factory.createdOnClick();

        expect(actions.openedSummary).toBe(true);
    });

    it("removes widget on destroy", () => {
        const map = new StubMap();
        const actions = new StubActions();
        const factory = new StubWidgetFactory();

        const widget = new SummaryWidget(
            map,
            actions,
            factory
        );

        widget.render();
        widget.remove();

        expect(factory.handle.removed).toBe(true);
    });

    it("does not recreate widget on multiple renders", () => {
        const map = new StubMap();
        const actions = new StubActions();
        const factory = new StubWidgetFactory();

        const createSpy = vi.spyOn(
            factory,
            "createSummaryWidget"
        );

        const widget = new SummaryWidget(
            map,
            actions,
            factory
        );

        widget.render();
        widget.render();

        expect(createSpy).toHaveBeenCalledTimes(1);
    });
});