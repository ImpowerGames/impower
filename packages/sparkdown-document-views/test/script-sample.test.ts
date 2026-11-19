import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { mobileViewportManager } from "../src/modules/script-editor/utils/extensions/mobileViewportManager";
import SparkdownScriptSample from "../src/modules/script-sample/SparkdownScriptSample";
import type { ScriptAppearance } from "../src/cm-script-appearance/scriptAppearanceOptions";
import { ALL_OFF_APPEARANCE } from "./fixtures/scriptAppearance";

const DIALOGUE = ["scene intro", "  MAYA:", "    Hello there.", "end"].join("\n");
const CHOICES = ["scene pick", "  choose", "    + [Go.] -> away", "  end", "end"].join("\n");

let host: HTMLDivElement | undefined;

const show = async (props: { text: string; appearance: ScriptAppearance; caret?: number }) => {
  host ??= document.body.appendChild(document.createElement("div"));
  await act(async () => render(h(SparkdownScriptSample, { ...props, label: "Read-only syntax sample" }), host!));
  const editor = host.querySelector<HTMLElement>(".cm-editor")!;
  return EditorView.findFromDOM(editor)!;
};

afterEach(async () => {
  if (host) {
    await act(async () => render(null, host!));
    host.remove();
    host = undefined;
  }
});

describe("the read-only script sample", () => {
  it("shows the sample highlighted by the editor's grammar in a read-only, non-editable view", async () => {
    const view = await show({ text: DIALOGUE, appearance: ALL_OFF_APPEARANCE });
    const region = host!.querySelector("[data-script-sample]")!;
    expect(region.getAttribute("role")).toBe("region");
    expect(region.getAttribute("aria-label")).toBe("Read-only syntax sample");
    expect(view.state.doc.toString()).toBe(DIALOGUE);
    expect(view.state.facet(EditorState.readOnly)).toBe(true);
    expect(view.contentDOM.getAttribute("contenteditable")).toBe("false");
    expect(view.contentDOM.querySelectorAll(".cm-line span[class]").length).toBeGreaterThan(0);
  });

  it("follows each appearance option as it changes, without remounting", async () => {
    const view = await show({ text: DIALOGUE, appearance: ALL_OFF_APPEARANCE });
    expect(view.dom.classList.contains("cm-bold-speakers")).toBe(false);
    const next = await show({ text: DIALOGUE, appearance: { ...ALL_OFF_APPEARANCE, boldSpeakerNames: true } });
    expect(next).toBe(view);
    expect(view.dom.classList.contains("cm-bold-speakers")).toBe(true);
  });

  it("lets a scroll gesture on the sample chain to the page, even beside a touch editor", async () => {
    const editorHost = document.body.appendChild(document.createElement("div"));
    const editor = new EditorView({
      parent: editorHost,
      state: EditorState.create({ doc: DIALOGUE, extensions: [mobileViewportManager()] }),
    });
    try {
      const view = await show({ text: DIALOGUE, appearance: ALL_OFF_APPEARANCE });
      for (const el of [view.dom, view.scrollDOM, view.contentDOM]) {
        expect(getComputedStyle(el).overscrollBehavior).not.toBe("none");
      }
      expect(getComputedStyle(editor.scrollDOM).overscrollBehavior).toBe("none");
      expect(getComputedStyle(editor.contentDOM).overscrollBehavior).toBe("none");
    } finally {
      editor.destroy();
      editorHost.remove();
    }
  });

  it("replaces the text and puts the caret where the new sample marks it", async () => {
    const view = await show({ text: DIALOGUE, appearance: ALL_OFF_APPEARANCE });
    const caret = CHOICES.indexOf("-> away");
    await show({ text: CHOICES, appearance: ALL_OFF_APPEARANCE, caret });
    expect(view.state.doc.toString()).toBe(CHOICES);
    expect(view.state.selection.main.head).toBe(caret);
  });
});
