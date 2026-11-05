import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, expect, it } from "vitest";
import { App, galleryEntries } from "../src/App";
import { collectingTypes, componentNames, exportedValue } from "./exports";

let host: HTMLDivElement | undefined;

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
  document.body.innerHTML = "";
});

it("lists every exported component in exactly one gallery entry", () => {
  const listed = galleryEntries.flatMap((entry) => entry.exports);
  expect(componentNames.filter((name) => !listed.includes(name))).toEqual([]);
  expect(listed.filter((name, i) => listed.indexOf(name) !== i)).toEqual([]);
  expect(listed.filter((name) => exportedValue(name) === undefined)).toEqual([]);
});

it("mounts the gallery with every exported component on the page", async () => {
  host = document.body.appendChild(document.createElement("div"));
  const { types } = await collectingTypes(() =>
    act(async () => {
      render(<App />, host!);
    }),
  );
  expect(componentNames.filter((name) => !types.has(exportedValue(name)))).toEqual([]);
  expect(document.querySelectorAll('[role="menuitemcheckbox"]').length).toBeGreaterThan(0);
});
