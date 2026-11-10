import { render, type ComponentChild } from "preact";
import { act } from "preact/test-utils";

let host: HTMLDivElement | undefined;

export const stubLayout = () => {
  window.matchMedia = (query: string) =>
    ({
      matches: query.includes("min-width"),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
  if (!("ResizeObserver" in globalThis)) {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
};

export const mountRows = async <Row,>(
  rows: readonly Row[],
  view: (row: Row) => ComponentChild,
) => {
  if (!host) {
    host = document.body.appendChild(document.createElement("div"));
  }
  await act(async () =>
    render(
      <div>
        {rows.map((row, index) => (
          <div key={index} data-row>
            {view(row)}
          </div>
        ))}
      </div>,
      host!,
    ),
  );
  return host;
};

export const unmountRows = async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
  document.body.innerHTML = "";
};

export const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

export const press = (target: Element, key: string) =>
  act(async () => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
  });

export const openMenu = async (trigger: Element) => {
  await press(trigger, "Enter");
  await settle();
  return document.querySelector<HTMLElement>('[role="menu"]');
};

export const rowTexts = (root: Element) =>
  Array.from(root.querySelectorAll("[data-row]")).map((row) => {
    const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
    const parts: string[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim();
      if (text) {
        parts.push(text);
      }
    }
    return parts.join(" ");
  });
