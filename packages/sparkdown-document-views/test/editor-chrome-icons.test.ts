import { openSearchPanel } from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { LSPClient } from "@impower/codemirror-vscode-lsp-client/src";
import { iconMasks } from "@impower/impower-ui/icon-masks";
import { afterEach, describe, expect, it } from "vitest";
import EDITOR_LSP_ICONS from "../src/modules/script-editor/constants/EDITOR_LSP_ICONS";
import EDITOR_THEME from "../src/modules/script-editor/constants/EDITOR_THEME";
import {
  customGotoLinePanel,
  customSearchPanel,
  openCustomGotoLinePanel,
} from "../src/modules/script-editor/utils/extensions/customSearch";
import {
  keyboardToolbar,
  openKeyboardToolbar,
} from "../src/modules/script-editor/utils/extensions/keyboardToolbar";
import { statusPanel } from "../src/modules/script-editor/utils/extensions/statusPanel";

const known = new Set<string>(Object.values(iconMasks));
const unique = (values: string[]) => [...new Set(values)];

class SilentServer {
  send() {}
  subscribe() {}
  unsubscribe() {}
}

const views: EditorView[] = [];

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  document.body.innerHTML = "";
});

const mount = () => {
  const client = new LSPClient({ icons: EDITOR_LSP_ICONS }).connect(
    new SilentServer(),
    undefined,
    { capabilities: {} },
  );
  const view = new EditorView({
    state: EditorState.create({
      doc: "scene start\n\nend\n",
      extensions: [
        EditorView.theme(EDITOR_THEME, { dark: true }),
        customSearchPanel(),
        customGotoLinePanel(),
        statusPanel(),
        keyboardToolbar(),
        client.plugin({ uri: "file:///main.sd", version: 0 }),
      ],
    }),
    parent: document.body.appendChild(document.createElement("div")),
  });
  views.push(view);
  return view;
};

const maskRules = () =>
  Array.from(document.styleSheets).flatMap((sheet) =>
    Array.from(sheet.cssRules).flatMap((rule) => {
      const style = (rule as CSSStyleRule).style;
      const mask = style?.getPropertyValue("mask-image");
      return mask ? [{ selector: (rule as CSSStyleRule).selectorText, mask }] : [];
    }),
  );

const CHROME = [
  ["the find panel's close", ".cm-search button[name='close']", "close"],
  ["the find panel's previous match", "button[name='prev']", "up"],
  ["the find panel's next match", "button[name='next']", "down"],
  ["the find panel's replace", "button[name='replace']", "replace"],
  ["the find panel's replace all", "button[name='replaceAll']", "replace-all"],
  ["the match case toggle", "input[name='case']", "match-case"],
  ["the whole word toggle", "input[name='word']", "whole-word"],
  ["the regular expression toggle", "input[name='re']", "regex"],
  ["the go-to-line close", ".cm-gotoLine button[name='close']", "close"],
  ["the go-to-line submit", "button[name='submit']", "arrow"],
  ["the problems toggle", ".cm-problemsToggleIcon", "chevron-down"],
  ["the previous problem", ".cm-navLeftIcon", "chevron-down"],
  ["the next problem", ".cm-navRightIcon", "chevron-down"],
  ["the context menu's back", ".cm-menu-back-icon", "chevron-left"],
  ["the context menu's more", ".cm-menu-more-icon", "more-vertical"],
  ["the fold arrows", ".cm-fold-arrow", "chevron-down"],
  ["the references' collapse", ".cm-lsp-collapse-icon", "chevron-down"],
] as const;

describe("the code editor's chrome icons", () => {
  it.each(CHROME)("draws %s from the Folio icon map", (_label, part, glyph) => {
    mount();
    const masks = unique(maskRules().filter((rule) => rule.selector.includes(part)).map((rule) => rule.mask));
    expect(masks).toEqual([iconMasks[glyph]]);
  });

  it("holds no mask in the find, go-to-line, status, menu, fold or references chrome that the map does not hold", () => {
    mount();
    const chrome = maskRules().filter((rule) =>
      /cm-search|cm-gotoLine|cm-problemsToggleIcon|cm-navLeftIcon|cm-navRightIcon|cm-menu-|cm-fold-arrow|cm-lsp-collapse-icon|cm-toolbar-icon/.test(rule.selector),
    );
    expect(chrome.length).toBeGreaterThan(0);
    expect(chrome.filter((rule) => !known.has(rule.mask))).toEqual([]);
  });

  it("draws the keyboard toolbar's search, undo, redo, indent, dedent and format from the map", () => {
    const view = mount();
    openKeyboardToolbar(view);
    const icons = Array.from(view.dom.querySelectorAll<HTMLElement>(".cm-keyboard-toolbar .cm-toolbar-icon"));
    expect(icons.map((icon) => icon.style.maskImage)).toEqual(
      (["search", "undo", "redo", "indent", "dedent", "format"] as const).map((name) => iconMasks[name]),
    );
  });

  it("mounts the find and go-to-line panels whose buttons those masks paint", () => {
    const view = mount();
    openSearchPanel(view);
    for (const name of ["close", "prev", "next", "replace", "replaceAll"]) {
      expect(view.dom.querySelector(`.cm-panel.cm-search button[name="${name}"]`), name).not.toBeNull();
    }
    for (const name of ["case", "word", "re"]) {
      expect(view.dom.querySelector(`.cm-panel.cm-search label input[name="${name}"]`), name).not.toBeNull();
    }
    openCustomGotoLinePanel(view);
    for (const name of ["close", "submit"]) {
      expect(view.dom.querySelector(`.cm-panel.cm-gotoLine button[name="${name}"]`), name).not.toBeNull();
    }
  });
});
