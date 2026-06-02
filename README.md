# geo-browser

A lightweight, static, browser-based geographic renderer.

`geo-browser` loads catalog-driven geographic data and renders it on an interactive map. It runs entirely from static hosting — no backend required.

---

## Screenshots

![Summary view](docs/summary.png)
*Summary view — world overview with area bubbles*

![Heatmap view](docs/heatmap.png)
*Heatmap view — data density across the area*

![Detail view](docs/detail.png)
*Detail view — area map with layers*

![POI popup](docs/poi.png)
*POI popup — enriched place details*

---

## Philosophy

- **Static first** — runs entirely from static hosting (e.g., Cloudflare Pages)
- **Protocol-driven** — all data comes from JSON contracts
- **No frameworks** — TypeScript + Vite + Leaflet only

---

## How It Works

The app has two modes:

- **Summary** — world overview; one bubble per area
- **Detail** — immersive area view with layers, POIs, and controls

Data loads in stages:

```
Catalog → Area manifest → Layers (GeoJSON) → Map
```

Startup fetches `/catalog.head.json` (cache-busted) to find the catalog URL, then each area fetches its own manifest, and each layer fetches its own GeoJSON on demand.

---

## Layer Types

| Type | Description |
|------|-------------|
| `heatmap` | Density heatmap from weighted GeoJSON points |
| `points` | Circle markers from GeoJSON points |
| `__poi__` | Virtual layer — tappable POI markers derived from features with `hasDetails: true` |

POI popups show baked metadata: name, cuisine, address, opening hours, star rating, outdoor seating, Wikipedia/Wikidata links, and a Wikidata thumbnail image.

---

## Getting Started

```bash
npm install
npm run dev      # dev server at http://localhost:5173
npm run build    # production build → dist/
npm test         # unit tests (Vitest)
```

Deploy `dist/` to any static host.

---

## License

MIT
