export interface VoidVariant {
    id: string;
    effectiveIds: readonly string[];
}

// Resolves which precomputed __void__* layer to show, given the currently-visible
// non-virtual sibling layer ids. See docs/LAYERS.md for the full contract.
export class VoidVariantResolver {
    static readonly BARE_ID = "__void__";

    // layerId is either the bare "__void__" (effective ids = every source layer in the area)
    // or "__void__<id>__" / "__void__<id>_<id>__" (effective ids = the embedded id list).
    // Returns null if layerId doesn't match the naming convention at all.
    static parseEffectiveIds(layerId: string, allSourceIds: readonly string[]): string[] | null {
        if (layerId === VoidVariantResolver.BARE_ID) {
            return [...allSourceIds].sort(VoidVariantResolver.compareNumericIds);
        }

        const match = /^__void__(\d+(?:_\d+)*)__$/.exec(layerId);
        if (!match) {
            return null;
        }

        return match[1].split("_").sort(VoidVariantResolver.compareNumericIds);
    }

    // Minimal-superset search: among the given variants, pick the one whose effective
    // id-set is the smallest superset of visibleIds. Exact match and the bare "__void__"
    // (superset of everything) are just the two extremes of this same search.
    // Zero visible siblings is a special case — resolves directly to the bare variant,
    // since an empty set is trivially a subset of every variant and the general search
    // would otherwise pick whichever single-layer variant happens to be smallest.
    static resolve(variants: readonly VoidVariant[], visibleIds: readonly string[]): string | undefined {
        if (visibleIds.length === 0) {
            return variants.find(v => v.id === VoidVariantResolver.BARE_ID)?.id;
        }

        let best: VoidVariant | undefined;

        for (const variant of variants) {
            const isSuperset = visibleIds.every(id => variant.effectiveIds.includes(id));
            if (!isSuperset) {
                continue;
            }
            if (!best || variant.effectiveIds.length < best.effectiveIds.length) {
                best = variant;
            }
        }

        return best?.id;
    }

    private static compareNumericIds(a: string, b: string): number {
        return Number(a) - Number(b);
    }
}
