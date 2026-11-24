import { compile } from "@tailwindcss/node";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { render, type VNode } from "preact";
import { act } from "preact/test-utils";

export type Theme = "charcoal" | "chalk";
export type Layout = "phone" | "compact" | "desktop";

export const THEMES: Theme[] = ["charcoal", "chalk"];

let mediaMatches: (query: string) => boolean = () => false;
const mediaListeners = new Set<() => void>();

export const setMedia = async (matches: (query: string) => boolean) => {
  mediaMatches = matches;
  await act(async () => mediaListeners.forEach((listener) => listener()));
};

export const atDesktop = async <T>(run: () => Promise<T>) => {
  await setMedia((query) => query.includes("701px") || query.includes("1101px"));
  try {
    return await run();
  } finally {
    await setMedia(() => false);
  }
};

export const installBrowserStubs = () => {
  window.matchMedia = ((query: string) => ({
    get matches() {
      return mediaMatches(query);
    },
    media: query,
    onchange: null,
    addEventListener: (_type: string, listener: () => void) => mediaListeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => mediaListeners.delete(listener),
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
};

const UI_PACKAGE = resolve(process.cwd(), "../packages/impower-ui");

export const markupOf = async (node: VNode) => {
  const host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(node, host));
  for (const field of host.querySelectorAll("input")) {
    field.setAttribute("value", field.value);
  }
  const markup = document.body.innerHTML;
  await act(async () => render(null, host));
  host.remove();
  document.body.innerHTML = "";
  return markup;
};

export const stylesFor = async (markup: string) => {
  const compiler = await compile('@import "./src/style.css";', { base: UI_PACKAGE, onDependency: () => {} });
  const candidates = [...markup.matchAll(/class="([^"]*)"/g)].flatMap((match) =>
    match[1]!.replace(/&amp;/g, "&").split(/\s+/),
  );
  return compiler.build(candidates);
};

export const inChromium = async <T, A = undefined>(
  node: VNode | string,
  { width, theme = "charcoal", layout = "desktop", touch = false }: { width: number; theme?: Theme; layout?: Layout; touch?: boolean },
  read: (arg: A) => T | Promise<T>,
  arg?: A,
): Promise<T> => {
  const markup = typeof node === "string" ? node : await markupOf(node);
  const css = await stylesFor(markup);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width, height: 900 }, isMobile: touch, hasTouch: touch });
    await page.setContent(
      `<!doctype html><html data-theme="${theme}" data-layout="${layout}"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body style="margin:0">${markup}</body></html>`,
    );
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    return (await page.evaluate(read, arg as A)) as T;
  } finally {
    await browser.close();
  }
};
