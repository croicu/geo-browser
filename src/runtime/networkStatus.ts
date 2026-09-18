// Module-level Web Platform API boundary, same style as ../maps/tileProvider.ts's active-provider
// store -- deliberately not routed through Context/DI, since this is just a thin read of a
// browser global, not app state. Used by leafletFactories.ts's MapLayerFlyoutControl to force
// the OSM (cached) provider and disable the Carto (online-only) switch while offline -- see
// geo-browser#103's Provider decision.
export function isOnline(): boolean {
    return typeof navigator === "undefined" ? true : navigator.onLine;
}

export function onNetworkStatusChange(listener: (online: boolean) => void): () => void {
    const onOnline = (): void => listener(true);
    const onOffline = (): void => listener(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
        window.removeEventListener("online", onOnline);
        window.removeEventListener("offline", onOffline);
    };
}
