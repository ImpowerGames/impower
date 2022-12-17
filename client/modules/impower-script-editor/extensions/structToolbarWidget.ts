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
  getAllPropertyRequirements,
  setProperty,
} from "../../../../spark-engine";
import {
  SparkParseResult,
  SparkStructToken,
  yamlStringify,
} from "../../../../sparkdown";
import { Type } from "../types/type";
import { sparkValidations } from "../utils/sparkValidations";
import { StructToolbarWidgetType } from "./StructToolbarWidgetType";

const parseContextState = Facet.define<{ result?: SparkParseResult }>({});

const structToolbarDecorations = (view: EditorView): DecorationSet => {
  const widgets = [];
  view.visibleRanges.forEach(({ from, to }) => {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        const type = node?.type;
        const to = node?.to;
        if (type.id === Type.StructColon) {
          widgets.push(
            Decoration.widget({
              widget: new StructToolbarWidgetType(),
              side: 0,
            }).range(to)
          );
        }
      },
    });
  });
  return Decoration.set(widgets);
};

const autofillStruct = (view: EditorView, pos: number): boolean => {
  const [parseContext] = view.state.facet(parseContextState);
  const line = view.state.doc.lineAt(pos);
  const result = parseContext.result;
  const tokenIndex = result.tokenLines[line.number];
  const structToken = result.tokens[tokenIndex] as SparkStructToken;
  const structName = structToken?.name;
  const struct = result.structs[structName || ""];
  const structType = struct?.type;
  const validation = sparkValidations[structType];
  const requirements = getAllPropertyRequirements(validation);
  const newFields = {};
  const from = line.to;
  let to = from;
  Object.values(struct.fields).forEach((f) => {
    if (f.to > from) {
      to = f.to;
    }
  });
  Object.entries(requirements).forEach(([p, v]) => {
    const existingField = struct.fields[p];
    if (existingField) {
      setProperty(newFields, p, existingField.value);
    } else {
      const defaultValue = v[0];
      if (!Array.isArray(defaultValue) || defaultValue.length > 0) {
        setProperty(newFields, p, defaultValue);
      }
    }
  });
  const lineSeparator = `\n${"".padEnd(structToken.offset + 2, " ")}`;
  let insert = lineSeparator;
  insert += yamlStringify(newFields, lineSeparator);
  const change = { from, to, insert };
  view.dispatch({ changes: change });
  return true;
};

export const structToolbarPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = structToolbarDecorations(view);
    }

    update(update: ViewUpdate): void {
      this.decorations = structToolbarDecorations(update.view);
    }
  },
  {
    decorations: (v) => v.decorations,
    eventHandlers: {
      mousedown: (e, view) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains("cm-struct-toolbar-autofill")) {
          return autofillStruct(view, view.posAtDOM(target));
        }
        return false;
      },
    },
  }
);

export const structToolbarWidget = (
  options: {
    parseContext?: {
      result: SparkParseResult;
    };
  } = {}
): Extension => {
  return [parseContextState.of(options.parseContext), structToolbarPlugin];
};
