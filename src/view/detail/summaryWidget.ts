import {
    type ControllerActions,
    type WidgetHandle,
    type WidgetFactory,
    type MapHandle,
} from "../../contracts";

import { fail } from "../../errors";

export class SummaryWidget implements WidgetHandle {
    private readonly _map: MapHandle;
    private readonly _actions: ControllerActions;
    private readonly _factory: WidgetFactory;

    private _widget?: WidgetHandle;

    constructor(
        map: MapHandle,
        actions: ControllerActions,
        factory: WidgetFactory
    ) {
        this._map = map;
        this._actions = actions;
        this._factory = factory;
    }

    addTo(map: MapHandle): void {
        if (!this._widget) {
            fail(
                "summary_widget.not_created",
                "SummaryWidget has not been created."
            );
        }

        this._widget.addTo(map);
    }

    remove(): void {
        if (!this._widget) {
            fail(
                "summary_widget.not_created",
                "SummaryWidget has not been created."
            );
        }

        this._widget.remove();
    }

    render(): void {
        if (!this._widget) {
            this._widget = this._factory.createSummaryWidget(
                "Summary",
                () => {
                    this._actions.openSummary();
                }
            );

            this._widget.addTo(this._map);
        }
    }

    destroy(): void {
        if (!this._widget) {
            fail(
                "summary_widget.not_created",
                "SummaryWidget has not been created."
            );
        }

        this._widget.remove();
        this._widget = undefined;
    }
}