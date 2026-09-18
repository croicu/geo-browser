import { getLogger } from "../services";

// Best-effort request for the browser's persistent storage mode, so recorded tile-cache data
// survives storage-pressure/inactivity eviction (see geo-browser#103's Offline Tile Caching) --
// e.g. recording a trip's cities well ahead of departure, then not reopening the app for weeks,
// is exactly the scenario WebKit's default "best-effort" (evictable) storage mode risks losing.
// Fire-and-forget: neither browser prompts the user, a denial isn't actionable from here (Chrome
// grants/denies based on site-engagement heuristics, WebKit mainly grants it to Home Screen
// installs), and the guard below means this is always safe to call even where the API doesn't
// exist (older browsers, and happy-dom's test environment).
export function requestPersistentStorage(): void {
    if (typeof navigator === "undefined" || !navigator.storage?.persist) {
        return;
    }

    const log = getLogger();
    navigator.storage.persist()
        .then((granted) => log.info("storage_persistence.request", { granted }))
        .catch((err) => log.warning("storage_persistence.request_failed", { err }));
}
