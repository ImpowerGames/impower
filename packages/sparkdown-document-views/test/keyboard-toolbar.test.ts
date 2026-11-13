import { indentLess, indentMore } from "@codemirror/commands";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  formatDocument,
  presentColorPicker,
  serverColorDecorations,
  setDocumentColors,
  type ColorPick,
} from "@impower/codemirror-vscode-lsp-client/src";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  KEYBOARD_TOOLBAR_TABLE,
  keyboardToolbar,
  setKeyboardToolbarHold,
} from "../src/modules/script-editor/utils/extensions/keyboardToolbar";
import {
  scriptMode,
  setScriptMode,
} from "../src/modules/script-editor/utils/extensions/scriptMode";

let view: EditorView | undefined;
let parent: HTMLElement | undefined;
const tools: string[] = [];

const flush = async () => {
  await Promise.resolve();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
};

const mount = (mode: "reading" | "editing" | null) => {
  parent = document.body.appendChild(document.createElement("div"));
  view = new EditorView({
    state: EditorState.create({
      doc: "one\ntwo\nthree",
      extensions: [
        scriptMode(mode),
        keyboardToolbar({ onTool: (tool) => tools.push(tool) }),
      ],
    }),
    parent,
  });
  return view;
};

const toolbar = () =>
  view!.dom.querySelector<HTMLElement>(".cm-keyboard-toolbar");

const focus = async (v: EditorView) => {
  v.focus();
  await flush();
};

const blur = async (v: EditorView) => {
  v.contentDOM.blur();
  await flush();
};

beforeEach(() => {
  tools.length = 0;
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
});

afterEach(() => {
  view?.destroy();
  view = undefined;
  parent?.remove();
  parent = undefined;
  vi.restoreAllMocks();
});

describe("the keyboard toolbar's table", () => {
  it("groups the prototype's commands: Indent and Dedent together, then Format, Writing tools, the colour chip in the readout's place, Add", () => {
    const placements = KEYBOARD_TOOLBAR_TABLE.map((entry) => ({
      placement: entry.placement,
      group: entry.group,
      ids: entry.items.map((item) => item.id),
    }));
    expect(placements).toEqual([
      {
        placement: "start",
        group: "Indentation",
        ids: ["indent", "dedent"],
      },
      { placement: "start", group: undefined, ids: ["format", "writingTools"] },
      { placement: "center", group: undefined, ids: ["color", "position"] },
      { placement: "end", group: undefined, ids: ["add"] },
    ]);
  });

  it("runs the editor's own commands for indent, dedent and format", () => {
    const commands = Object.fromEntries(
      KEYBOARD_TOOLBAR_TABLE.flatMap((entry) => entry.items).map((item) => [
        item.id,
        "command" in item ? item.command : undefined,
      ]),
    );
    expect(commands["indent"]).toBe(indentMore);
    expect(commands["dedent"]).toBe(indentLess);
    expect(commands["format"]).toBe(formatDocument);
  });
});

describe("the keyboard toolbar on a phone", () => {
  it("stays away in reading mode", async () => {
    const v = mount("reading");
    await focus(v);
    expect(toolbar()).toBeNull();
  });

  it("shows while the editor has focus in editing mode and hides when it blurs", async () => {
    const v = mount("editing");
    await focus(v);
    expect(toolbar()).not.toBeNull();

    await blur(v);
    expect(toolbar()).toBeNull();
  });

  it("renders the table's labels in order, with the caret's position", async () => {
    const v = mount("editing");
    await focus(v);
    const buttons = Array.from(toolbar()!.querySelectorAll("button"));
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual([
      "Indent",
      "Dedent",
      "Format script",
      "Writing tools",
      "Go to line",
      "Add",
    ]);

    v.dispatch({ selection: { anchor: 8 } });
    await flush();
    expect(toolbar()!.querySelector("[data-toolbar-position]")?.textContent).toBe(
      "Line 3, Col 1",
    );
  });

  it("holds its spot while a panel stands in the keyboard's place", async () => {
    const v = mount("editing");
    await focus(v);
    v.dispatch({
      effects: setKeyboardToolbarHold.of({ held: true, headed: false }),
    });
    await blur(v);
    expect(toolbar()).not.toBeNull();

    v.dispatch({
      effects: setKeyboardToolbarHold.of({ held: false, headed: false }),
    });
    await flush();
    expect(toolbar()).toBeNull();
  });

  it("marks the toolbar headed while a panel's heading covers it", async () => {
    const v = mount("editing");
    await focus(v);
    v.dispatch({
      effects: setKeyboardToolbarHold.of({ held: true, headed: true }),
    });
    await flush();
    expect(toolbar()!.classList.contains("cm-keyboard-toolbar-headed")).toBe(
      true,
    );
  });

  it("does not hold in reading mode, where the writer's bar stands", async () => {
    const v = mount("reading");
    v.dispatch({
      effects: setKeyboardToolbarHold.of({ held: true, headed: false }),
    });
    await flush();
    expect(toolbar()).toBeNull();
  });

  it("hands Writing tools to the host", async () => {
    const v = mount("editing");
    await focus(v);
    toolbar()!
      .querySelector<HTMLElement>('button[aria-label="Writing tools"]')!
      .click();
    expect(tools).toEqual(["writingTools"]);
  });

  it("hands Add to the host", async () => {
    const v = mount("editing");
    await focus(v);
    const add = toolbar()!.querySelector<HTMLButtonElement>(
      'button[aria-label="Add"]',
    )!;
    expect(add.disabled).toBe(false);
    add.click();
    expect(tools).toEqual(["add"]);
  });

  it("indents and dedents the script when its buttons are pressed", async () => {
    const v = mount("editing");
    await focus(v);
    const press = (label: string) =>
      toolbar()!
        .querySelector<HTMLElement>(`button[aria-label="${label}"]`)!
        .click();

    press("Indent");
    expect(v.state.doc.line(1).text).toMatch(/^\s+one$/);
    press("Dedent");
    expect(v.state.doc.line(1).text).toBe("one");
  });

  it("runs the formatter from Format script", async () => {
    const item = KEYBOARD_TOOLBAR_TABLE.flatMap((entry) => entry.items).find(
      (entry) => entry.id === "format",
    ) as { command: (view: EditorView) => boolean };
    const format = vi.spyOn(item, "command").mockReturnValue(true);
    const v = mount("editing");
    await focus(v);
    toolbar()!
      .querySelector<HTMLElement>('button[aria-label="Format script"]')!
      .click();
    expect(format).toHaveBeenCalledWith(v);
  });

  it("closes when the mode returns to reading", async () => {
    const v = mount("editing");
    await focus(v);
    v.dispatch({ effects: setScriptMode.of("reading") });
    await flush();
    expect(toolbar()).toBeNull();
  });
});

