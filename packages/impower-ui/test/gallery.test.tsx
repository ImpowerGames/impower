import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, expect, it, vi } from "vitest";
import { App, galleryEntries } from "../src/App";
import { collectingTypes, componentNames, exportedValue } from "./exports";

let host: HTMLDivElement | undefined;

afterEach(async () => {
  vi.useRealTimers();
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
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  host = document.body.appendChild(document.createElement("div"));
  const { types } = await collectingTypes(async () => {
    await act(async () => {
      render(<App />, host!);
    });
    expect(document.querySelectorAll('[role="menuitemcheckbox"]').length).toBeGreaterThan(0);
    const triggers = Array.from(host!.querySelectorAll<HTMLElement>('[aria-haspopup="dialog"]'));
    expect(triggers.length).toBeGreaterThan(0);
    for (const trigger of triggers) {
      await act(async () => trigger.click());
      const dialog = document.querySelector('[role="dialog"]');
      expect(dialog).not.toBeNull();
      const cancel = Array.from(dialog!.querySelectorAll("button")).find((b) => /^(Cancel|Close)$/.test(b.textContent || (b.getAttribute("aria-label") ?? "")));
      await act(async () => cancel!.click());
      await act(async () => {
        vi.runOnlyPendingTimers();
      });
      expect(document.querySelector('[role="dialog"]')).toBeNull();
    }
  });
  expect(componentNames.filter((name) => !types.has(exportedValue(name)))).toEqual([]);
});
