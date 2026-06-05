# User Bookmarks Addendum.md

Correction spec for Claude Code. Based on day-trip scenario review. PM sign-off: complete.

**Status: Done**

-----

## Context

This document corrects and extends the implementation based on walking through a full Naples day-trip scenario. Read alongside `starred_user_points.md` and `bookmarks.md`.

-----

## Canonical Scenario

**Evening before the trip**

1. User finds POI A, B, C on the map
1. Taps each → callout opens → taps bookmark icon → user point created as bookmarked, no stars
1. Callout dismisses

**Next day, arrives at point A**

1. Taps the bookmarked point → callout opens showing bookmark (active) + interactive star row
1. Taps a star → rating saved, bookmark auto-removed, callout dismisses

**Decides to skip point B**

1. Long presses the bookmarked point → user point deleted immediately, no confirmation

**Arrives at point C**

1. Same flow as point A

**Unplanned discovery**

1. Short taps empty map or any POI → callout opens → taps a star → user point created with rating

**End of day**

1. Map shows visited points with star encoding
1. User can share points as GeoJSON (already implemented)

-----

## Gaps to Fix

### Gap 1 — Cannot bookmark a POI

**Current behaviour:** POI callout shows stars but no bookmark icon.

**Required behaviour:** POI callout must include the bookmark icon in the action row, consistent with the New Location callout. Tapping bookmark on a POI creates a user point at that location marked as bookmarked.

-----

### Gap 2 — Cannot rate a bookmarked point

**Current behaviour:** Tapping a bookmarked user point shows the bookmark (active) but no star row. No way to rate from this state.

**Required behaviour:** When a user point exists with no stars, the callout must show the bookmark state + interactive star row. Tapping a star saves the rating and auto-removes the bookmark.

-----

### Gap 3 — Cannot rate an unstarred visited point

**Current behaviour:** Once a user point exists without stars, there is no way to add stars later.

**Required behaviour:** Any user point with no stars shows an interactive star row. Stars become read-only only after a rating has been set.

-----

### Gap 4 — Delete on long press

**Current behaviour:** Unknown / not implemented.

**Required behaviour:** Long pressing an existing user point deletes it immediately. No confirmation dialog. Applies to bookmarked, starred, or unrated points.

-----

## Callout Behaviour Reference

|Tapped location|Point state         |Callout shows                                                   |Tap star                                  |Tap bookmark                                       |Tap outside             |
|---------------|--------------------|----------------------------------------------------------------|------------------------------------------|---------------------------------------------------|------------------------|
|Empty map      |No point            |GPS + Google Maps link + stars (interactive) + bookmark         |Save with rating, dismiss                 |Save as bookmarked, dismiss                        |Dismiss, nothing created|
|POI            |No point            |POI details + stars (interactive) + bookmark                    |Save with rating, dismiss                 |Save as bookmarked, dismiss                        |Dismiss, nothing created|
|Empty map      |Bookmarked, no stars|GPS + Google Maps link + stars (interactive) + bookmark (active)|Save rating, auto-remove bookmark, dismiss|Toggle bookmark off (point stays, unrated), dismiss|Dismiss                 |
|POI            |Bookmarked, no stars|POI details + stars (interactive) + bookmark (active)           |Save rating, auto-remove bookmark, dismiss|Toggle bookmark off (point stays, unrated), dismiss|Dismiss                 |
|Empty map      |Starred, no bookmark|GPS + Google Maps link + stars (read-only)                      |—                                         |—                                                  |Dismiss                 |
|POI            |Starred, no bookmark|POI details + stars (read-only)                                 |—                                         |—                                                  |Dismiss                 |

-----

## Long Press Behaviour Reference

|Long pressed location|Point state        |Result                             |
|---------------------|-------------------|-----------------------------------|
|Empty map            |No point           |Place marker + open star callout   |
|POI                  |No point           |Place marker + open star callout   |
|Any location         |Existing user point|Delete immediately, no confirmation|

-----

## Marker Visual Encoding (already implemented, do not change)

|State                          |Marker                                 |
|-------------------------------|---------------------------------------|
|No border, grey fill           |Visited, no rating (meh)               |
|Black border                   |1 star — avoid                         |
|Dark olive → gold yellow border|2→5 stars, atan curve                  |
|Blue border                    |Bookmarked, not yet visited            |
|Blue dot + arrow               |GPS location (system marker, unrelated)|