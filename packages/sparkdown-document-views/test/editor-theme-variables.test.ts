import { openSearchPanel } from "@codemirror/search";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView, showTooltip } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import EDITOR_THEME from "../src/modules/script-editor/constants/EDITOR_THEME";
import { customSearchPanel } from "../src/modules/script-editor/utils/extensions/customSearch";
import { statusPanel } from "../src/modules/script-editor/utils/extensions/statusPanel";

let view: EditorView | undefined;

const mount = (extra: Extension[] = []) => {
  const parent = document.body.appendChild(document.createElement("div"));
  view = new EditorView({
    state: EditorState.create({
      doc: "scene start\n  -> TEASER\nend\n",
      extensions: [
        statusPanel(),
        ...extra,
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
  for (const name of [
    "--editor-status-ink",
    "--ink",
    "--editor-icon-ink",
    "--editor-icon-muted",
    "--editor-icon-close",
  ]) {
    document.documentElement.style.removeProperty(name);
  }
});

const tooltip = showTooltip.of({
  pos: 0,
  create: () => {
    const dom = document.createElement("div");
    dom.textContent = "Statements must be inside a scene";
    return { dom };
  },
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

  it("writes tooltip and panel text in --ink rather than CodeMirror's dark-mode white", () => {
    document.documentElement.style.setProperty("--ink", "rgb(7, 8, 9)");
    const dom = mount([tooltip]).dom;
    const tip = dom.querySelector<HTMLElement>(".cm-tooltip");
    const panels = dom.querySelector<HTMLElement>(".cm-panels");
    expect(tip).toBeTruthy();
    expect(panels).toBeTruthy();

    expect(computedColor(tip!, "color")).toBe("rgb(7, 8, 9)");
    expect(computedColor(panels!, "color")).toBe("rgb(7, 8, 9)");
  });

  it("draws the find and go-to-line icons as masks painted by the icon variables", () => {
    const editor = mount([customSearchPanel()]);
    openSearchPanel(editor);
    const panel = editor.dom.querySelector<HTMLElement>(".cm-panel.cm-search");
    expect(panel).toBeTruthy();
    for (const el of panel!.querySelectorAll("button")) {
      expect(
        getComputedStyle(el).getPropertyValue("background-image"),
        el.outerHTML.slice(0, 60),
      ).toBe("none");
    }

    const panelIcons = declarations(EDITOR_THEME).filter(
      ({ selector }) =>
        /cm-search|cm-gotoLine/.test(selector) &&
        /::after|&::after/.test(selector),
    );
    const masks = panelIcons.filter(({ property }) => property === "maskImage");
    expect(masks.length).toBe(10);
    for (const { selector } of masks) {
      const fill = panelIcons.find(
        (d) => d.selector === selector && d.property === "backgroundColor",
      );
      expect(fill?.value, selector).toMatch(
        /^var\(--editor-icon-(ink|muted|close)\)$/,
      );
    }
  });

  it("decides no colour itself: every colour is a variable, and an image is a black mask", () => {
    for (const { selector, property, value } of declarations(EDITOR_THEME)) {
      const where = `${selector} ${property}: ${value.slice(0, 80)}`;
      if (value.startsWith("url('data:image")) {
        if (property === "maskImage") {
          expect(value.match(/(fill|stroke)="[^"]*"/g) ?? [], where).toSatisfy(
            (paints: string[]) =>
              paints.every((paint) =>
                /"(none|black|currentColor)"$/.test(paint),
              ),
          );
        } else {
          expect(selector, where).not.toMatch(/cm-panel|cm-search|cm-gotoLine/);
        }
        continue;
      }
      expect(value, where).not.toMatch(
        /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(|\bwhite\b/i,
      );
    }
  });
});

const declarations = (
  theme: Record<string, unknown>,
  prefix = "",
): { selector: string; property: string; value: string }[] =>
  Object.entries(theme).flatMap(([key, value]) =>
    value && typeof value === "object"
      ? declarations(
          value as Record<string, unknown>,
          `${prefix} ${key}`.trim(),
        )
      : [{ selector: prefix, property: key, value: String(value) }],
  );
