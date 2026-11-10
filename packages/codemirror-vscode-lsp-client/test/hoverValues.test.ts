import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  closeHoverCards,
  coarsePointer,
  hoverExpressionAt,
  hoverValues,
  serverHovers,
} from "../src";

const doc = "store mood = 0\n  & mood = hero.trust + 1\n  The 2nd line.";

if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () =>
    Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
}

let view: EditorView | undefined;

afterEach(() => {
  view?.destroy();
  view = undefined;
  document.body.innerHTML = "";
});

const mount = (coarse: boolean, value: (expression: string) => Promise<string | null>) => {
  view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [
        serverHovers().editorExtension!,
        coarsePointer.of(coarse),
        hoverValues.of(value),
      ],
    }),
    parent: document.body.appendChild(document.createElement("div")),
  });
  return view;
};

const tap = (v: EditorView, pos: number) =>
  v.dispatch({ selection: { anchor: pos }, userEvent: "select.touch" });

describe("a variable's value in the hover card", () => {
  it("reads the name under the pointer, with the names it is a field of", () => {
    const state = EditorState.create({ doc });
    const at = (text: string, offset = 0) =>
      hoverExpressionAt(state, doc.indexOf(text) + offset)?.text ?? null;
    expect(at("mood")).toBe("mood");
    expect(at("trust", 2)).toBe("hero.trust");
    expect(at("hero", 1)).toBe("hero");
    expect(at("2nd")).toBeNull();
    expect(at("= 0", 0)).toBeNull();
  });

  it("shows the tapped name's value at the top of the card on a touch screen", async () => {
    const value = vi.fn(async (expression: string) => (expression === "hero.trust" ? "3" : null));
    const v = mount(true, value);
    tap(v, doc.indexOf("trust") + 1);
    await vi.waitFor(() =>
      expect(v.dom.querySelector(".cm-lsp-hover-card .cm-lsp-hover-value")?.textContent).toBe(
        "hero.trust = 3",
      ),
    );
    expect(value).toHaveBeenCalledWith("hero.trust");
    tap(v, doc.indexOf("store"));
    expect(v.dom.querySelector(".cm-lsp-hover-value")).toBeNull();
  });

  it("shows nothing for a name with no value, as while the run is not paused", async () => {
    const value = vi.fn(async () => null);
    const v = mount(true, value);
    tap(v, doc.indexOf("mood") + 1);
    await vi.waitFor(() => expect(value).toHaveBeenCalledWith("mood"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(v.dom.querySelector(".cm-lsp-hover-value")).toBeNull();
  });

  const openCard = async (v: EditorView) => {
    tap(v, doc.indexOf("mood") + 1);
    await vi.waitFor(() =>
      expect(v.dom.querySelector(".cm-lsp-hover-value")?.textContent).toBe("mood = 1"),
    );
  };

  it("keeps the card open after the tap that opened it", async () => {
    const v = mount(true, async () => "1");
    await openCard(v);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(v.dom.querySelector(".cm-lsp-hover-value")?.textContent).toBe("mood = 1");
  });

  it("closes the tapped card on Escape", async () => {
    const v = mount(true, async () => "1");
    await openCard(v);
    v.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
    expect(v.dom.querySelector(".cm-lsp-hover-value")).toBeNull();
  });

  it("closes the tapped card when the page scrolls", async () => {
    const v = mount(true, async () => "1");
    await openCard(v);
    document.dispatchEvent(new Event("scroll"));
    expect(v.dom.querySelector(".cm-lsp-hover-value")).toBeNull();
  });

  it("closes the tapped card when the run resumes", async () => {
    const v = mount(true, async () => "1");
    await openCard(v);
    expect(closeHoverCards(v)).toBe(true);
    expect(v.dom.querySelector(".cm-lsp-hover-value")).toBeNull();
    expect(closeHoverCards(v)).toBe(false);
  });

  it("leaves a fine pointer's taps to the hover", async () => {
    const value = vi.fn(async () => "1");
    const v = mount(false, value);
    tap(v, doc.indexOf("mood") + 1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(value).not.toHaveBeenCalled();
  });
});
