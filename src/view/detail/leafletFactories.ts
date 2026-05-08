// view/detail/leafletFactories.ts
import L from "leaflet";

import type {
    CircleMarkerOptions,
    LayerFactory,
    MapFactory,
    WidgetFactory,
    MapHandle,
    MapLayerHandle,
    WidgetHandle,
} from "../../contracts";

export class DefaultLeafletLayerFactory implements LayerFactory {
    createLayerGroup(): MapLayerHandle {
        return L.layerGroup();
    }

    createCircleMarker(
        latLng: [number, number],
        options: CircleMarkerOptions
    ): MapLayerHandle {
        return L.circleMarker(latLng, options);
    }
}


export class DefaultLeafletMapFactory implements MapFactory {
    createMap(root: HTMLElement, center: [number, number], zoom: number): L.Map {
        const map = L.map(root).setView(center, zoom);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: "&copy; OpenStreetMap contributors",
        }).addTo(map);

        return map;
    }
}

class LeafletWidgetHandle implements WidgetHandle {
    private readonly _control: L.Control;

    constructor(control: L.Control) {
        this._control = control;
    }

    addTo(map: MapHandle): void {
        this._control.addTo(map as L.Map);
    }

    remove(): void {
        this._control.remove();
    }

    render(): void {
    }
}

class SummaryControl extends L.Control {
    // private readonly _label: string;
    private readonly _onClick: () => void;

    constructor(label: string, onClick: () => void) {
        super({ position: "topleft" });

    //    this._label = label;
        this._onClick = onClick;
    }

    onAdd(): HTMLElement {
        const button = document.createElement("button");

        button.className = "leaflet-summary-widget";
        button.type = "button";
        button.title = "Back to summary";

        const image = document.createElement("img");

        image.src = "/icons/back.svg";
        image.alt = "Back";

        button.appendChild(image);

        button.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();

            this._onClick();
        });

        return button;
    }
}

export class DefaultLeafletWidgetFactory
implements WidgetFactory {

    createSummaryWidget(
        label: string,
        onClick: () => void
    ): WidgetHandle {

        return new LeafletWidgetHandle(
            new SummaryControl(label, onClick));
    }
}