describe("the keyboard toolbar's colour chip on a phone", () => {
  const DOC = "one\nlayout tint0 { text #ff880080 }\nthree";
  const FROM = DOC.indexOf("#");
  const TO = FROM + "#ff880080".length;
  const COLOR = { red: 1, green: 136 / 255, blue: 0, alpha: 128 / 255 };
  const shown: ColorPick[] = [];

  const mountColors = (pos: number, readOnly = false) => {
    shown.length = 0;
    parent = document.body.appendChild(document.createElement("div"));
    view = new EditorView({
      state: EditorState.create({
        doc: DOC,
        selection: EditorSelection.single(pos),
        extensions: [
          serverColorDecorations().editorExtension ?? [],
          presentColorPicker((pick) => shown.push(pick)),
          EditorState.readOnly.of(readOnly),
          scriptMode("editing"),
          keyboardToolbar({ onTool: (tool) => tools.push(tool) }),
        ],
      }),
      parent,
    });
    view.dispatch(
      setDocumentColors(view.state, [{ from: FROM, to: TO, color: COLOR }]),
    );
    return view;
  };

  const chip = () =>
    toolbar()?.querySelector<HTMLButtonElement>("[data-caret-color-chip]") ??
    null;
  const position = () =>
    toolbar()!.querySelector<HTMLElement>("[data-toolbar-position]")!;
  const sides = () =>
    Array.from(toolbar()!.querySelectorAll<HTMLElement>("[data-toolbar-placement]"))
      .filter((el) => el.dataset["toolbarPlacement"] !== "center")
      .map((el) => Array.from(el.querySelectorAll("button")));

  it("shows the colour under the caret in the readout's place", async () => {
    const v = mountColors(FROM + 3);
    await focus(v);
    expect(chip()).not.toBeNull();
    expect(chip()!.getAttribute("aria-label")).toBe("Change color #ff880080");
    expect(chip()!.textContent).toBe("#ff880080");
    const scriptSwatch = v.contentDOM
      .querySelector<HTMLElement>(".cm-color-swatch")!
      .style.getPropertyValue("--swatch");
    expect(scriptSwatch).not.toBe("");
    expect(
      chip()!
        .querySelector<HTMLElement>("[data-caret-color-swatch]")!
        .style.getPropertyValue("--swatch"),
    ).toBe(scriptSwatch);
    expect(position().hidden).toBe(true);
  });

  it("goes when the caret moves off the colour and comes back on it, the other tools untouched", async () => {
    const v = mountColors(FROM + 3);
    await focus(v);
    const before = sides();
    v.dispatch({ selection: { anchor: DOC.indexOf("three") } });
    await flush();
    expect(chip()).toBeNull();
    expect(position().hidden).toBe(false);
    expect(position().textContent).toBe("Line 3, Col 1");
    expect(sides()).toEqual(before);

    v.dispatch({ selection: { anchor: FROM } });
    await flush();
    expect(chip()?.textContent).toBe("#ff880080");
    expect(sides()).toEqual(before);
  });

  it("does not show for a selection that spans the colour", async () => {
    const v = mountColors(FROM);
    await focus(v);
    v.dispatch({ selection: EditorSelection.range(FROM, TO) });
    await flush();
    expect(chip()).toBeNull();
  });

  it("opens Change color through the command the swatch and the context menu use", async () => {
    const v = mountColors(FROM + 3);
    await focus(v);
    chip()!.click();
    expect(shown).toEqual([
      { from: FROM, to: TO, color: COLOR, text: "#ff880080" },
    ]);
  });

  it("does not show while the script cannot be edited", async () => {
    const v = mountColors(FROM + 3, true);
    await focus(v);
    expect(toolbar()).not.toBeNull();
    expect(chip()).toBeNull();
  });
});
