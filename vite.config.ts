import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// Embedded as __APP_VERSION__ (see src/vite-env.d.ts) and shown via a small on-screen badge
// (main.ts, runtime/appDiagnostics.ts) -- so "which build is actually running on this device"
// is answerable by looking at the screen, not by guessing. Falls back to "unknown" rather than
// failing the build if .git isn't available at build time (e.g. a stripped deployment artifact).
function getAppVersion(): string {
    try {
        return execSync("git describe --tags --always --dirty").toString().trim();
    } catch {
        return "unknown";
    }
}

export default defineConfig({
    define: {
        __APP_VERSION__: JSON.stringify(getAppVersion()),
    },
    plugins: [
        VitePWA({
            registerType: "autoUpdate",
            manifest: {
                name: "City Life",
                short_name: "City Life",
                description: "See where city life actually is — before you walk into the wrong street.",
                theme_color: "#3388ff",
                background_color: "#ffffff",
                display: "standalone",
                start_url: "/",
                icons: [
                    {
                        src: "/icons/icon-192.png",
                        sizes: "192x192",
                        type: "image/png",
                    },
                    {
                        src: "/icons/icon-512.png",
                        sizes: "512x512",
                        type: "image/png",
                    },
                    {
                        src: "/icons/icon-512.png",
                        sizes: "512x512",
                        type: "image/png",
                        purpose: "maskable",
                    },
                ],
            },
            workbox: {
                // Precache the built app shell. catalog.head*.json/catalog.json/area data are
                // intentionally excluded from precache -- they're runtime-cached below instead
                // (NetworkFirst, populated by the first successful online load), so the SW always
                // attempts a fresh fetch before falling back to whatever was last cached.
                //
                // A prior "release/catalog.json" entry here was dead: no such file was ever
                // produced by the build (silently logged as a glob-pattern-matched-nothing warning
                // on every build), so it never actually precached anything. Removed rather than
                // fixed -- the real fix for "first ever offline open with empty caches" would be a
                // build step that snapshots a known-good catalog into the bundle, which is a
                // separate, bigger piece of work than this fix covers.
                globPatterns: ["**/*.{js,css,html,ico,png,svg}"],

                runtimeCaching: [
                    {
                        // Freshness pointer: try network first, fall back to SW cache when offline. Function
                        // matcher, not RegExp -- ?assetsBase= (design mode) can point this cross-origin too
                        // (e.g. a local geo-builder server), and a RegExp urlPattern never matches cross-origin
                        // requests in Workbox regardless of whether the pattern is textually correct.
                        urlPattern: ({ url }) => /catalog\.head.*\.json$/.test(url.pathname),
                        handler: "NetworkFirst",
                        options: {
                            cacheName: "catalog-head",
                            networkTimeoutSeconds: 5,
                        },
                    },
                    {
                        // The real catalog payload -- catalog.head.json's own catalogUrl points cross-origin
                        // (geo-places.croicu.com/catalog.json in production). MUST be a function matcher, not
                        // a RegExp: Workbox's Route only invokes a plain RegExp urlPattern for same-origin
                        // requests -- it silently never matches a cross-origin URL regardless of whether the
                        // pattern would textually match, which is exactly what happened here (confirmed live:
                        // the rule compiled correctly into sw.js, the regex was textually correct, and it
                        // still never once served this URL from cache when offline). Controller.start() awaits
                        // GeoCatalog.load() with no try/catch, so an unhandled fetch rejection here means
                        // MapView is never even constructed, regardless of viewport/area or any tile caching.
                        urlPattern: ({ url }) => url.pathname.endsWith("/catalog.json"),
                        handler: "NetworkFirst",
                        options: {
                            cacheName: "catalog-data",
                            networkTimeoutSeconds: 5,
                        },
                    },
                    {
                        // Area manifests and GeoJSON layer data -- was NetworkOnly ("network only until the
                        // user opts to cache an area", a flagged-but-never-finished gap), so POI/layer content
                        // had no offline fallback regardless of tile caching. Unlike map tiles (OSM's usage
                        // policy), this is the app's own hosted data with no compliance concern, so passive
                        // caching on every successful fetch is fine -- no separate opt-in needed. Function
                        // matcher for the same cross-origin reason as catalog.json above -- this data lives on
                        // geo-places.croicu.com in production, not the app's own origin.
                        urlPattern: ({ url }) => url.pathname.includes("/areas/"),
                        handler: "NetworkFirst",
                        options: {
                            cacheName: "area-data",
                            networkTimeoutSeconds: 5,
                        },
                    },
                ],
            },
        }),
    ],
});
