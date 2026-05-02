# geo-browser

A lightweight, static, browser-based geographic renderer.

`geo-browser` loads declarative data (manifest + layers) and renders them on top of a map with zoom/pan capabilities. It is designed to be simple, extensible, and completely static — no backend required.

---

## Philosophy

- **Static first** — runs entirely from static hosting (e.g., Cloudflare Pages)
- **Protocol-driven** — all data comes from JSON contracts defined in `protocols.ts`
- **Open payloads** — minimal validation, extensible data
- **Capability-based** — renderer checks what it can use, not what is strictly valid
- **No frameworks** — TypeScript + Vite + Leaflet only

---

## Architecture

```
protocols.ts     → data contracts (manifest + layers)
capabilities.ts  → “can I render this?” checks
loader.ts        → fetch + parse JSON
renderer.ts      → Leaflet-based implementation
main.ts          → app bootstrap
```

---

## Data Model

### Manifest

Defines the view and available layers:

```json
{
  "version": 1,
  "defaultView": {
    "center": [40.8518, 14.2681],
    "zoom": 13
  },
  "layers": [
    {
      "id": "photo-heat",
      "type": "heatmap",
      "url": "layers/photo-heat.geojson",
      "visible": true
    }
  ]
}
```

### Layer (GeoJSON)

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": { "weight": 0.92 },
      "geometry": {
        "type": "Point",
        "coordinates": [14.2480, 40.8275]
      }
    }
  ]
}
```

---

## Getting Started

### Install

```
npm install
```

### Run (dev)

```
npm run dev
```

Open:

```
http://localhost:5173
```

### Build

```
npm run build
```

Output:

```
dist/
```

Deploy `dist/` to any static host.

---

## Testing

Unit tests use **Vitest**.

```
npm test
```

Tests focus on:

- manifest parsing
- capability checks
- layer extraction
- error handling

No network or Leaflet dependency required.

---

## Naming Convention

Part of a broader ecosystem:

```
geo-browser   → browser renderer
geo-ios       → iOS renderer (future)
geo-desktop   → desktop renderer (future)
geo-photo     → photo layer generator
geo-schema    → shared contracts (future)
```

---

## Non-Goals

- No routing/navigation
- No backend/API
- No real-time data
- No framework (React/Vue)

---

## License

MIT
