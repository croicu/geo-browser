# Tile provider

## Status: Done

## Problem Statement

- Openstreetmap maps contains the feature names in the regional language. This makes hard to inspect the map. I want to try different tile providers in order to evaluate the maps.
- Keep the code for osm tiles intact: download tiles from https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
- Create a tile abstract provider in src/maps
- Have the osm derive from the abstact tile provider
- Create a carto provider thet downloads tiles from https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png.
- Make the carto provider default.

## Implementation

- `src/maps/tileProvider.ts` — `TileProvider` interface (`urlTemplate`, `maxZoom`, `attribution`, optional `subdomains`)
- `src/maps/osmTileProvider.ts` — `osmTileProvider` constant (OSM tiles, kept intact)
- `src/maps/cartoTileProvider.ts` — `cartoTileProvider` constant (Carto Voyager, subdomains `abcd`)
- `src/view/detail/leafletFactories.ts` — `DefaultLeafletMapFactory.createMap` now reads from `cartoTileProvider`
