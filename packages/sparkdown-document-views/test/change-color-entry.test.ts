import { EditorSelection, EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  changeColor,
  contextMenu,
  presentColorPicker,
  serverColorDecorations,
  setDocumentColors,
  showContextMenu,
  type ColorPick,
} from "@impower/codemirror-vscode-lsp-client/src";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scriptMode } from "../src/modules/script-editor/utils/extensions/scriptMode";

let view: EditorView | undefined;

beforeEach(() => {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
});

afterEach(() => {
  view?.destroy();
  view = undefined;
  document.body.innerHTML = "";
});

const DOC = "define tint = #ff880080\nscene intro";
const FROM = DOC.indexOf("#");
const TO = FROM + "#ff880080".length;
const COLOR = { red: 1, green: 136 / 255, blue: 0, alpha: 128 / 255 };

function mount(pos: number, extensions: Extension[] = []) {
  const decorations = serverColorDecorations().editorExtension ?? [];
  view = new EditorView({
    state: EditorState.create({
      doc: DOC,
      selection: EditorSelection.single(pos),
      extensions: [contextMenu(), decorations, ...extensions],
    }),
    parent: document.body.appendChild(document.createElement("div")),
  });
  view.dispatch(
    setDocumentColors(view.state, [{ from: FROM, to: TO, color: COLOR }]),
  );
  return view;
}

const swatch = () =>
  document.querySelector<HTMLElement>(".cm-content .cm-color-swatch")!;

const rows = () =>
  Array.from(
    document.querySelectorAll<HTMLElement>(".cm-context-menu .cm-menu-item"),
  ).map((el) => el.firstElementChild?.textContent ?? "");

const item = (label: string) =>
  Array.from(
    document.querySelectorAll<HTMLElement>(".cm-context-menu .cm-menu-item"),
  ).find((el) => el.firstElementChild?.textContent === label)!;

describe("the swatch in the script", () => {
  it("hands the value under it to the Change color view where the host shows one", () => {
    const shown: ColorPick[] = [];
    mount(0, [presentColorPicker((pick) => shown.push(pick))]);
    swatch().click();
    expect(shown).toEqual([
      { from: FROM, to: TO, color: COLOR, text: "#ff880080" },
    ]);
    expect(document.querySelector("input[type=color]")).toBeNull();
  });

  it("only places the caret on a phone, in editing and in reading mode", () => {
    for (const mode of ["editing", "reading"] as const) {
      const shown: ColorPick[] = [];
      mount(0, [
        scriptMode(mode),
        presentColorPicker((pick) => shown.push(pick)),
      ]);
      swatch().click();
      expect(shown, mode).toEqual([]);
      expect(document.querySelector("input[type=color]"), mode).toBeNull();
      view!.destroy();
      document.body.innerHTML = "";
    }
    view = undefined;
  });

  it("asks for nothing while the script cannot be edited", () => {
    const shown: ColorPick[] = [];
    mount(0, [
      EditorState.readOnly.of(true),
      presentColorPicker((pick) => shown.push(pick)),
    ]);
    swatch().click();
    expect(shown).toEqual([]);
    expect(document.querySelector("input[type=color]")).toBeNull();
  });

  it("opens the device's picker where the host has no Change color view", () => {
    mount(0);
    const showPicker = vi
      .spyOn(HTMLInputElement.prototype, "click")
      .mockImplementation(() => {});
    swatch().click();
    const picker = document.querySelector<HTMLInputElement>("input[type=color]");
    expect(picker?.value).toBe("#ff8800");
    expect(showPicker).toHaveBeenCalled();
  });
});

describe("the context menu's Change color", () => {
  it("is offered where the caret is on a color, and hands that value over", () => {
    const shown: ColorPick[] = [];
    const v = mount(FROM + 2, [presentColorPicker((pick) => shown.push(pick))]);
    showContextMenu(v, { pos: FROM + 2, x: 10, y: 10 });
    expect(rows()).toContain("Change color");
    item("Change color").click();
    expect(shown).toEqual([
      { from: FROM, to: TO, color: COLOR, text: "#ff880080" },
    ]);
  });

  it("is not offered while the script cannot be edited", () => {
    const shown: ColorPick[] = [];
    const v = mount(FROM + 2, [
      EditorState.readOnly.of(true),
      presentColorPicker((pick) => shown.push(pick)),
    ]);
    showContextMenu(v, { pos: FROM + 2, x: 10, y: 10 });
    expect(rows()).not.toContain("Change color");
    expect(changeColor(v)).toBe(false);
    expect(shown).toEqual([]);
  });

  it("is not offered where the caret is off every color", () => {
    const v = mount(DOC.indexOf("intro"), [presentColorPicker(() => {})]);
    showContextMenu(v, { pos: DOC.indexOf("intro"), x: 10, y: 10 });
    expect(rows()).not.toContain("Change color");
  });
});
