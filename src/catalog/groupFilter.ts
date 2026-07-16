// An area matches when its group array is a superset of the filter (AND, not OR).
// null filter means "no filtering" — every area matches.
export function matchesGroupFilter(
    areaGroups: string[] | undefined,
    groupFilter: string[] | null
): boolean {
    if (groupFilter === null) {
        return true;
    }

    const groups = areaGroups ?? [];
    return groupFilter.every((required) => groups.includes(required));
}
