import { compile, optimize } from "@tailwindcss/node";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const { default: BottomNavigation } =
  await import("../../src/modules/spark-editor/components/desktop-shell/BottomNavigation");

let host: HTMLDivElement | undefined;

const escapeClass = (name: string) =>
  name.replace(/[^A-Za-z0-9_-]/g, (c) => `\\${c}`);

const styleWithItsOwnClasses = async (element: Element) => {
  const classes = [...element.classList];
  const compiler = await compile('@import "tailwindcss/utilities";', {
    base: process.cwd(),
    onDependency: () => {},
  });
  let css = optimize(compiler.build(classes), { minify: false }).code;
  const applied = classes.map((name, i) => {
    if (!name.includes("&")) {
      return name;
    }
    const alias = `jsdom-alias-${i}`;
    css = css.split(`.${escapeClass(name)}`).join(`.${alias}`);
    return alias;
  });
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
  element.className = applied.join(" ");
};

const mountNavigation = async (): Promise<HTMLElement> => {
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(BottomNavigation, null), host!));
  const nav = host.querySelector<HTMLElement>("[data-bottom-navigation]")!;
  expect(nav).not.toBeNull();
  await styleWithItsOwnClasses(nav);
  return nav;
};

describe("bottom navigation while the keyboard toolbar is open", () => {
  afterEach(async () => {
    document.documentElement.classList.remove("keyboard-open");
    if (host) {
      await act(async () => render(null, host!));
      host = undefined;
    }
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  it("hides while the root is keyboard-open and returns when it is removed", async () => {
    const nav = await mountNavigation();
    expect(nav.hidden).toBe(false);
    expect(getComputedStyle(nav).display).not.toBe("none");

    document.documentElement.classList.add("keyboard-open");
    expect(getComputedStyle(nav).display).toBe("none");

    document.documentElement.classList.remove("keyboard-open");
    expect(getComputedStyle(nav).display).not.toBe("none");
  });
});
