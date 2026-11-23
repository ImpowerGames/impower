import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const screen = { width: 1440, coarse: false };
const mediaListeners = new Set<() => void>();

const appWindow = vi.hoisted(() => ({
  setAppMenuOpen: (_open: boolean) => {},
}));
vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: { window: appWindow },
}));

beforeAll(() => {
  window.matchMedia = (query: string) =>
    ({
      get matches() {
        if (query === "(hover: none) and (pointer: coarse)") {
          return screen.coarse;
        }
        const minWidth = /\(min-width: (\d+)px\)/.exec(query);
        return minWidth ? screen.width >= Number(minWidth[1]) : false;
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: () => void) => mediaListeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => mediaListeners.delete(listener),
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

const { DropdownItem } = await import("@impower/impower-ui/components");
const { default: workspace } = await import("../../src/modules/spark-editor/workspace/WorkspaceStore");
const { LibraryPage } = await import("../../src/modules/spark-editor/components/library-page");
const { default: AppMenu } = await import("../../src/modules/spark-editor/components/desktop-shell/AppMenu");
const { default: PreviewTopBar } = await import(
  "../../src/modules/spark-editor/components/preview-top-bar/PreviewTopBar"
);

appWindow.setAppMenuOpen = (open: boolean) => {
  workspace.current = {
    ...workspace.current,
    screen: { ...workspace.current.screen, appMenuOpen: open },
  };
};

const initial = structuredClone(workspace.current);
let host: HTMLDivElement | undefined;

const settle = (ms = 0) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

const setScreen = async (width: number, coarse: boolean) => {
  screen.width = width;
  screen.coarse = coarse;
  await act(async () => mediaListeners.forEach((listener) => listener()));
};

const MENUS = {
  "the Add menu": {
    mount: () =>
      h(LibraryPage<string>, {
        searchLabel: "Search assets",
        query: "",
        onQueryChange: () => {},
        newLabel: "Add",
        newMenu: [h(DropdownItem, { key: "upload" }, "Upload files"), h(DropdownItem, { key: "folder" }, "New folder")],
        bar: null,
        list: null,
      }),
    trigger: () =>
      Array.from(host!.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.trim() === "Add")!,
  },
  "the app menu": {
    mount: () => h(AppMenu, { trigger: "bar" }),
    trigger: () => host!.querySelector<HTMLButtonElement>('[aria-label="App menu"]')!,
  },
  "the Preview settings menu": {
    mount: () => h(PreviewTopBar, {}),
    trigger: () => host!.querySelector<HTMLButtonElement>('[aria-label="Preview settings"]')!,
  },
} as const;

type MenuName = keyof typeof MENUS;

const mount = async (name: MenuName) => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(MENUS[name].mount(), host!));
  await settle();
  const trigger = MENUS[name].trigger();
  expect(trigger, `${name}'s trigger`).toBeTruthy();
  return trigger;
};

const press = async (trigger: HTMLElement, pointerType: string) => {
  await act(async () => {
    for (const type of ["pointerdown", "pointerup"]) {
      trigger.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType, button: 0 }));
    }
    trigger.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));
  });
  await settle(300);
};

const formOpen = () => {
  const menu = document.querySelector<HTMLElement>('[role="menu"]');
  if (!menu) {
    return "closed";
  }
  return menu.closest('[role="dialog"]') ? "sheet" : "menu";
};

beforeEach(() => {
  workspace.current = structuredClone(initial);
});

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
  document.body.innerHTML = "";
  await setScreen(1440, false);
});

const names = Object.keys(MENUS) as MenuName[];

const FORMS = [
  [360, "sheet"],
  [430, "sheet"],
  [768, "menu"],
  [1440, "menu"],
] as const;

describe("the editor's menus open as a sheet in the phone layout and as a dropdown in every other layout, whatever opens them", () => {
  it.each(names.flatMap((name) => FORMS.flatMap(([width, form]) => (["touch", "pen", "mouse"] as const).map((pointerType) => [name, width, pointerType, form] as const))))(
    "%s at %ipx wide, opened by a %s, opens as a %s",
    async (name, width, pointerType, form) => {
      await setScreen(width, pointerType !== "mouse");
      const trigger = await mount(name);
      await press(trigger, pointerType);
      expect(formOpen()).toBe(form);
    },
  );

  it.each(names.flatMap((name) => FORMS.map(([width, form]) => [name, width, form] as const)))(
    "%s at %ipx wide on a touch screen, opened from the keyboard, opens as a %s",
    async (name, width, form) => {
      await setScreen(width, true);
      const trigger = await mount(name);
      trigger.focus();
      await act(async () => {
        trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      });
      await settle(300);
      expect(formOpen()).toBe(form);
    },
  );

  it.each(names.flatMap((name) => FORMS.map(([width, form]) => [name, width, form] as const)))(
    "%s at %ipx wide on a touch screen, opened by a click no pointer made, opens as a %s",
    async (name, width, form) => {
      await setScreen(width, true);
      const trigger = await mount(name);
      await act(async () => trigger.click());
      await settle(300);
      expect(formOpen()).toBe(form);
    },
  );

  it.each(names.flatMap((name) => FORMS.map(([width, form]) => [name, width, form] as const)))(
    "%s at %ipx wide gives a finger, then a mouse, then a finger the same %s",
    async (name, width, form) => {
      await setScreen(width, false);
      const trigger = await mount(name);
      const seen: string[] = [];
      for (const pointerType of ["touch", "mouse", "touch"]) {
        await press(trigger, pointerType);
        seen.push(formOpen());
        await act(async () => {
          document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
        });
        await settle(400);
        expect(formOpen()).toBe("closed");
      }
      expect(seen).toEqual([form, form, form]);
    },
  );

  it.each(names.flatMap((name) => [[430, 1440, "sheet"], [1440, 430, "menu"]].map(([from, to, form]) => [name, from, to, form] as const)))(
    "%s opened at %ipx wide keeps its form when the window becomes %ipx wide while it is open: a %s",
    async (name, from, to, form) => {
      await setScreen(from, true);
      const trigger = await mount(name);
      await press(trigger, "touch");
      expect(formOpen()).toBe(form);
      await setScreen(to, true);
      await settle(50);
      expect(formOpen()).toBe(form);
      await setScreen(from, true);
      await settle(50);
      expect(formOpen()).toBe(form);
    },
  );
});
