import type { BlockInfo, EditorView } from "@codemirror/view";
import type { ScreenplayConfig } from "../../../sparkdown-screenplay/src/types/ScreenplayConfig";
import DialogueWidget from "../../src/modules/screenplay-preview/classes/widgets/DialogueWidget";
import InsertedRowWidget from "../../src/modules/screenplay-preview/classes/widgets/InsertedRowWidget";
import NameWidget from "../../src/modules/screenplay-preview/classes/widgets/NameWidget";
import PageBreakWidget from "../../src/modules/screenplay-preview/classes/widgets/PageBreakWidget";
import TitlePageWidget from "../../src/modules/screenplay-preview/classes/widgets/TitlePageWidget";
import createEditorView from "../../src/modules/screenplay-preview/utils/createEditorView";
import { decorate } from "../../src/modules/screenplay-preview/utils/screenplayFormatting";
import { settleParse } from "../helpers/parseSettle";

let view: EditorView | undefined;

const render = (name: string, text: string, config: ScreenplayConfig, scenesBefore: number, width: number) => {
  const section = document.body.appendChild(document.createElement("section"));
  section.dataset["fixture"] = name;
  section.style.width = `${width}px`;
  view = createEditorView(section, {
    textDocument: { uri: "file:///main.sd", version: 1, text },
    config,
    scenesBefore,
  });
  settleParse(view);
};

const titlePageEstimate = () => {
  const ranges = view ? decorate(view.state) : [];
  const widget = ranges.map((range) => range.value.spec.widget).find((found) => found instanceof TitlePageWidget);
  return widget?.estimatedHeight;
};

const widgetKind = (widget: unknown) =>
  widget instanceof DialogueWidget
    ? "dialogue"
    : widget instanceof NameWidget
      ? widget.spec.pageBreak
        ? "name after a page break"
        : "name"
      : widget instanceof PageBreakWidget
        ? "page break"
        : widget instanceof InsertedRowWidget && !widget.inline
          ? "inserted row"
          : undefined;

const widgetHeights = () => {
  if (!view) return [];
  const measured: { kind: string; estimated: number; rendered: number }[] = [];
  const visit = (block: BlockInfo) => {
    if (Array.isArray(block.type)) {
      block.type.forEach(visit);
      return;
    }
    const kind = widgetKind(block.widget);
    if (!kind || !block.widget) return;
    const estimate = block.widget.estimatedHeight;
    measured.push({ kind, estimated: estimate < 0 ? view!.defaultLineHeight : estimate, rendered: block.height });
  };
  view.viewportLineBlocks.forEach(visit);
  return measured;
};

Object.assign(window, { renderScreenplay: render, titlePageEstimate, widgetHeights });
