import { LeafletLayerFactory, MapLayerHandle } from "../../src/contracts"

class FakeMapLayerHandle implements MapLayerHandle {
    public addedTo?: unknown;
    public removed = false;

    addTo(map: unknown): void {
        this.addedTo = map;
    }

    remove(): void {
        this.removed = true;
    }
}

class FakeLeafletLayerFactory implements LeafletLayerFactory {
    public markers: FakeMapLayerHandle[] = [];

    createLayerGroup(): MapLayerHandle {
        return new FakeMapLayerHandle();
    }

    createCircleMarker(): MapLayerHandle {
        const marker = new FakeMapLayerHandle();
        this.markers.push(marker);
        
        return marker;
    }
}