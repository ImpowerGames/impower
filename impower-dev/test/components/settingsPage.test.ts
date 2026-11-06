import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ routes: [] as string[] }));

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {
    sync: { google: { getCurrentAccount: async () => null } },
    window: {
      navigateTo: (route: string) => {
        navigation.routes.push(route);
      },
    },
  },
}));

type Observed = { callback: IntersectionObserverCallback; targets: Element[]; options?: IntersectionObserverInit };
const observers: Observed[] = [];

beforeAll(() => {
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = class {
    readonly entry: Observed;
    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
      this.entry = { callback, targets: [], options };
      observers.push(this.entry);
    }
    observe(target: Element) {
      this.entry.targets.push(target);
    }
    unobserve() {}
    disconnect() {
      this.entry.targets = [];
    }
    takeRecords() {
      return [];
    }
  };
  HTMLElement.prototype.scrollTo = vi.fn() as unknown as HTMLElement["scrollTo"];
});

const { LiveRegion, SettingsList, SettingsSection, SwitchRow } = await import("@impower/impower-ui/components");
const { SettingsIndex, SettingsPage, SETTINGS_SECTION_IDS, useSectionReset } = await import(
  "../../src/modules/spark-editor/components/settings"
);
const { PREFERENCES_SCHEMA } = await import("../../src/modules/spark-editor/workspace/settings/settingsSchema");
const { default: workspaceSettings, PREFERENCES_STORAGE_KEY } = await import(
  "../../src/modules/spark-editor/workspace/settings/WorkspaceSettings"
);

let host: HTMLDivElement | undefined;

const mount = async (...nodes: ReturnType<typeof h>[]) => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h("div", null, ...nodes), host!));
  return host;
};

const marked = () =>
  [...host!.querySelectorAll('nav [aria-current="true"]')].map((el) => el.getAttribute("data-index-jump"));

const intersect = async (entries: [string, boolean][]) => {
  const observer = observers.at(-1)!;
  await act(async () => {
    observer.callback(
      entries.map(([id, isIntersecting]) => ({ target: document.getElementById(id)!, isIntersecting }) as IntersectionObserverEntry),
      {} as IntersectionObserver,
    );
  });
};

const pause = (ms: number) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

beforeEach(() => {
  localStorage.clear();
  observers.length = 0;
  navigation.routes.length = 0;
  window.history.replaceState(null, "", "#project");
});

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
  workspaceSettings.resetPreferences(["lineNumbers"]);
});

