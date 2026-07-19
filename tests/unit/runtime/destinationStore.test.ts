import { beforeEach, describe, expect, it } from "vitest";
import { LocalStorageDestinationStore } from "../../../src/runtime/destinationStore";
import { StubStorage } from "../../stubs/stubStorage";
import { setLogger } from "../../../src/services";
import { StubLogger } from "../../stubs/stubLogger";

describe("LocalStorageDestinationStore", () => {
    beforeEach(() => {
        setLogger(new StubLogger());
    });

    it("returns null when no destination has been set", () => {
        const store = new LocalStorageDestinationStore(new StubStorage());
        expect(store.get()).toBeNull();
    });

    it("returns the point that was set", () => {
        const store = new LocalStorageDestinationStore(new StubStorage());
        store.set({ lat: 40.85, lng: 14.27, label: "Ithaca, Royal Palace, Front Entrance" });

        expect(store.get()).toEqual({ lat: 40.85, lng: 14.27, label: "Ithaca, Royal Palace, Front Entrance" });
    });

    it("replaces an existing destination on set", () => {
        const store = new LocalStorageDestinationStore(new StubStorage());
        store.set({ lat: 40.85, lng: 14.27 });
        store.set({ lat: 41.0, lng: 15.0 });

        expect(store.get()).toEqual({ lat: 41.0, lng: 15.0 });
    });

    it("returns null after clear", () => {
        const store = new LocalStorageDestinationStore(new StubStorage());
        store.set({ lat: 40.85, lng: 14.27 });
        store.clear();

        expect(store.get()).toBeNull();
    });

    it("is global, not scoped per area — no areaId in the storage key", () => {
        const storage = new StubStorage();
        const store = new LocalStorageDestinationStore(storage);
        store.set({ lat: 40.85, lng: 14.27 });

        expect(storage.getItem("geo-browser.destination")).not.toBeNull();
    });

    it("returns null and does not throw when stored JSON is malformed", () => {
        const storage = new StubStorage();
        storage.setItem("geo-browser.destination", "{not json");
        const store = new LocalStorageDestinationStore(storage);

        expect(store.get()).toBeNull();
    });
});
