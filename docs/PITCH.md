# City Life — Elevator Pitch

## The Problem

Google Maps routes you from A to B. It optimizes for time and distance.
It does not optimize for whether you will enjoy the walk — or feel safe taking it.

Every traveler has had the experience: you follow the blue line, and end up on a
deserted, rundown street wondering how you got there. The app got you there.
There was no way to tell it you wanted a different kind of route.

You can ask Google Maps to avoid tolls. You can ask it to avoid ferries.
You cannot ask it to avoid streets where nobody walks.

## The Insight

Where people choose to spend time is visible in the data.

OpenStreetMap contains the urban fabric of every city on earth — every cafe,
church, piazza, fountain, market, and shop that makes a neighborhood worth
walking through. Dense amenity areas are lively. Sparse amenity areas are not.

No crime data needed. No subjective ratings. No sponsored pins.
Just the quiet signal of urban life, rendered as a heatmap.

## What City Life Does

City Life visualizes city liveliness as a heatmap, built entirely from
OpenStreetMap POI density.

**Two use cases**:

1. **Before you walk**: Open it at home or a café. See where life is. Plan a route
   through the bright spots. Commit to that route in Google Maps.
1. **While you’re walking**: Enable location tracking. When you’re at an intersection
   and Google Maps says “left or right,” glance at City Life. Left street is bright,
   right street is dark. You decide.

## Why It Works

- **Objective**: OSM amenity density is data, not opinion
- **Honest**: nobody paid to appear on it
- **Offline-first**: download a city before your trip, works with no connectivity
- **Street-level granularity**: zoom in from neighborhood to individual block
- **Real-time location**: optional GPS tracking for mid-walk decisions
- **Free and open**: built entirely on OpenStreetMap, the Wikipedia of maps

## The Composite Signal

Photo density alone is insufficient — some areas attract photographers
*because* they look dangerous or decayed. Amenity density alone is insufficient —
infrastructure does not guarantee activity.

The right signal is the combination:

|Photos|Amenities|Signal                              |
|------|---------|------------------------------------|
|High  |High     |Lively neighborhood — go            |
|High  |Low      |Danger tourism / urban decay — avoid|
|Low   |Low      |Dead area — avoid                   |
|Low   |High     |Quiet residential — neutral         |

## Nearest Competitor

**Hoodmaps** (hoodmaps.com) — crowdsourced neighborhood vibe maps.
Honest and funny, but subjective, coarse-grained, and online-only.

City Life delivers the same honest city intelligence more reliably,
more objectively, and fully offline.

## Status

- Working heatmap live at geo-browser.croicu.com
- Naples fully mapped and validated
- GPS location tracking live (blue dot with heading cone, accuracy ring, follow toggle)
- Auto-navigation between overview and street-level view
- PWA (installable, offline-capable) — shipped
- Trip recording (star ratings, bookmarks), place search, and paste-a-screenshot overlay with automatic GPS alignment also shipped
- Prague, Dresden, Berlin next
- Open source, MIT license: github.com/croicu/geo-browser