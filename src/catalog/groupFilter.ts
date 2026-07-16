const DEBUG_GROUP = "debug";

// An area matches when its group array is a superset of the filter (AND, not OR).
// null filter means "no filtering" — every area matches, EXCEPT the "debug" group is
// hidden unless explicitly requested: an area tagged "debug" only shows when "debug"
// itself is part of groupFilter (e.g. ?group=debug or the back-compat ?debug=1
// shorthand). This applies even under an unrelated explicit filter — ?group=Europe
// hides an area tagged group: ["debug", "Europe"] too, since "debug" wasn't requested.
export function matchesGroupFilter(
    areaGroups: string[] | undefined,
    groupFilter: string[] | null
): boolean {
    const groups = areaGroups ?? [];

    const isDebugArea = groups.includes(DEBUG_GROUP);
    const debugRequested = groupFilter !== null && groupFilter.includes(DEBUG_GROUP);
    if (isDebugArea && !debugRequested) {
        return false;
    }

    if (groupFilter === null) {
        return true;
    }

    return groupFilter.every((required) => groups.includes(required));
}
