import { syntaxTree } from "@codemirror/language";
import { Extension, Facet } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";
import { getAllPropertyRequirements } from "../../../../spark-engine";
import { SparkParseResult, SparkStructFieldToken } from "../../../../sparkdown";
import { Type } from "../types/type";
import { sparkValidations } from "../utils/sparkValidations";
import { StructFieldValueWidgetType } from "./StructFieldValueWidgetType";

const parseContextState = Facet.define<{ result?: SparkParseResult }>({});

const STRUCT_FIELD_WIDGET_EDIT_EVENT = "struct-field-widget-edit";

const structFieldValueDecorations = (
  view: EditorView,
  callbacks?: {
    onDragStart?: (id: string, dom: HTMLElement, startX: number) => void;
    onDragEnd?: (
      id: string,
      dom: HTMLElement,
      startX: number,
      x: number
    ) => void;
  }
): DecorationSet => {
  const widgets = [];
  view.visibleRanges.forEach(({ from, to }) => {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        const type = node?.type;
        if (type.id === Type.StructFieldValue) {
          const from = node?.from;
          const to = node?.to;
          const [parseContext] = view.state.facet(parseContextState);
          const line = view.state.doc.lineAt(to);
          const result = parseContext.result;
          const tokenIndex = result.tokenLines[line.number];
          const structFieldToken = result.tokens[
            tokenIndex
          ] as SparkStructFieldToken;
          if (structFieldToken) {
            const structName = structFieldToken?.struct;
            const struct = result.structs[structName || ""];
            const structType = struct?.type;
            const validation = sparkValidations[structType];
            const requirements = getAllPropertyRequirements(validation);
            const requirement = requirements[structFieldToken.id];
            const defaultValue = requirement?.[0];
            const range = requirement?.[1];
            const fieldType = typeof defaultValue;
            const id = structName + structFieldToken.id;
            const startValue = view.state.doc.sliceString(from, to);
            let value = startValue;
            if (["number", "string", "boolean"].includes(fieldType)) {
              const onDragging = (
                id: string,
                dom: HTMLElement,
                startX: number,
                x: number
              ): void => {
                const deltaX = x - startX;
                // console.log(deltaX);
                if (fieldType === "number") {
                  const min = (range?.[0] as number) ?? 0;
                  const max = (range?.[1] as number) ?? 100;
                } else if (fieldType === "string") {
                  const options = range as string[];
                } else if (fieldType === "boolean") {
                  const insert = deltaX < 0 ? "false" : "true";
                  if (insert !== value) {
                    const changes = { from, to: from + value.length, insert };
                    value = insert;
                    // TODO: Use Decoration.replace to show live updating value while dragging
                    // view.dispatch({
                    //   changes,
                    //   userEvent: STRUCT_FIELD_WIDGET_EDIT_EVENT,
                    // });
                  }
                }
              };
              widgets.push(
                Decoration.widget({
                  widget: new StructFieldValueWidgetType(id, {
                    ...(callbacks || {}),
                    onDragging,
                  }),
                  side: 0,
                }).range(to)
              );
            }
          }
        }
      },
    });
  });
  return Decoration.set(widgets);
};

export const structFieldValuePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = structFieldValueDecorations(view);
    }

    update(update: ViewUpdate): void {
      this.decorations = structFieldValueDecorations(update.view);
    }
  },
  {
    decorations: (v) => v.decorations,
    eventHandlers: {
      mousedown: (e, view) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains("cm-struct-field-widget-button")) {
          return true;
        }
        return false;
      },
    },
  }
);

export const structFieldValueWidget = (
  options: {
    parseContext?: {
      result: SparkParseResult;
    };
  } = {}
): Extension => {
  return [parseContextState.of(options.parseContext), structFieldValuePlugin];
};
