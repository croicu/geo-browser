import { describe, it, expect } from "vitest";
import { TwoTapState } from "../../../src/view/detail/twoTapState";

describe("TwoTapState", () => {
    it("first tap on a layer expands it", () => {
        const state = new TwoTapState();
        const action = state.tap("a", true);
        expect(action).toEqual({ kind: "expand", previous: undefined });
        expect(state.expandedId).toBe("a");
    });

    it("second tap on the same layer toggles visibility and clears expanded", () => {
        const state = new TwoTapState();
        state.tap("a", true);
        const action = state.tap("a", true);
        expect(action).toEqual({ kind: "toggle", visible: false });
        expect(state.expandedId).toBeUndefined();
    });

    it("second tap flips visibility from false to true", () => {
        const state = new TwoTapState();
        state.tap("a", false);
        const action = state.tap("a", false);
        expect(action).toEqual({ kind: "toggle", visible: true });
    });

    it("tapping a different layer collapses the previous and expands the new one", () => {
        const state = new TwoTapState();
        state.tap("a", true);
        const action = state.tap("b", true);
        expect(action).toEqual({ kind: "expand", previous: "a" });
        expect(state.expandedId).toBe("b");
    });

    it("dismiss collapses the expanded layer and returns its id", () => {
        const state = new TwoTapState();
        state.tap("a", true);
        const dismissed = state.dismiss();
        expect(dismissed).toBe("a");
        expect(state.expandedId).toBeUndefined();
    });

    it("dismiss when nothing is expanded returns undefined", () => {
        const state = new TwoTapState();
        expect(state.dismiss()).toBeUndefined();
    });

    it("expandedId is undefined initially", () => {
        const state = new TwoTapState();
        expect(state.expandedId).toBeUndefined();
    });
});
