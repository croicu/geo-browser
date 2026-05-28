# 1-DOF Editor

## Status: Implementation

## Problem Statement

The current geo-location (blue dot) appears in both the geo-browser map and the navigation app screenshot. Using that shared reference point the image translation (X, Y) can be fixed, leaving only scale as the remaining degree of freedom.

The user can always fall back to 3-DOF by pressing the pin button.

| DOF | 3-DOF Editor | 1-DOF Editor |
|-----|-------------|-------------|
| Translate X | free | fixed by pin anchor |
| Translate Y | free | fixed by pin anchor |
| Scale | free | free |

---

## Concepts

- **Pin** (`img-pinned.svg` / `img-unpinned.svg`): switches between 3-DOF and 1-DOF.
  Separate from Lock. Pin = anchor a specific image point to the map. Lock = freeze everything to geo.
- **Anchor**: the geo-coordinate corresponding to the long-pressed point. Shown as a red donut
  on the map container. The donut tracks the anchor lat/lng as the map pans/zooms.

---

## Workflow

1. User loads or pastes an image (3-DOF, free).
2. User rough-aligns the image using drag / wheel (3-DOF).
3. User long-presses (mobile) or double-clicks (desktop) on the overlap of the "you are here"
   dots in both the image and the map.
4. That point becomes the anchor. A red donut appears at the anchor's screen position.
   The image snaps into 1-DOF mode — translation is now driven by the anchor lat/lng,
   scale remains free.
5. User adjusts scale (wheel / pinch) until the overlay matches the base map.
6. To unpin: click the pin button in the toolbar, or long-press / double-click the red donut.
7. If satisfied, user can then lock (geo-lock scale + translation both derived from zoom).

---

## Anchor Computation

Long-press / double-click fires at `(containerX, containerY)` (relative to map container).

```
pinAnchorLatLng  = containerPointToLatLng([containerX, containerY])
pinAnchorLocalX  = (containerX - (containerW/2 + offsetX)) / scale
pinAnchorLocalY  = (containerY - (containerH/2 + offsetY)) / scale
```

`pinAnchorLocal{X,Y}` are image-intrinsic coordinates (invariant to future scale/translation).

On every `onMove` (map pans or zooms):

```
screenAnchor = latLngToContainerPoint(pinAnchorLatLng)
offsetX = screenAnchor[0] - pinAnchorLocalX * scale - containerW/2
offsetY = screenAnchor[1] - pinAnchorLocalY * scale - containerH/2
```

This keeps the anchored image point locked to its geo-location while scale stays free.

---

## Toolbar State Machine (extended)

| State | Controls shown |
|-------|---------------|
| No image | google · apple · paste |
| 3-DOF (free) | + slider · lock · delete |
| 1-DOF (pinned) | + slider · **pin(active)** · lock · delete |
| Locked (0-DOF) | + unlock |

Pin button lives in the unlocked section; hidden when unpinned, shown+active when pinned.
Lock and delete remain available in pinned state.

---

## Anchor Marker

Red donut (`border-radius: 50%`, `border: 3px solid #e53e3e`, transparent fill), absolutely
positioned inside the map container. Tracks `pinAnchorLatLng` via `latLngToContainerPoint`.

- **Double-click** donut → unpin
- **Long-press** donut → unpin (mobile)

---

## Snapshot

Add to `OverlaySnapshot`:
```ts
isPinned: boolean;
pinAnchorLatLng?: [number, number];
pinAnchorLocalX: number;
pinAnchorLocalY: number;
```

On restore, if `isPinned && pinAnchorLatLng`, re-enter 1-DOF mode (subscribe `onMove`,
recreate anchor marker, call `updatePinnedTransform`).

---

## State Machine Rules

- Pin and Lock are mutually exclusive. Pressing Lock while pinned silently clears pin first.
- Unlock always returns to free 3-DOF (not pinned).
- Re-long-pressing / double-clicking while already pinned updates the anchor to the new point.

---

## Out of Scope

- Rotation (assumes north-up)
- Auto-scale (would need a second reference point)
- Full geo-anchoring / 6-DOF
