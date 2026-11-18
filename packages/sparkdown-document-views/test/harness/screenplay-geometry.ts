import { RangeSet } from "@codemirror/state";
import { BlockType, type BlockInfo, type EditorView, type WidgetType } from "@codemirror/view";
import type { ScreenplayConfig } from "../../../sparkdown-screenplay/src/types/ScreenplayConfig";
import CollapseWidget from "../../src/modules/screenplay-preview/classes/widgets/CollapseWidget";
import DialogueWidget from "../../src/modules/screenplay-preview/classes/widgets/DialogueWidget";
import HiddenLineWidget from "../../src/modules/screenplay-preview/classes/widgets/HiddenLineWidget";
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

const currentWidgets = () => {
  const widgets = new Map<string, WidgetType[]>();
  const iterator = RangeSet.of(view ? decorate(view.state) : [], true).iter();
  for (; iterator.value; iterator.next()) {
    const widget = iterator.value.spec.widget as WidgetType | undefined;
    if (!widget) continue;
    const key = `${iterator.from}-${iterator.to}:${widget.constructor.name}`;
    widgets.set(key, [...(widgets.get(key) ?? []), widget]);
  }
  return (block: BlockInfo) =>
    block.widget ? widgets.get(`${block.from}-${block.to}:${block.widget.constructor.name}`)?.shift() : undefined;
};

const widgetHeights = () => {
  if (!view) return [];
  const measured: { kind: string; estimated: number; rendered: number }[] = [];
  const widgetOf = currentWidgets();
  const visit = (block: BlockInfo) => {
    if (Array.isArray(block.type)) {
      block.type.forEach(visit);
      return;
    }
    const widget = widgetOf(block);
    const kind = widgetKind(widget);
    if (!kind || !widget) return;
    const estimate = widget.estimatedHeight;
    measured.push({ kind, estimated: estimate < 0 ? view!.defaultLineHeight : estimate, rendered: block.height });
  };
  view.viewportLineBlocks.forEach(visit);
  return measured;
};

const blockKind = (block: BlockInfo) =>
  block.widget instanceof CollapseWidget
    ? "collapse"
    : block.widget instanceof HiddenLineWidget
      ? "hidden line"
      : (widgetKind(block.widget) ?? (block.widget ? "other widget" : "text"));

const blockHeights = () => {
  if (!view) return { row: 0, blocks: [] };
  const blocks: { at: string; kind: string; height: number }[] = [];
  const visit = (block: BlockInfo, index: number) => {
    if (Array.isArray(block.type)) {
      block.type.forEach(visit);
      return;
    }
    blocks.push({ at: `${block.from}-${block.to}:${index}`, kind: blockKind(block), height: block.height });
  };
  for (let position = 0; position <= view.state.doc.length; ) {
    const block = view.lineBlockAt(position);
    visit(block, 0);
    position = block.to + 1;
  }
  return { row: view.defaultLineHeight, blocks };
};

const lineDrift = () => {
  if (!view) return [];
  const drifts: { line: number; drawn: number; placed: number }[] = [];
  for (const { from, to } of view.visibleRanges) {
    for (let position = from; position <= to; ) {
      const line = view.state.doc.lineAt(position);
      position = line.to + 1;
      const node = view.domAtPos(line.from).node;
      const element = (node instanceof Element ? node : node.parentElement)?.closest(".cm-line");
      if (!element || element.parentElement !== view.contentDOM) continue;
      const rect = element.getBoundingClientRect();
      if (rect.height < 1) continue;
      const placed = view.lineBlockAt(line.from);
      const top = Array.isArray(placed.type) ? (placed.type.find((block) => block.type === BlockType.Text)?.top ?? placed.top) : placed.top;
      drifts.push({ line: line.number, drawn: rect.top - view.documentTop, placed: top });
    }
  }
  return drifts;
};

Object.assign(window, { renderScreenplay: render, titlePageEstimate, widgetHeights, blockHeights, lineDrift });
