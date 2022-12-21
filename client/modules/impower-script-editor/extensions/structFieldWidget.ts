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
import { StructFieldNameWidgetType } from "./StructFieldNameWidgetType";
import { StructFieldValueWidgetType } from "./StructFieldValueWidgetType";

const parseContextState = Facet.define<{ result?: SparkParseResult }>({});

const structFieldDecorations = (view: EditorView): DecorationSet => {
  const widgets = [];
  view.visibleRanges.forEach(({ from, to }) => {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        const type = node?.type;
        if (type.id === Type.StructFieldName) {
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
            const defaultName = requirement?.[0];
            const id = `${structName}${structFieldToken.id}`;
            if (["number", "string", "boolean"].includes(typeof defaultName)) {
              widgets.push(
                Decoration.widget({
                  widget: new StructFieldNameWidgetType(id),
                }).range(from)
              );
            }
          }
        }
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
            const structField = struct.fields[structFieldToken.id];
            const startValue = structField?.value;
            const structType = struct?.type;
            const validation = sparkValidations[structType];
            const requirements = getAllPropertyRequirements(validation);
            const requirement = requirements[structFieldToken.id];
            const defaultValue = requirement?.[0];
            const range = requirement?.[1];
            const id = `${structName}${structFieldToken.id}`;
            if (["number", "string", "boolean"].includes(typeof defaultValue)) {
              const onDragEnd = (
                event: MouseEvent,
                previewEl: HTMLElement
              ): void => {
                const insert = previewEl.textContent;
                const valueEl = document.getElementsByClassName(
                  id
                )?.[0] as HTMLElement;
                const from = view.posAtDOM(valueEl);
                const to = view.state.doc.lineAt(from).to;
                const changes = { from, to, insert };
                view.dispatch({ changes });
              };
              widgets.push(
                Decoration.widget({
                  widget: new StructFieldValueWidgetType(
                    id,
                    view.state.doc.sliceString(from, to),
                    startValue,
                    range,
                    { onDragEnd }
                  ),
                }).range(from),
                Decoration.mark({ class: id }).range(from, to)
              );
            }
          }
        }
      },
    });
  });
  return Decoration.set(widgets);
};

export const structFieldPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = structFieldDecorations(view);
    }

    update(update: ViewUpdate): void {
      this.decorations = structFieldDecorations(update.view);
    }
  },
  {
    decorations: (v) => v.decorations,
  }
);

export const structFieldWidget = (
  options: {
    parseContext?: {
      result: SparkParseResult;
    };
  } = {}
): Extension => {
  return [parseContextState.of(options.parseContext), structFieldPlugin];
};
