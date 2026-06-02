import { describe, expect, it, vi } from "vitest";

import { SummaryWidget } from "../../../src/view/detail/summaryWidget";

import type {
    LayerSelectionWidgetItem,
    MapHandle,
    WidgetFactory,
    WidgetHandle,
} from "../../../src/contracts";
import { StubActions } from "../../stubs/stubActions";
import { StubMap, StubWidget } from "../../stubs/stubLeafletFactories";

class FakeWidgetFactory implements WidgetFactory {
    public createdLabel?: string;
    public createdOnClick?: () => void;

    private readonly _handle = new StubWidget();

    createSummaryWidget(label: string, onClick: () => void): WidgetHandle {
        this.createdLabel = label;
        this.createdOnClick = onClick;
        return this._handle;
    }

    createMapLayerFlyout(
        _layers: LayerSelectionWidgetItem[],
        _onToggle: (layerId: string, visible: boolean) => void
    ): WidgetHandle {
        return this._handle;
    }

    get handle(): StubWidget {
        return this._handle;
    }
}

describe("SummaryWidget", () => {

    it("creates widget on render", () => {
        const map = new StubMap();
        const actions = new StubActions();
        const factory = new FakeWidgetFactory();

        const widget = new SummaryWidget(map, actions, factory);

        widget.render();

        expect(factory.createdLabel).toBe("Summary");
        expect(factory.createdOnClick).toBeDefined();
    });

    it("adds widget to map", () => {
        const map = new StubMap();
        const actions = new StubActions();
        const factory = new FakeWidgetFactory();

        const widget = new SummaryWidget(map, actions, factory);

        widget.render();
        widget.addTo(map);

        expect(factory.handle.addedTo).toBe(map);
    });

    it("opens summary on click", () => {
        const map = new StubMap();
        const actions = new StubActions();
        const factory = new FakeWidgetFactory();

        const widget = new SummaryWidget(map, actions, factory);

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
        const factory = new FakeWidgetFactory();

        const widget = new SummaryWidget(map, actions, factory);

        widget.render();
        widget.remove();

        expect(factory.handle.removed).toBe(true);
    });

    it("does not recreate widget on multiple renders", () => {
        const map = new StubMap();
        const actions = new StubActions();
        const factory = new FakeWidgetFactory();

        const createSpy = vi.spyOn(factory, "createSummaryWidget");

        const widget = new SummaryWidget(map, actions, factory);

        widget.render();
        widget.render();

        expect(createSpy).toHaveBeenCalledTimes(1);
    });
});
