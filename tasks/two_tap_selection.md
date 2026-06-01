# Two tap layer selection

## Status: Brainstorm

## Problem Statement

Layer selection widgets are intentionally minimal (colored circle + ✓/×) to preserve map space. The trade-off is the user doesn't know which layer they're toggling before they act.

## Confirmed Design

- **First tap** on a collapsed widget: expand it rightward to reveal the layer name. No visibility change.
- **Second tap** on the expanded widget: toggle visibility, collapse.
- **Tap anywhere else on map**: collapse without toggling.
- **Tap on a different widget** while one is expanded: collapse the current one, expand the new one (single-active-expanded rule — tapping a second widget likely means the first was a mis-tap).
- **Desktop**: same behavior for now; suppress later once mobile feel is validated.
- **No timeout** — expand state is sticky until dismissed.

## Implementation Plan

All changes live in `LayerControl` inside `leafletFactories.ts` and the corresponding CSS in `style.css`.

### DOM structure change
Wrap each button in a `.layer-control-item` div, add a `.layer-control-label` span:
```
div.layer-control
  div.layer-control-item           ← new wrapper per layer
    button.layer-control-button    ← existing
    span.layer-control-label       ← new, hidden by default
```

### State in LayerControl
- `_expandedId: string | undefined` — which layer is currently expanded.
- `_itemEls: Map<string, { item: HTMLElement; button: HTMLElement }>` — per-layer element refs.

### Click logic
- Tap collapsed → `expand(layerId)`: add `expanded` class to item, set `_expandedId`.
- Tap expanded (same id) → toggle visibility, update button UI, `collapse()`.
- Tap different while expanded → `collapse()` then `expand(newId)`.

### Map click dismissal
In `onAdd(map)` subscribe to `map.on("click", collapse)`; unsubscribe in `onRemove()`.

### CSS
`max-width: 0 → 200px` transition on `.layer-control-label` with `expanded` class on the item wrapper. Rounded label pill style to the right of the button.