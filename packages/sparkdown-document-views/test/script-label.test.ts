import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import {
  scriptLabel,
  scriptLabelText,
} from "../src/modules/script-editor/utils/extensions/scriptLabel";
import { createScriptSampleState } from "../src/modules/script-sample/SparkdownScriptSample";
import { ALL_OFF_APPEARANCE } from "./fixtures/scriptAppearance";

describe("script editor accessible name", () => {
  let view: EditorView | undefined;

  afterEach(() => {
    view?.destroy();
    view = undefined;
  });

  it("names the text box after the script it holds", () => {
    view = new EditorView({
      state: EditorState.create({
        doc: "Hello",
        extensions: [scriptLabel("file:///project/scripts/Chapter%201.sd")],
      }),
      parent: document.body,
    });
    expect(view.contentDOM.getAttribute("role")).toBe("textbox");
    expect(view.contentDOM.getAttribute("aria-label")).toBe("Chapter 1");
  });

  it("names the Settings script sample's text box with the sample's label", () => {
    view = new EditorView({
      state: createScriptSampleState(
        "Hello",
        ALL_OFF_APPEARANCE,
        undefined,
        "Read-only syntax sample",
      ),
      parent: document.body,
    });
    expect(view.contentDOM.getAttribute("aria-label")).toBe(
      "Read-only syntax sample",
    );
  });

  it("reads the name from the last path segment without its extension", () => {
    expect(scriptLabelText("file:///p/main.sd")).toBe("Main");
    expect(scriptLabelText("file:///p/notes.txt")).toBe("notes");
    expect(scriptLabelText("file:///p/a.b/intro.sd?x=1")).toBe("intro");
    expect(scriptLabelText("file:///p/%E0%A4%A.sd")).toBe("%E0%A4%A");
    expect(scriptLabelText("file:///p/")).toBe("Script");
  });
});
