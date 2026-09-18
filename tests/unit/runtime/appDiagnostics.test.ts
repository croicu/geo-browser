import { describe, expect, it } from "vitest";
import { renderStartupError, renderVersionBadge } from "../../../src/runtime/appDiagnostics";

describe("renderVersionBadge", () => {
    it("renders the given version string into the root element", () => {
        const root = document.createElement("div");

        renderVersionBadge(root, "v1.9-21-gfe7b978");

        expect(root.textContent).toContain("v1.9-21-gfe7b978");
        expect(root.querySelector(".app-version-badge")).not.toBeNull();
    });
});

describe("renderStartupError", () => {
    it("clears any existing content and renders the error message", () => {
        const root = document.createElement("div");
        root.innerHTML = "<span>stale content</span>";

        renderStartupError(root, "Failed to fetch");

        expect(root.textContent).toContain("Failed to fetch");
        expect(root.querySelector("span")).toBeNull();
    });

    it("includes a reload hint alongside the error message", () => {
        const root = document.createElement("div");

        renderStartupError(root, "network down");

        expect(root.textContent).toContain("reload");
    });
});
