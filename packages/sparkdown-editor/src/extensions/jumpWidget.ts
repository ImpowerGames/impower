import { syntaxTree } from "@codemirror/language";
import { Extension, Facet, Range } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import { SparkProgram } from "../../../sparkdown/src/types/SparkProgram";
import { getRelativeSection } from "../../../sparkdown/src/utils/getRelativeSection";
import { getSectionAt } from "../../../sparkdown/src/utils/getSectionAt";
import { Type } from "../types/type";
import { JumpWidgetType } from "./JumpWidgetType";

const parseContextState = Facet.define<{ program?: SparkProgram }>({});

const jumpDecorations = (view: EditorView): DecorationSet => {
  const widgets: Range<Decoration>[] = [];
  view.visibleRanges.forEach(({ from, to }) => {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        const type = node?.type;
        const from = node?.from;
        const to = node?.to;
        const [parseContext] = view.state.facet(parseContextState);
        if (parseContext?.program) {
          if (type.id === Type.JumpSectionName) {
            const sectionText = view.state.doc.sliceString(from, to);
            const [sectionId] = getSectionAt(from, parseContext.program);
            if (parseContext.program.sections) {
              const [, relativeSection] = getRelativeSection(
                sectionId,
                parseContext.program.sections,
                sectionText as ">" | "]" | "[" | "^"
              );
              const name = relativeSection?.name;
              if (name != null) {
                const deco = Decoration.widget({
                  widget: new JumpWidgetType(name),
                  side: 1,
                });
                widgets.push(deco.range(to));
              }
            }
          }
        }
      },
    });
  });
  return Decoration.set(widgets);
};

export const jumpWidgetPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = jumpDecorations(view);
    }

    update(update: ViewUpdate): void {
      this.decorations = jumpDecorations(update.view);
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);

export const jumpWidget = (options: {
  parseContext: {
    program: SparkProgram;
  };
}): Extension => {
  return [parseContextState.of(options.parseContext), jumpWidgetPlugin];
};
