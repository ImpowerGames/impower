import { signal } from "@preact/signals";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyTheme,
  resolveTheme,
} from "../../src/modules/spark-editor/workspace/settings/applyTheme";

describe("theme preference on the document root", () => {
  afterEach(() => {
    delete document.documentElement.dataset["theme"];
  });

  it("resolves a known theme to itself and anything else to Midnight", () => {
    expect(resolveTheme("midnight")).toBe("midnight");
    expect(resolveTheme("automatic")).toBe("midnight");
    expect(resolveTheme("no-such-theme")).toBe("midnight");
    expect(resolveTheme("")).toBe("midnight");
  });

  it("sets data-theme from the preference and follows it until disposed", () => {
    const root = document.documentElement;
    const preferences = signal({ theme: "automatic" });

    const dispose = applyTheme(root, preferences);
    expect(root.dataset["theme"]).toBe("midnight");

    root.dataset["theme"] = "stale";
    preferences.value = { theme: "midnight" };
    expect(root.dataset["theme"]).toBe("midnight");

    dispose();
    root.dataset["theme"] = "stale";
    preferences.value = { theme: "automatic" };
    expect(root.dataset["theme"]).toBe("stale");
  });
});
