import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
    plugins: [
        VitePWA({
            registerType: "autoUpdate",
            manifest: {
                name: "CityLife",
                short_name: "CityLife",
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
                // Precache the built app shell plus the release catalog (needed for summary map offline).
                // catalog.head*.json is intentionally excluded — it's the freshness pointer and is
                // handled by NetworkFirst below so the SW always attempts a fresh fetch.
                globPatterns: ["**/*.{js,css,html,ico,png,svg}", "release/catalog.json"],

                runtimeCaching: [
                    {
                        // Freshness pointer: try network first, fall back to SW cache when offline.
                        urlPattern: /\/catalog\.head.*\.json$/,
                        handler: "NetworkFirst",
                        options: {
                            cacheName: "catalog-head",
                            networkTimeoutSeconds: 5,
                        },
                    },
                    {
                        // Area manifests and GeoJSON: network only until the user opts to cache an area.
                        urlPattern: /\/areas\//,
                        handler: "NetworkOnly",
                    },
                ],
            },
        }),
    ],
});
