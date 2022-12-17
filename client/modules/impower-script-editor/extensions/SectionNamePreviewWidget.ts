import { syntaxTree } from "@codemirror/language";
import { Extension, Facet } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import {
  getRelativeSection,
  getSectionAt,
  SparkParseResult,
} from "../../../../sparkdown";
import { SectionNamePreviewWidgetType } from "./SectionNamePreviewWidgetType";

const parseContextState = Facet.define<{ result?: SparkParseResult }>({});

const sectionNameDecorations = (view: EditorView): DecorationSet => {
  const widgets = [];
  view.visibleRanges.forEach(({ from, to }) => {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        const type = node?.type;
        const from = node?.from;
        const to = node?.to;
        const [parseContext] = view.state.facet(parseContextState);
        if (type.name === "GoSectionName" || type.name === "ChoiceGoName") {
          const sectionText = view.state.doc.sliceString(from, to);
          const [sectionId] = getSectionAt(from, parseContext.result);
          const [, relativeSection] = getRelativeSection(
            sectionId,
            parseContext.result?.sections,
            sectionText as ">" | "]" | "[" | "^"
          );
          const name = relativeSection?.name;
          if (name != null) {
            const deco = Decoration.widget({
              widget: new SectionNamePreviewWidgetType(name),
              side: 1,
            });
            widgets.push(deco.range(to));
          }
        }
      },
    });
  });
  return Decoration.set(widgets);
};

export const sectionNamePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = sectionNameDecorations(view);
    }

    update(update: ViewUpdate): void {
      this.decorations = sectionNameDecorations(update.view);
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);

export const sectionNamePreviewWidget = (
  options: {
    parseContext?: {
      result: SparkParseResult;
    };
  } = {}
): Extension => {
  return [parseContextState.of(options.parseContext), sectionNamePlugin];
};
