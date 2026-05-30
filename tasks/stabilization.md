# Stabilization

## Status: Brainstorm

## Problem statement

On-device testing of the user layer and related features (image overlay, POI, zoom-out exit, geolocation dot) before starting new work. Goal is to collect and fix bugs found in the field, and tune constants that can only be validated on a real device (e.g. `PRESSURE_L_DELTA`, long-press timing, circle radius).

## Known open items

- `PRESSURE_L_DELTA = 10` — lightness shift per pressure unit; may need adjustment based on actual touch hardware range.
- Leaflet renderer guard (`geo_location.position_marker.renderer_not_ready`) — monitor whether the warning fires in practice and how often.
- Long-press threshold (600 ms) — validate feel on mobile; too short triggers accidentally, too long feels sluggish.
