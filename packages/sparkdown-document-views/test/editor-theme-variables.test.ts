import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import EDITOR_THEME from "../src/modules/script-editor/constants/EDITOR_THEME";
import { statusPanel } from "../src/modules/script-editor/utils/extensions/statusPanel";

let view: EditorView | undefined;

const mount = () => {
  const parent = document.body.appendChild(document.createElement("div"));
  view = new EditorView({
    state: EditorState.create({
      doc: "scene start\n  -> TEASER\nend\n",
      extensions: [
        statusPanel(),
        EditorView.theme(EDITOR_THEME, { dark: true }),
      ],
    }),
    parent,
  });
  return view;
};

const inherited = (el: Element, name: string) => {
  for (let node: Element | null = el; node; node = node.parentElement) {
    const value = getComputedStyle(node).getPropertyValue(name).trim();
    if (value) return value;
  }
  return "";
};

const computedColor = (el: Element, prop: string) =>
  getComputedStyle(el)
    .getPropertyValue(prop)
    .replace(/var\((--[\w-]+)\)/g, (_, name: string) => inherited(el, name));

afterEach(() => {
  view?.destroy();
  view = undefined;
  document.body.innerHTML = "";
  document.documentElement.style.removeProperty("--panel");
  document.documentElement.style.removeProperty("--editor-status-ink");
});

describe("the code editor's colours follow the shared colour variables", () => {
  it("paints the status bar from --panel and --editor-status-ink on the root", () => {
    const root = document.documentElement;
    root.style.setProperty("--panel", "rgb(1, 2, 3)");
    root.style.setProperty("--editor-status-ink", "rgb(4, 5, 6)");
    const status = mount().dom.querySelector<HTMLElement>(".cm-status");
    expect(status).toBeTruthy();

    expect(computedColor(status!, "background-color")).toBe("rgb(1, 2, 3)");
    expect(computedColor(status!, "color")).toBe("rgb(4, 5, 6)");

    root.style.setProperty("--panel", "rgb(250, 240, 230)");
    expect(computedColor(status!, "background-color")).toBe(
      "rgb(250, 240, 230)",
    );
  });
});
