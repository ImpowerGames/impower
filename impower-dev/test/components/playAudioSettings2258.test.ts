import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const REDUCED_MOTION = "prefers-reduced-motion";
let reducedMotion = false;
const reducedMotionListeners = new Set<(e: MediaQueryListEvent) => void>();

window.matchMedia = (query: string) =>
  ({
    get matches() {
      return query.includes(REDUCED_MOTION)
        ? reducedMotion
        : query.includes("min-width");
    },
    media: query,
    onchange: null,
    addEventListener: (_type: string, listener: (e: MediaQueryListEvent) => void) => {
      if (query.includes(REDUCED_MOTION)) {
        reducedMotionListeners.add(listener);
      }
    },
    removeEventListener: (_type: string, listener: (e: MediaQueryListEvent) => void) =>
      reducedMotionListeners.delete(listener),
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList;
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const { default: workspaceSettings } = await import(
  "../../src/modules/spark-editor/workspace/settings/WorkspaceSettings"
);
const { PREFERENCES_SCHEMA } = await import(
  "../../src/modules/spark-editor/workspace/settings/settingsSchema"
);
const { default: PreviewTopBar } = await import(
  "../../src/modules/spark-editor/components/preview-top-bar/PreviewTopBar"
);
const { default: PreviewSection } = await import(
  "../../src/modules/spark-editor/components/settings/PreviewSection"
);
const { SETTINGS_SCOPES } = await import(
  "../../src/modules/spark-editor/components/settings/sections"
);
const { createPlayerPreferenceSync } = await import(
  "../../src/modules/spark-editor/components/preview-game/playerPreferences"
);

type PreferenceKey = keyof typeof PREFERENCES_SCHEMA;

const ALL_KEYS = Object.keys(PREFERENCES_SCHEMA) as PreferenceKey[];

let host: HTMLDivElement | undefined;

const settle = (ms = 0) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

const setReducedMotion = (matches: boolean) =>
  act(async () => {
    reducedMotion = matches;
    reducedMotionListeners.forEach((listener) =>
      listener({ matches } as MediaQueryListEvent),
    );
  });

const openSettingsMenu = async () => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(PreviewTopBar, {}), host!));
  const trigger = host.querySelector<HTMLButtonElement>(
    '[aria-label="Preview settings"]',
  )!;
  trigger.focus();
  await act(async () => {
    trigger.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
    );
  });
  await settle(50);
  const menu = document.querySelector<HTMLElement>('[role="menu"]');
  expect(menu, "the open Preview settings menu").not.toBeNull();
  return menu!;
};

const menuItems = (menu: HTMLElement) =>
  Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"]')).map(
    (item) => ({
      name: item.querySelector("strong")?.textContent ?? "",
      checked: item.getAttribute("aria-checked") === "true",
      disabled: item.hasAttribute("data-disabled"),
      element: item,
    }),
  );

const menuItem = (menu: HTMLElement, name: string) =>
  menuItems(menu).find((item) => item.name === name)!;

const mountPreviewSection = async () => {
  const section = SETTINGS_SCOPES.flatMap((scope) => [...scope.sections]).find(
    (candidate) => candidate.id === "preview-preferences",
  )!;
  host = document.body.appendChild(document.createElement("div"));
  await act(async () =>
    render(h("div", { class: "@container/page" }, h(PreviewSection, { section })), host!),
  );
};

const switchOf = (key: string) =>
  host!.querySelector<HTMLInputElement>(`#preview-${key}-control`)!;

const switchState = (key: string) => ({
  checked: switchOf(key).checked,
  disabled: switchOf(key).disabled,
});

beforeEach(async () => {
  localStorage.clear();
  workspaceSettings.resetPreferences(ALL_KEYS);
  workspaceSettings.setPreference("previewMode", "game");
  await setReducedMotion(false);
});

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
  document.body.innerHTML = "";
  workspaceSettings.resetPreferences(ALL_KEYS);
  await setReducedMotion(false);
});

const DETAIL = "Beats played in the preview play their sound, as Play From Here would.";

describe("the Play audio preference (#2258)", () => {
  it("is off by default, a per-user preference", () => {
    expect(PREFERENCES_SCHEMA.previewPlayAudio.default).toBe(false);
    expect(workspaceSettings.preferences.value.previewPlayAudio).toBe(false);
  });

  it.each(["game", "textstream"] as const)(
    "sits in the %s cog menu directly under Auto-play beats, off and enabled, independent of it",
    async (mode) => {
      workspaceSettings.setPreference("previewMode", mode);
      const menu = await openSettingsMenu();
      const names = menuItems(menu).map((item) => item.name);
      expect(names.indexOf("Play audio")).toBe(names.indexOf("Auto-play beats") + 1);
      const item = menuItem(menu, "Play audio");
      expect(item).toMatchObject({ checked: false, disabled: false });
      expect(item.element.textContent).toContain(DETAIL);
      await act(async () => menuItem(menu, "Play audio").element.click());
      await settle(50);
      expect(workspaceSettings.preferences.value.previewPlayAudio).toBe(true);
      expect(workspaceSettings.preferences.value.previewAutoPlayBeats).toBe(false);
      expect(menuItem(menu, "Play audio")).toMatchObject({ checked: true, disabled: false });
      expect(menuItem(menu, "Auto-play beats")).toMatchObject({ checked: false, disabled: false });
      expect(menuItems(menu).map((entry) => entry.name)).toEqual(names);
    },
  );

  it("stays enabled under reduced motion and while Auto-play beats is on", async () => {
    workspaceSettings.setPreference("previewAutoPlayBeats", true);
    const menu = await openSettingsMenu();
    expect(menuItem(menu, "Play audio")).toMatchObject({ checked: false, disabled: false });
    await setReducedMotion(true);
    await settle(20);
    expect(menuItem(menu, "Play audio")).toMatchObject({ checked: false, disabled: false });
  });

  it("is the same row in the Settings page's Preview section, directly under Auto-play beats", async () => {
    await mountPreviewSection();
    const rows = Array.from(host!.querySelectorAll<HTMLInputElement>('input[id^="preview-preview"]')).map(
      (input) => input.id,
    );
    expect(rows.indexOf("preview-previewPlayAudio-control")).toBe(
      rows.indexOf("preview-previewAutoPlayBeats-control") + 1,
    );
    expect(host!.textContent).toContain("Play audio");
    expect(host!.textContent).toContain(DETAIL);
    expect(switchState("previewPlayAudio")).toEqual({ checked: false, disabled: false });
    await act(async () => switchOf("previewPlayAudio").click());
    expect(workspaceSettings.preferences.value.previewPlayAudio).toBe(true);
    expect(workspaceSettings.preferences.value.previewAutoPlayBeats).toBe(false);
    expect(switchState("previewPlayAudio")).toEqual({ checked: true, disabled: false });
  });

  it("reaches the player when the session starts and whenever it changes, whatever the other preview switches say", async () => {
    const posted: { method?: string; params?: { enabled?: boolean } }[] = [];
    const sync = createPlayerPreferenceSync((message) => posted.push(message as never));
    const heard = () =>
      posted
        .filter((message) => message.method === "preview/setPlayAudio")
        .map((message) => message.params?.enabled);
    sync.initialized();
    workspaceSettings.setPreference("previewPlayAudio", true);
    workspaceSettings.setPreference("previewFollowsCursor", false);
    workspaceSettings.setPreference("previewAutoPlayBeats", true);
    await setReducedMotion(true);
    workspaceSettings.setPreference("previewPlayAudio", false);
    sync.dispose();
    expect(heard()).toEqual([false, true, false]);
  });
});
