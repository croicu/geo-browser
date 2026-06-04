# Feature Spec: Empty-Space Tap → Google Maps Callout

## Status: Done

## Problem statement
- When tapping (or click) to a space on the map which is not POI open a callout with a link to Google Maps.

## Behavior

1. Tap on a POI dot → existing behavior unchanged
1. Tap on empty space → open a callout at tap coordinates, instantly, no network call
1. Callout open, tap outside → close callout
1. Tap on empty space while callout is open → close current callout, open new one at new coordinates

## Callout Content

- Coordinates displayed as lat/lng (for reference, can be small/secondary)
- A single tappable link: “Open in Google Maps” → `https://maps.google.com/?q=<lat>,<lng>`
- Same callout chrome as POI callouts for visual consistency

## What’s Explicitly Not in Scope

- No Nominatim call
- No spinner
- No async anything
- No cancel/replace logic

## Implementation Plan

- `detailView.ts`: `onMapClick` was a stub (just logged). Now it:
  1. Calls `closeEmptySpacePopup()` to remove any existing callout
  2. Builds a `poi-popup` div via `buildEmptySpacePopupElement`: lat/lng in `poi-coords` + `poi-website` anchor to `https://maps.google.com/?q=<lat>,<lng>`
  3. Opens it via `this._map.createPopup(latLng, el)` (same `L.popup` path as POI popups)
- `closeEmptySpacePopup()` is also called in `destroy()` before `_map.remove()`
- POI dot clicks call `L.DomEvent.stopPropagation`, so map click does NOT fire on POI taps — no interference
- Opening a new Leaflet popup (`openOn` → `map.openPopup`) calls `map.closePopup()` first, so my callout auto-closes when a POI popup opens
- `style.css`: added `.poi-coords` (small grey secondary text)