describe("the Settings page", () => {
  it("lands on the section a deep link names, focusing its heading and marking it in the index", async () => {
    window.history.replaceState(null, "", "#project?section=save-settings");
    await mount(h(SettingsPage, null), h(SettingsIndex, null));
    expect(document.activeElement?.id).toBe("save-settings-title");
    expect(document.getElementById("settings-page")!.scrollTo).toHaveBeenCalled();
    expect(marked()).toEqual(["save-settings"]);
  });

  it("jumps again when the hash names another section", async () => {
    await mount(h(SettingsPage, null), h(SettingsIndex, null));
    await act(async () => {
      window.history.replaceState(null, "", "#project?section=file-types");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(document.activeElement?.id).toBe("file-types-title");
    expect(marked()).toEqual(["file-types"]);
  });

  it("marks the last section crossing the reading band as the page scrolls", async () => {
    await mount(h(SettingsPage, null), h(SettingsIndex, null));
    const observer = observers.at(-1)!;
    expect(observer.options?.rootMargin).toBe("0px 0px -66% 0px");
    expect(observer.targets.map((target) => target.id)).toEqual([...SETTINGS_SECTION_IDS]);
    expect(marked()).toEqual(["theme-preferences"]);
    await intersect([
      ["theme-preferences", true],
      ["editor-preferences", true],
    ]);
    expect(marked()).toEqual(["editor-preferences"]);
    await intersect([
      ["theme-preferences", false],
      ["editor-preferences", false],
      ["screenplay-settings", true],
    ]);
    expect(marked()).toEqual(["screenplay-settings"]);
    const scope = host!.querySelector('[data-index-jump="settings-project"]')!.parentElement!;
    expect(scope.hasAttribute("data-contains-current")).toBe(true);
  });

  it("keeps a jump's row marked while the page travels, then follows the reading band again", async () => {
    await mount(h(SettingsPage, null), h(SettingsIndex, null));
    const rows = host!.querySelectorAll<HTMLButtonElement>('nav [data-index-jump="file-types"]');
    await act(async () => rows[rows.length - 1]!.click());
    expect(document.activeElement?.id).toBe("file-types-title");
    expect(marked()).toEqual(["file-types"]);
    await intersect([["story-details", true]]);
    expect(marked()).toEqual(["file-types"]);
    await pause(450);
    await intersect([["add-folder-preferences", true]]);
    expect(marked()).toEqual(["add-folder-preferences"]);
  });

  it("follows the section being read as soon as the writer scrolls during a jump, with no further observer change", async () => {
    await mount(h(SettingsPage, null), h(SettingsIndex, null));
    const rows = host!.querySelectorAll<HTMLButtonElement>('nav [data-index-jump="file-types"]');
    await act(async () => rows[rows.length - 1]!.click());
    await intersect([["add-folder-preferences", true]]);
    expect(marked()).toEqual(["file-types"]);
    await act(async () => {
      document.getElementById("settings-page")!.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
    });
    expect(marked()).toEqual(["add-folder-preferences"]);
  });

  it("keeps a finished jump's row marked until the next scroll, which reads the band again", async () => {
    await mount(h(SettingsPage, null), h(SettingsIndex, null));
    const rows = host!.querySelectorAll<HTMLButtonElement>('nav [data-index-jump="file-types"]');
    await act(async () => rows[rows.length - 1]!.click());
    const page = document.getElementById("settings-page")!;
    Object.defineProperty(page, "scrollHeight", { configurable: true, value: 4000 });
    Object.defineProperty(page, "clientHeight", { configurable: true, value: 800 });
    await intersect([["story-details", true]]);
    await pause(450);
    expect(marked()).toEqual(["file-types"]);
    await act(async () => {
      page.dispatchEvent(new Event("scroll"));
    });
    expect(marked()).toEqual(["story-details"]);
  });

  it("jumps from the chips line the same way", async () => {
    await mount(h(SettingsPage, null));
    const chip = host!.querySelector<HTMLButtonElement>('#settings-page nav [data-index-jump="screenplay-settings"]')!;
    await act(async () => chip.click());
    expect(document.activeElement?.id).toBe("screenplay-settings-title");
  });

  it("draws the frame: intro, both scopes in order and every section not yet built as a placeholder", async () => {
    await mount(h(SettingsPage, null));
    expect(host!.querySelector("h1")!.textContent).toBe("Settings");
    expect([...host!.querySelectorAll("#settings-page h2")].map((el) => el.textContent)).toEqual([
      "Editor preferences",
      "Project preferences",
    ]);
    expect([...host!.querySelectorAll("[data-settings-section]")].map((el) => el.id)).toEqual([...SETTINGS_SECTION_IDS]);
    const placeholders = [...host!.querySelectorAll("[data-settings-placeholder]")].map((el) => el.closest("[data-settings-section]")!.id);
    expect(placeholders).toEqual(SETTINGS_SECTION_IDS.filter((id) => id !== "shortcut-preferences"));
    expect(document.getElementById("save-settings")!.textContent).toContain("Import Project");
    const back = [...host!.querySelectorAll("button")].find((button) => button.textContent?.includes("Back to story"))!;
    await act(async () => back.click());
    await pause(0);
    expect(navigation.routes).toEqual(["write"]);
  });
});

describe("a section composed over the settings store", () => {
  function ScriptEditor() {
    const preferences = workspaceSettings.preferences.value;
    const reset = useSectionReset({ preferences: ["lineNumbers"] });
    return h(
      SettingsSection,
      { id: "editor", title: "Script editor", ...reset },
      h(
        SettingsList,
        null,
        h(SwitchRow, {
          id: "line-numbers",
          name: "Line numbers",
          setting: "lineNumbers",
          checked: preferences.lineNumbers,
          onCheckedChange: (next: boolean) => workspaceSettings.setPreference("lineNumbers", next),
        }),
      ),
    );
  }

  it("shows Reset to defaults only while a row differs, restores through the store and announces each change", async () => {
    await mount(h(LiveRegion, null), h(ScriptEditor, null));
    const reset = () => host!.querySelector<HTMLButtonElement>("[data-reset-all]");
    const control = () => host!.querySelector<HTMLInputElement>('input[role="switch"]')!;
    const region = () => host!.querySelector('[role="status"]')!.textContent;
    const usual = PREFERENCES_SCHEMA.lineNumbers.default;
    const said = (on: boolean) => `Line numbers ${on ? "on" : "off"}.`;
    expect(reset()).toBeNull();
    await act(async () => control().click());
    await pause(10);
    expect(workspaceSettings.preferences.value.lineNumbers).toBe(!usual);
    expect(region()).toBe(said(!usual));
    expect(reset()).not.toBeNull();
    await act(async () => reset()!.click());
    expect(workspaceSettings.preferences.value.lineNumbers).toBe(usual);
    expect(JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY) ?? "{}")).not.toHaveProperty("lineNumbers");
    expect(control().checked).toBe(usual);
    expect(reset()).toBeNull();
    await act(async () => control().click());
    await pause(10);
    await act(async () => control().click());
    await pause(10);
    expect(region()!.trim()).toBe(said(usual));
  });
});
