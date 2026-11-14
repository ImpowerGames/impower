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

describe("the Auto-play beats preference (#2257)", () => {
  it("is off by default, a per-user preference", () => {
    expect(PREFERENCES_SCHEMA.previewAutoPlayBeats.default).toBe(false);
    expect(workspaceSettings.preferences.value.previewAutoPlayBeats).toBe(false);
  });

  it.each(["game", "textstream"] as const)(
    "sits in the %s cog menu directly under Game preview follows cursor, off and enabled",
    async (mode) => {
      workspaceSettings.setPreference("previewMode", mode);
      const menu = await openSettingsMenu();
      const names = menuItems(menu).map((item) => item.name);
      expect(names.indexOf("Auto-play beats")).toBe(
        names.indexOf("Game preview follows cursor") + 1,
      );
      const item = menuItem(menu, "Auto-play beats");
      expect(item.checked).toBe(false);
      expect(item.disabled).toBe(false);
      expect(item.element.textContent).toContain(
        "When the caret lands on a line, its beat plays once, as it would in the game.",
      );
    },
  );

  it("shows Show idle animations checked and disabled while it is on, keeps the stored value, and shifts nothing in the menu", async () => {
    workspaceSettings.setPreference("previewIdleAnimations", false);
    const menu = await openSettingsMenu();
    const before = menuItems(menu).map((item) => item.name);
    expect(menuItem(menu, "Show idle animations")).toMatchObject({ checked: false, disabled: false });
    await act(async () => menuItem(menu, "Auto-play beats").element.click());
    await settle(50);
    expect(workspaceSettings.preferences.value.previewAutoPlayBeats).toBe(true);
    expect(menuItem(menu, "Auto-play beats")).toMatchObject({ checked: true, disabled: false });
    expect(menuItem(menu, "Show idle animations")).toMatchObject({ checked: true, disabled: true });
    expect(workspaceSettings.preferences.value.previewIdleAnimations).toBe(false);
    expect(menuItems(menu).map((item) => item.name)).toEqual(before);
    await act(async () => menuItem(menu, "Auto-play beats").element.click());
    await settle(50);
    expect(menuItem(menu, "Show idle animations")).toMatchObject({ checked: false, disabled: false });
    expect(menuItems(menu).map((item) => item.name)).toEqual(before);
  });

  it("is shown off and disabled in the cog menu under reduced motion, and frees Show idle animations", async () => {
    workspaceSettings.setPreference("previewAutoPlayBeats", true);
    workspaceSettings.setPreference("previewIdleAnimations", false);
    const menu = await openSettingsMenu();
    const before = menuItems(menu).map((item) => item.name);
    expect(menuItem(menu, "Show idle animations")).toMatchObject({ checked: true, disabled: true });
    await setReducedMotion(true);
    await settle(20);
    expect(menuItem(menu, "Auto-play beats")).toMatchObject({ checked: false, disabled: true });
    expect(menuItem(menu, "Show idle animations")).toMatchObject({ checked: false, disabled: false });
    expect(menuItems(menu).map((item) => item.name)).toEqual(before);
    await setReducedMotion(false);
    await settle(20);
    expect(menuItem(menu, "Auto-play beats")).toMatchObject({ checked: true, disabled: false });
  });

  it("is the same row in the Settings page's Preview section, with the same locks", async () => {
    workspaceSettings.setPreference("previewIdleAnimations", false);
    await mountPreviewSection();
    const rows = Array.from(host!.querySelectorAll<HTMLInputElement>('input[id^="preview-preview"]')).map(
      (input) => input.id,
    );
    expect(rows.indexOf("preview-previewAutoPlayBeats-control")).toBe(
      rows.indexOf("preview-previewFollowsCursor-control") + 1,
    );
    expect(host!.textContent).toContain("Auto-play beats");
    expect(switchState("previewAutoPlayBeats")).toEqual({ checked: false, disabled: false });
    await act(async () => switchOf("previewAutoPlayBeats").click());
    expect(workspaceSettings.preferences.value.previewAutoPlayBeats).toBe(true);
    expect(switchState("previewIdleAnimations")).toEqual({ checked: true, disabled: true });
    expect(workspaceSettings.preferences.value.previewIdleAnimations).toBe(false);
    await setReducedMotion(true);
    expect(switchState("previewAutoPlayBeats")).toEqual({ checked: false, disabled: true });
    expect(switchState("previewIdleAnimations")).toEqual({ checked: false, disabled: false });
    await setReducedMotion(false);
    await act(async () => switchOf("previewAutoPlayBeats").click());
    expect(switchState("previewIdleAnimations")).toEqual({ checked: false, disabled: false });
  });

  it("reaches the player only with Game preview follows cursor on and no reduced motion, and forces idle motion while on", async () => {
    workspaceSettings.setPreference("previewIdleAnimations", false);
    const posted: { method?: string; params?: { enabled?: boolean } }[] = [];
    const sync = createPlayerPreferenceSync((message) => posted.push(message as never));
    const heard = (method: string) =>
      posted.filter((message) => message.method === method).map((message) => message.params?.enabled);
    sync.initialized();
    workspaceSettings.setPreference("previewAutoPlayBeats", true);
    workspaceSettings.setPreference("previewFollowsCursor", false);
    workspaceSettings.setPreference("previewFollowsCursor", true);
    await setReducedMotion(true);
    await setReducedMotion(false);
    workspaceSettings.setPreference("previewAutoPlayBeats", false);
    sync.dispose();
    expect(heard("preview/setAutoPlayBeats")).toEqual([false, true, false, true, false, true, false]);
    expect(heard("game/setAnimatePortraits")).toEqual([false, true, false, true, false]);
  });
});
