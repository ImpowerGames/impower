import { EditorView } from "@codemirror/view";
import { ScrolledEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ScrolledEditorMessage";
import { SelectedEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/SelectedEditorMessage";
import { sendProtocolMessage } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { LoadPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/LoadPreviewMessage";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScreenplayPreviewController } from "../src/modules/screenplay-preview/ScreenplayPreviewController";
import { settleParse } from "./helpers/parseSettle";

if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () =>
    Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
}

const URI = "file:///main.sd";

const LINES = [
  "First beat.",
  "",
  "Second beat.",
  "",
  "Third beat.",
  "",
  "BUNNY: I told you we'd be late.",
  "",
];

const controllers: ScreenplayPreviewController[] = [];

const mount = async (options: ConstructorParameters<typeof ScreenplayPreviewController>[2] = {}) => {
  const host = document.body.appendChild(document.createElement("div"));
  const preview = host.appendChild(document.createElement("div"));
  const loading = host.appendChild(document.createElement("div"));
  const controller = new ScreenplayPreviewController(host, { preview, loading }, options);
  controllers.push(controller);
  controller.setup();
  sendProtocolMessage(
    LoadPreviewMessage.type.request({
      type: "screenplay",
      textDocument: { uri: URI, languageId: "sparkdown", version: 1, text: LINES.join("\n") },
    }),
  );
  const view = EditorView.findFromDOM(preview.querySelector<HTMLElement>(".cm-editor")!)!;
  settleParse(view);
  await vi.waitFor(
    () => {
      view.dispatch({});
      expect((controller as unknown as { _loaded: boolean })._loaded).toBe(true);
    },
    { timeout: 10_000, interval: 200 },
  );
  return { controller, view };
};

const caretAt = (line: number, { userEvent = false, docChanged = false } = {}) =>
  sendProtocolMessage(
    SelectedEditorMessage.type.notification({
      textDocument: { uri: URI },
      selectedRange: { start: { line, character: 0 }, end: { line, character: 0 } },
      userEvent,
      docChanged,
    }),
  );

const editorScrolledTo = (line: number) =>
  sendProtocolMessage(
    ScrolledEditorMessage.type.notification({
      textDocument: { uri: URI },
      visibleRange: { start: { line, character: 0 }, end: { line: line + 1, character: 0 } },
      target: "element",
    }),
  );

const litText = (view: EditorView) => {
  const lit = view.contentDOM.querySelectorAll(".cm-activeLine, .sp-lit");
  expect(lit.length).toBeLessThanOrEqual(1);
  return lit[0]?.textContent?.replace(/\s+/g, " ").trim();
};

afterEach(() => {
  for (const controller of controllers.splice(0)) {
    controller.dispose();
  }
  document.body.replaceChildren();
});

describe("screenplay preview position", () => {
  it("lights the block the editor caret moves to, whether the author or play moved it", async () => {
    const { view } = await mount();
    caretAt(2);
    expect(litText(view)).toBe("Second beat.");
    caretAt(4, { userEvent: true });
    expect(litText(view)).toBe("Third beat.");
    caretAt(6);
    expect(litText(view)).toContain("I told you we'd be late.");
    caretAt(0);
    expect(litText(view)).toBe("First beat.");
  });

  it("keeps the lit block while the author is typing", async () => {
    const { view } = await mount();
    caretAt(2);
    caretAt(4, { docChanged: true });
    expect(litText(view)).toBe("Second beat.");
  });

  it("scrolls to the lit block while the story plays", async () => {
    const { controller, view } = await mount({ playing: true });
    const scrolls = vi.spyOn(view, "dispatch");
    caretAt(4);
    expect(scrolls.mock.calls.some(([spec]) => (spec as { effects?: unknown }).effects != null)).toBe(true);
    scrolls.mockClear();
    controller.setPlaying(false);
    caretAt(2);
    expect(scrolls.mock.calls.some(([spec]) => (spec as { effects?: unknown }).effects != null)).toBe(false);
  });
});

describe("screenplay scroll sync preference", () => {
  const scrollSpy = (controller: ScreenplayPreviewController) =>
    vi.spyOn(controller as unknown as { scrollToRange: (range: unknown) => void }, "scrollToRange");

  it("follows the editor's scroll position when sync is on", async () => {
    const { controller } = await mount({ syncScroll: true });
    const scrolled = scrollSpy(controller);
    editorScrolledTo(4);
    expect(scrolled).toHaveBeenCalledTimes(1);
  });

  it("leaves the page where it is when sync is off", async () => {
    const { controller } = await mount({ syncScroll: true });
    controller.setSyncScroll(false);
    const scrolled = scrollSpy(controller);
    editorScrolledTo(4);
    expect(scrolled).not.toHaveBeenCalled();
  });
});

const at = (line: number) => ({
  start: { line, character: 0 },
  end: { line, character: 0 },
});

class TestController extends ScreenplayPreviewController {
  scrolls: unknown[] = [];

  protected override scrollToRange(
    ...args: Parameters<ScreenplayPreviewController["scrollToRange"]>
  ) {
    this.scrolls.push(args[0]);
    super.scrollToRange(...args);
  }

  get view() {
    return this._view!;
  }

  get loaded() {
    return this._loaded;
  }
}

let nextId = 0;

const loadAt = (line: number, visibleRange?: ReturnType<typeof at>) => {
  const host = document.body.appendChild(document.createElement("div"));
  const controller = new TestController(host, {
    preview: host.appendChild(document.createElement("div")),
    loading: host.appendChild(document.createElement("div")),
  });
  controllers.push(controller);
  controller["handleLoadPreview"]({
    ...LoadPreviewMessage.type.request({
      type: "screenplay",
      textDocument: {
        uri: URI,
        languageId: "sparkdown",
        version: 0,
        text: "one\n\ntwo\n\nthree\n\nfour\n\nfive\n",
      },
      selectedRange: at(line),
      visibleRange,
    }),
    id: `load-${nextId++}`,
  });
  return controller;
};

const settled = (controller: TestController) =>
  vi.waitFor(() => expect(controller.loaded).toBe(true), {
    timeout: 10_000,
    interval: 20,
  });

const lineOfCaret = (controller: TestController) =>
  controller.view.state.doc.lineAt(controller.view.state.selection.main.head)
    .number - 1;

describe("ScreenplayPreviewController load handover", () => {
  it("keeps a selection the editor made while the preview was still loading", async () => {
    const controller = loadAt(0);
    controller["handleSelectedEditor"](
      SelectedEditorMessage.type.notification({
        textDocument: { uri: URI },
        selectedRange: at(6),
        docChanged: false,
        userEvent: true,
      }),
    );
    await settled(controller);
    expect(lineOfCaret(controller)).toBe(6);
  });

  it("scrolls to where the editor scrolled while the preview was still loading", async () => {
    const controller = loadAt(0, at(2));
    controller["handleScrolledEditor"](
      ScrolledEditorMessage.type.notification({
        textDocument: { uri: URI },
        visibleRange: at(6),
        target: "element",
      }),
    );
    await settled(controller);
    expect(controller.scrolls.at(-1)).toEqual(at(6));
  });

  it("settles on the selection and visible range it loaded with when nothing moved", async () => {
    const controller = loadAt(4, at(2));
    await settled(controller);
    expect(lineOfCaret(controller)).toBe(4);
    expect(controller.scrolls).toEqual([at(2)]);
  });
});
