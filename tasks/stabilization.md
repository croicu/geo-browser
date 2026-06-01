# Stabilization

## Status: Ongoing

## Problem statement

On-device testing of the user layer and related features (image overlay, POI, zoom-out exit, geolocation dot) before starting new work. Goal is to collect and fix bugs found in the field, and tune constants that can only be validated on a real device (e.g. `PRESSURE_L_DELTA`, long-press timing, circle radius).

## Known open items

- `PRESSURE_L_DELTA = 10` — lightness shift per pressure unit; may need adjustment based on actual touch hardware range.
- Leaflet renderer guard (`geo_location.position_marker.renderer_not_ready`) — monitor whether the warning fires in practice and how often.
- Long-press threshold (600 ms) — validate feel on mobile; too short triggers accidentally, too long feels sluggish.

## Applied fixes

- **iOS long-press native menu / text selection** (`leafletFactories.ts` `createMap`): Added `user-select: none` + `-webkit-user-select: none` on the map container (cascades to zoom controls, preventing `+`/`−` glyph selection). Added capture-phase `contextmenu` listener on the container calling `e.preventDefault()` to block the iOS native popup when the touch lands on a Leaflet control rather than the map pane.
