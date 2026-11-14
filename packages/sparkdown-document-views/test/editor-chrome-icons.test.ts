import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { LSPClient } from "@impower/codemirror-vscode-lsp-client/src";
import { iconMasks } from "@impower/impower-ui/icon-masks";
import { afterEach, describe, expect, it } from "vitest";
import { foldMarkerDOM } from "../src/cm-fold-marks/foldMarks";
import EDITOR_LSP_ICONS from "../src/modules/script-editor/constants/EDITOR_LSP_ICONS";
import EDITOR_THEME from "../src/modules/script-editor/constants/EDITOR_THEME";
import {
  customGotoLinePanel,
  openCustomGotoLinePanel,
} from "../src/modules/script-editor/utils/extensions/gotoLinePanel";
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
  ["the go-to-line close", ".cm-gotoLine button[name='close']", "close"],
  ["the go-to-line submit", "button[name='submit']", "arrow"],
  ["the previous problem", ".cm-navLeftIcon", "chevron-down"],
  ["the next problem", ".cm-navRightIcon", "chevron-down"],
] as const;

describe("the code editor's chrome icons", () => {
  it.each(CHROME)("draws %s from the Folio icon map", (_label, part, glyph) => {
    mount();
    const masks = unique(maskRules().filter((rule) => rule.selector.includes(part)).map((rule) => rule.mask));
    expect(masks).toEqual([iconMasks[glyph]]);
  });

  it("holds no mask in the go-to-line, status, menu or fold chrome that the map does not hold", () => {
    mount();
    const chrome = maskRules().filter((rule) =>
      /cm-gotoLine|cm-navLeftIcon|cm-navRightIcon|cm-menu-|cm-toolbar-icon/.test(rule.selector),
    );
    expect(chrome.length).toBeGreaterThan(0);
    expect(chrome.filter((rule) => !known.has(rule.mask))).toEqual([]);
  });

  it("draws the fold markers as gutter buttons from the map, open and closed", () => {
    for (const open of [true, false]) {
      const marker = foldMarkerDOM(open);
      expect(marker.tagName).toBe("BUTTON");
      expect(marker.classList.contains("cm-gutter-button")).toBe(true);
      expect(marker.style.getPropertyValue("--gutter-button-icon")).toBe(iconMasks["chevron-down"]);
      expect(marker.getAttribute("aria-label")).toBe(open ? "Fold" : "Unfold");
    }
  });

  it("draws the keyboard toolbar's indent, dedent, format, writing tools and add from the map", () => {
    const view = mount();
    openKeyboardToolbar(view);
    const icons = Array.from(view.dom.querySelectorAll<HTMLElement>(".cm-keyboard-toolbar .cm-toolbar-icon"));
    expect(icons.map((icon) => icon.style.maskImage)).toEqual(
      (["indent", "dedent", "format", "more", "plus"] as const).map((name) => iconMasks[name]),
    );
  });

  it("mounts the go-to-line panel whose buttons those masks paint", () => {
    const view = mount();
    openCustomGotoLinePanel(view);
    for (const name of ["close", "submit"]) {
      expect(view.dom.querySelector(`.cm-panel.cm-gotoLine button[name="${name}"]`), name).not.toBeNull();
    }
  });
});
