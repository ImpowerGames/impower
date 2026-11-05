import { history, historyKeymap } from "@codemirror/commands";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const platform = vi.hoisted(() => ({ value: "Win32" }));

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("min-width: 701px"),
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
  Object.defineProperty(navigator, "platform", {
    configurable: true,
    get: () => platform.value,
  });
});

let host: HTMLDivElement | undefined;
let editorHost: HTMLDivElement | undefined;
let view: EditorView | undefined;

afterEach(async () => {
  view?.destroy();
  view = undefined;
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
  editorHost?.remove();
  editorHost = undefined;
});

const mountHeader = async () => {
  vi.resetModules();
  const { default: HeaderNavigation } =
    await import("../../src/modules/spark-editor/components/header-navigation/HeaderNavigation");
  host = document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(HeaderNavigation, null), host!));
  return (name: string) =>
    host!.querySelector<HTMLElement>(`button[aria-label="${name}"]`)!;
};

const press = (button: HTMLElement) =>
  act(async () => {
    button.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, cancelable: true }),
    );
  });

describe("the header's Undo and Redo below the desktop width", () => {
  it("shows both buttons in the compact layout", async () => {
    platform.value = "Win32";
    const button = await mountHeader();
    expect(button("Undo")).not.toBeNull();
    expect(button("Redo")).not.toBeNull();
  });

  it("undoes and redoes a script edit on Windows, where the editor binds redo to Ctrl+Y", async () => {
    platform.value = "Win32";
    const button = await mountHeader();
    editorHost = document.body.appendChild(document.createElement("div"));
    view = new EditorView({
      parent: editorHost,
      state: EditorState.create({
        doc: "Before.",
        extensions: [history(), keymap.of(historyKeymap)],
      }),
    });
    view.dispatch({ changes: { from: 7, insert: " Probe" } });
    view.focus();
    expect(view.state.doc.toString()).toBe("Before. Probe");

    await press(button("Undo"));
    expect(view.state.doc.toString()).toBe("Before.");

    await press(button("Redo"));
    expect(view.state.doc.toString()).toBe("Before. Probe");
  });

  it("replays Cmd+Z and Cmd+Shift+Z on a Mac", async () => {
    platform.value = "MacIntel";
    const button = await mountHeader();
    const target = document.body.appendChild(document.createElement("input"));
    const seen: string[] = [];
    target.addEventListener("keydown", (e) =>
      seen.push(
        `${e.metaKey ? "Meta+" : ""}${e.ctrlKey ? "Ctrl+" : ""}${e.shiftKey ? "Shift+" : ""}${e.key}`,
      ),
    );
    target.focus();
    await press(button("Undo"));
    await press(button("Redo"));
    target.remove();
    expect(seen).toEqual(["Meta+z", "Meta+Shift+z"]);
  });
});
