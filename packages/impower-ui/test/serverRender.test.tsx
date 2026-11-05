// @vitest-environment node
import { renderToString } from "preact-render-to-string";
import { describe, expect, it } from "vitest";
import { App, galleryEntries } from "../src/App";
import { collectingTypes, componentNames, exported, exportedValue, NOT_COMPONENTS } from "./exports";

const PORTALED = [
  "DropdownItem",
  "DropdownCheckboxItem",
  "DropdownSeparator",
  "DialogTitle",
  "DialogDescription",
  "DialogActions",
];

describe("impower-ui server render", () => {
  it("classifies every export as a component or a named non-component", () => {
    const names = exported.map(([name]) => name);
    expect(NOT_COMPONENTS.filter((name) => !names.includes(name))).toEqual([]);
    expect(componentNames.filter((name) => typeof exportedValue(name) !== "function")).toEqual([]);
  });

  it.each(galleryEntries.map((entry) => [entry.title, entry] as const))(
    "renders the %s gallery entry to a string",
    async (_title, entry) => {
      const { result: html, types } = await collectingTypes(() => renderToString(<entry.Demo />));
      expect(html).not.toBe("");
      const missing = entry.exports.filter(
        (name) => componentNames.includes(name) && !PORTALED.includes(name) && !types.has(exportedValue(name)),
      );
      expect(missing).toEqual([]);
    },
  );

  it("renders every exported component except those inside a closed menu's or dialog's portal", async () => {
    const { result: html, types } = await collectingTypes(() => renderToString(<App />));
    for (const entry of galleryEntries) {
      expect(html).toContain(`id="${entry.title}"`);
    }
    expect(componentNames.filter((name) => !types.has(exportedValue(name))).sort()).toEqual([...PORTALED].sort());
  });
});
