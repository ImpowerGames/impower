import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import EDITOR_THEME from "../src/modules/script-editor/constants/EDITOR_THEME";

let view: EditorView | undefined;

const mount = () => {
  const parent = document.body.appendChild(document.createElement("div"));
  view = new EditorView({
    state: EditorState.create({
      doc: "scene start\n  -> TEASER\nend\n",
      extensions: [EditorView.theme(EDITOR_THEME, { dark: true })],
    }),
    parent,
  });
  return view;
};

afterEach(() => {
  view?.destroy();
  view = undefined;
  document.body.innerHTML = "";
});

describe("script type", () => {
  it("takes its size and leading from the script variables", () => {
    const editor = getComputedStyle(mount().dom);
    expect(editor.getPropertyValue("font-size")).toBe("var(--script-size, 16px)");
    expect(editor.getPropertyValue("line-height")).toBe("var(--script-leading, 1.5)");
    const scroller = getComputedStyle(view!.scrollDOM);
    expect(scroller.getPropertyValue("font-size")).toBe("inherit");
    expect(scroller.getPropertyValue("line-height")).toBe("inherit");
  });

  it("keeps columns monospaced: no kerning, ligatures or synthesis", () => {
    const editor = getComputedStyle(mount().dom);
    expect(editor.getPropertyValue("font-kerning")).toBe("none");
    expect(editor.getPropertyValue("font-variant-ligatures")).toBe("none");
    expect(editor.getPropertyValue("font-synthesis")).toBe("none");
  });

  it("sets script lines in the script family", () => {
    const line = mount().contentDOM.querySelector(".cm-line")!;
    expect(getComputedStyle(line).getPropertyValue("font-family")).toContain(
      "var(--font-script",
    );
  });
});
