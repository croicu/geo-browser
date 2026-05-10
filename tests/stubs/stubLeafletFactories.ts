import { LayerFactory, LayerSelectionWidgetItem, MapFactory, MapHandle, MapLayerHandle, WidgetFactory, WidgetHandle } from "../../src/contracts"


export class StubMap implements MapHandle {
    remove(): void {
    }

    getZoom(): number {
        return 3;
    }

    onZoom(_handler: (zoom: number) => void): () => void {
        return () => {};
    }
}

export class StubMapFactory implements MapFactory {
    public created = false;

    createMap(): MapHandle {
        this.created = true;

        return new StubMap();
    }
}

export class StubMapLayerHandle implements MapLayerHandle {
    public addedTo?: MapHandle;
    public removed = false;

    addTo(map: MapHandle): void {
        this.addedTo = map;
    }

    remove(): void {
        this.removed = true;
    }
}

export class StubLayerFactory implements LayerFactory {
    public markers: StubMapLayerHandle[] = [];

    createLayerGroup(): MapLayerHandle {
        return new StubMapLayerHandle();
    }

    createCircleMarker(): MapLayerHandle {
        const marker = new StubMapLayerHandle();
        this.markers.push(marker);

        return marker;
    }
}

export class StubWidget implements WidgetHandle {
    addTo(map: MapHandle): void {
    }
    remove(): void {
    }
}

export class StubWidgetFactory implements WidgetFactory {
    createSummaryWidget(
        label: string, 
        onClick: () => void
    ): WidgetHandle {
        const widget = new StubWidget();

        return widget;
    }

    createLayerSelectionWidget(
        layers: LayerSelectionWidgetItem[], 
        onToggle: (
            layerId: string, 
            visible: boolean
        ) => void
    ): WidgetHandle {
        const widget = new StubWidget();

        void onToggle;
        return widget;
    }
}