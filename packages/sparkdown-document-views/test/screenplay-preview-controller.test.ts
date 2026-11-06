import { ScrolledEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ScrolledEditorMessage";
import { SelectedEditorMessage } from "@impower/spark-editor-protocol/src/protocols/editor/SelectedEditorMessage";
import { LoadPreviewMessage } from "@impower/spark-editor-protocol/src/protocols/preview/LoadPreviewMessage";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScreenplayPreviewController } from "../src/modules/screenplay-preview/ScreenplayPreviewController";

if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () =>
    Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
}

const URI = "file:///main.sd";

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

const controllers: TestController[] = [];
const hosts: HTMLElement[] = [];

afterEach(() => {
  controllers.splice(0).forEach((controller) => controller.dispose());
  hosts.splice(0).forEach((host) => host.remove());
});

let nextId = 0;

const loadAt = (line: number, visibleRange?: ReturnType<typeof at>) => {
  const host = document.body.appendChild(document.createElement("div"));
  hosts.push(host);
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
