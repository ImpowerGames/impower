import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let phone = false;
const mediaListeners = new Set<() => void>();

beforeAll(() => {
  window.matchMedia = (query: string) =>
    ({
      get matches() {
        return query.includes("min-width") && !phone;
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
const { default: PreviewTopBar, MORE_PREVIEW_SETTINGS } = await import(
  "../../src/modules/spark-editor/components/preview-top-bar/PreviewTopBar"
);

const initial = structuredClone(workspace.current);
let host: HTMLDivElement | undefined;

const setPhone = async (value: boolean) => {
  phone = value;
  await act(async () => mediaListeners.forEach((listener) => listener()));
};

const settle = (ms = 0) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

const mount = async () => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(PreviewTopBar, {}), host!));
  return host;
};

const openSettings = async () => {
  const bar = await mount();
  const trigger = bar.querySelector<HTMLButtonElement>('[aria-label="Preview settings"]')!;
  trigger.focus();
  await act(async () => {
    trigger.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
    );
  });
  await settle(50);
  const menu = document.querySelector<HTMLElement>('[role="menu"]');
  expect(menu, "the open Preview settings menu").not.toBeNull();
  return { trigger, menu: menu! };
};

const running = () => {
  const next = structuredClone(workspace.current);
  next.preview.modes.game = { ...next.preview.modes.game, running: true };
  workspace.current = next;
};

beforeEach(() => {
  localStorage.clear();
  workspace.current = structuredClone(initial);
  workspaceSettings.setPreference("previewMode", "game");
});

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
  document.body.innerHTML = "";
  await setPhone(false);
});

describe("the preview top bar against the prototype", () => {
  it("gives the cog menu the toolbar menu's radius and shadow", async () => {
    const { menu } = await openSettings();
    expect(menu.classList).toContain("rounded-toolbar-menu");
    expect(menu.classList).toContain("shadow-toolbar-menu");
    expect(menu.classList).not.toContain("rounded-card");
    expect(menu.classList).not.toContain("shadow-float");
  });

  it("places the cog menu 4px below its trigger, not at the shared 6px default", async () => {
    const TRIGGER = { top: 80, bottom: 124, left: 1386, right: 1430 };
    const MENU = { width: 340, height: 300 };
    const box = (r: { top: number; bottom: number; left: number; right: number }) =>
      ({ ...r, x: r.left, y: r.top, width: r.right - r.left, height: r.bottom - r.top, toJSON: () => r }) as DOMRect;
    const floating = (element: Element) =>
      element.hasAttribute("data-radix-popper-content-wrapper") || element.getAttribute("role") === "menu";
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 900 });
    Object.defineProperty(document.documentElement, "clientWidth", { configurable: true, value: 1440 });
    Object.defineProperty(document.documentElement, "clientHeight", { configurable: true, value: 900 });
    const spies = [
      vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
        if (this.getAttribute("aria-label") === "Preview settings") return box(TRIGGER);
        if (floating(this)) return box({ top: 0, left: 0, bottom: MENU.height, right: MENU.width });
        return box({ top: 0, left: 0, bottom: 0, right: 0 });
      }),
      vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) {
        return floating(this) ? MENU.width : 0;
      }),
      vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (this: HTMLElement) {
        return floating(this) ? MENU.height : 0;
      }),
    ];
    try {
      const { menu } = await openSettings();
      await settle(50);
      const wrapper = menu.closest<HTMLElement>("[data-radix-popper-content-wrapper]")!;
      const match = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(wrapper.style.transform);
      expect(match, wrapper.style.transform).not.toBeNull();
      expect(menu.dataset.side).toBe("bottom");
      expect(Number(match![2])).toBe(TRIGGER.bottom + 4);
    } finally {
      spies.forEach((spy) => spy.mockRestore());
      for (const target of [window, document.documentElement]) {
        for (const name of ["innerWidth", "innerHeight", "clientWidth", "clientHeight"]) {
          delete (target as unknown as Record<string, unknown>)[name];
        }
      }
    }
  });

  it("sets the cog menu's hints at 11px, bold only on a checked row", async () => {
    const { menu } = await openSettings();
    const hints = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitemcheckbox"] small'));
    expect(hints.length).toBeGreaterThan(0);
    for (const hint of hints) {
      expect(hint.classList).toContain("text-[11px]/[1.5]");
      expect(hint.classList).toContain("group-aria-checked:font-semibold");
      expect(hint.classList).not.toContain("text-xs/[1.5]");
    }
  });

  it("leaves the cog untinted and muted while its menu is open", async () => {
    const { trigger } = await openSettings();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.className).not.toMatch(/aria-expanded:bg-tint|aria-expanded:text-accent/);
    expect(trigger.classList).toContain("text-muted");
  });

  it("ends the cog menu in a More preview settings row, ruled off, that opens Settings, Preview", async () => {
    const { menu } = await openSettings();
    const items = Array.from(menu.querySelectorAll<HTMLElement>('[role^="menuitem"]'));
    const last = items[items.length - 1]!;
    expect(last.getAttribute("role")).toBe("menuitem");
    expect(last.textContent).toBe(MORE_PREVIEW_SETTINGS);
    expect(last.classList).toContain("border-t");
    expect(last.classList).toContain("mt-1");
    await act(async () => last.click());
    await settle(50);
    expect(window.location.hash).toBe("#project?section=preview-preferences");
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });

  it("raises the Play circle by the theme's raised shadow", async () => {
    const bar = await mount();
    const play = bar.querySelector<HTMLElement>('[aria-label="Play From Here"]')!;
    expect(play.classList).toContain("shadow-raised");
  });

  it("balances the Step menu with a spacer on the far side so Stop sits at the centre", async () => {
    running();
    const bar = await mount();
    const transport = bar.querySelector<HTMLElement>('[aria-label="Stop"]')!.parentElement!;
    const balance = transport.querySelector<HTMLElement>("[data-step-balance]");
    expect(balance).not.toBeNull();
    expect(balance!.classList).toContain("w-11");
    expect(balance!.classList).toContain("@min-[740px]:hidden");
    const children = Array.from(transport.children);
    expect(children.indexOf(balance!)).toBe(children.length - 2);
  });

  it("keeps the mode chevron on a narrow pane and the same columns on both sides while running", async () => {
    await setPhone(true);
    running();
    const bar = await mount();
    const mode = bar.querySelector<HTMLElement>('[aria-label="Viewing mode"]')!;
    const chevron = mode.querySelectorAll("svg")[1]!;
    expect(chevron.getAttribute("class")).not.toContain("@max-[480px]:hidden");
    expect(mode.classList).toContain("@max-[480px]:w-11");
    expect(mode.classList).toContain("@max-[480px]:pl-0.5");
    const group = bar.querySelector<HTMLElement>('[aria-label="Playback controls"]')!;
    expect(group.className).not.toContain("grid-cols-[auto_1fr_auto]");
    expect(group.className).not.toContain("@max-[480px]:px-1");
    const balance = group.querySelector<HTMLElement>("[data-step-balance]");
    expect(balance).not.toBeNull();
    expect(balance!.classList).not.toContain("@min-[740px]:hidden");
  });
});
