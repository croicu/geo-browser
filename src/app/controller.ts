import { getLogger } from "../services";
import { GeoCatalog } from "../catalog/catalog";

import { SummaryViewState } from "../state/summaryViewState";
import { SummaryView } from "../view/summary/summaryView";
import { BubbleView } from "../view/summary/bubbleView";

export interface ControllerOptions {
    catalog: GeoCatalog;
    summaryViewState?: SummaryViewState;
}

export class Controller {
    private readonly _catalog: GeoCatalog;
    private readonly _summaryViewState: SummaryViewState;
    private _summaryView?: SummaryView;
    private _bubbleViews: BubbleView[] = [];

    constructor(options: ControllerOptions) {
        this._catalog = options.catalog;
        this._summaryViewState =
            options.summaryViewState ?? SummaryViewState.load();
    }

    async start(): Promise<void> {
        const logger = getLogger();

        logger.info("geo-browser starting", {
            center: this._summaryViewState.center,
            zoom: this._summaryViewState.zoom,
        });

        const app = document.querySelector<HTMLDivElement>("#app");
        if (!app) {
            throw new Error("Missing #app element.");
        }

        await this._catalog.load();

        logger.info("catalog loaded", {
            areaCount: this._catalog.areas.length,
        });

        this._summaryView = new SummaryView(app, this._summaryViewState);
        this._summaryView.render(this._catalog);

        this._bubbleViews = [];

        for (const area of this._catalog.areas) {
            const bubbleView = new BubbleView(
                this._summaryView.bubblesRoot,
                area.summary
            );

            this._bubbleViews.push(bubbleView);

            bubbleView.render({
                x: 400,
                y: 300,
                radius: area.summary.minRadiusPx,
                imageUrl: area.summary.images[0]?.url ?? "",
            });
        }
    }

    get catalog(): GeoCatalog | undefined {
        return this._catalog;
    }
}
 