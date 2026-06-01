# Two tap layer selection

## Status: Brainstorm

## Problem Statement

The layer selection widgets on the left side of the map are intentionally minimal so it provides plenty of space for the map. The trade off is there is not enough information for the end ser when it selects / deselects a layer. So the proposal is to implmement a two tap selection / deselection mechanism:
- First tap expands the selection widget to the right showing the title of the area. The other widgets should be unchanged.
- Second tap (after expansion) changes the visibility of the layer and dismisses the layer title.
- Same applyes for desktop on mouse click (we might decide to suppress this behavior on desktop because you have mouse over)