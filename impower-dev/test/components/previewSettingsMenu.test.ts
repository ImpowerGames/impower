import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

let phone = false;
let compact = false;
const mediaListeners = new Set<() => void>();

beforeAll(() => {
  window.matchMedia = (query: string) =>
    ({
      get matches() {
        if (!query.includes("min-width") || phone) {
          return false;
        }
        return !(compact && query.includes("1101px"));
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: () => void) =>
        mediaListeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) =>
        mediaListeners.delete(listener),
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const { default: workspace } = await import(
  "../../src/modules/spark-editor/workspace/WorkspaceStore"
);
const { default: workspaceSettings } = await import(
  "../../src/modules/spark-editor/workspace/settings/WorkspaceSettings"
);
const { default: PreviewTopBar } = await import(
  "../../src/modules/spark-editor/components/preview-top-bar/PreviewTopBar"
);

const initial = structuredClone(workspace.current);
let host: HTMLDivElement | undefined;

const setLayout = async (layout: "phone" | "compact" | "desktop") => {
  phone = layout === "phone";
  compact = layout === "compact";
  await act(async () => mediaListeners.forEach((listener) => listener()));
};

const settle = (ms = 0) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

const openSettings = async () => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(PreviewTopBar, {}), host!));
  const trigger = host.querySelector<HTMLButtonElement>(
    '[aria-label="Preview settings"]',
  )!;
  trigger.focus();
  if (phone) {
    await act(async () => trigger.click());
    await settle(300);
  } else {
    await act(async () => {
      trigger.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
      );
    });
    await settle(50);
  }
  const menu = document.querySelector<HTMLElement>('[role="menu"]');
  expect(menu, "the open Preview settings menu").not.toBeNull();
  return menu!;
};

const ratioGroup = (menu: HTMLElement) =>
  menu.querySelector<HTMLElement>('[role="group"][aria-label="Game aspect ratio"]');

const rows = (menu: HTMLElement) =>
  Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'));

beforeEach(() => {
  localStorage.clear();
  workspace.current = structuredClone(initial);
  workspaceSettings.setProjectSetting("previewAspectRatio", "auto");
  workspaceSettings.setPreference("previewMode", "game");
});

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
  document.body.innerHTML = "";
  await setLayout("desktop");
});

describe("the Preview settings menu", () => {
  it("offers the game aspect ratio on a phone, the bar's six rows, and keeps the choice for the project", async () => {
    workspaceSettings.setProjectSetting("previewAspectRatio", "16:9");
    await setLayout("phone");
    const menu = await openSettings();
    expect(ratioGroup(menu)).not.toBeNull();
    expect(
      rows(menu).map((row) => [row.textContent, row.getAttribute("aria-checked"), row.disabled]),
    ).toEqual([
      ["Autofill pane", "false", false],
      ["16:9Landscape", "true", false],
      ["4:3Landscape", "false", false],
      ["1:1Square", "false", false],
      ["3:4Portrait", "false", false],
      ["9:16Portrait", "false", false],
    ]);
    await act(async () => rows(menu)[5]!.click());
    await settle(300);
    expect(workspaceSettings.projectSettings.value.previewAspectRatio).toBe("9:16");
  });

  it("shows the group disabled and reading Auto on a phone in Interactive Fiction, where the page fills the pane", async () => {
    workspaceSettings.setProjectSetting("previewAspectRatio", "9:16");
    workspaceSettings.setPreference("previewMode", "textstream");
    await setLayout("phone");
    const menu = await openSettings();
    expect(ratioGroup(menu)).not.toBeNull();
    expect(
      rows(menu).map((row) => [row.getAttribute("aria-checked"), row.disabled]),
    ).toEqual([
      ["true", true],
      ["false", true],
      ["false", true],
      ["false", true],
      ["false", true],
      ["false", true],
    ]);
    expect(menu.textContent).toContain("The page fills the pane in Interactive Fiction");
    await act(async () => rows(menu)[1]!.click());
    await settle(300);
    expect(workspaceSettings.projectSettings.value.previewAspectRatio).toBe("9:16");
  });

  it("has no aspect ratio on a phone in Screenplay mode, where the bar links to the paper size", async () => {
    workspaceSettings.setPreference("previewMode", "screenplay");
    await setLayout("phone");
    const menu = await openSettings();
    expect(ratioGroup(menu)).toBeNull();
    expect(rows(menu)).toHaveLength(0);
  });

  it.each(["compact", "desktop"] as const)(
    "leaves the aspect ratio in the bar on the %s layout",
    async (layout) => {
      await setLayout(layout);
      const menu = await openSettings();
      expect(ratioGroup(menu)).toBeNull();
      expect(rows(menu)).toHaveLength(0);
      expect(menu.textContent).toContain("Game preview follows cursor");
    },
  );
});
