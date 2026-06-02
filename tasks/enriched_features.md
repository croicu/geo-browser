# Enriched POI features

## Status: Done

## Problem statement

- Additional information added to the POI details callout, the additional features extracted from the overpass data are described in [MANIFEST.md](../docs/MANIFEST.md) and [MESSAGING.md](../docs/MESSAGING.md)
- Enhanced POI circles should be similar with the current POI circles, plus an border color:enhancedColor (default dark blue) highlighting the POI circle circumference. The enhancedColor is specifed in the "style" attribute of the POI layer.

## Implementation

- `protocols.ts`: added `enhancedColor?: string` to `LayerStyle`
- `docs/MESSAGING.md`: documented `style.enhancedColor`
- `poiLayerView.ts`: added `wikipedia`, `wikidata`, `stars`, `outdoorSeating` to `PoiBakedFeature`; enhanced markers (any enriched field present) get `enhancedColor` border at weight 2; popup shows star icons, "Outdoor seating" text, Wikipedia and Wikidata links
- `style.css`: added `.poi-stars`, `.poi-star-icon`, `.poi-outdoor-seating`, `.poi-wikipedia`, `.poi-wikidata`
