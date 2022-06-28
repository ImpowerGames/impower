import { EditorView } from "@codemirror/basic-setup";
import { Tooltip } from "@codemirror/tooltip";
import { SparkParseResult, SparkReference } from "../../impower-script-parser";

const getSparkReferenceAt = (
  lineNumber: number,
  pos: number,
  result: SparkParseResult
): SparkReference => {
  if (!result?.references) {
    return undefined;
  }
  const lineReferences = result?.references[lineNumber];
  if (lineReferences) {
    for (let i = 0; i < lineReferences.length; i += 1) {
      const found = lineReferences[i];
      if (pos >= found.from && pos <= found.to) {
        return found;
      }
    }
  }
  return null;
};

export const sparkTooltip = (
  view: EditorView,
  pos: number,
  side: 1 | -1,
  parseContext: {
    result: SparkParseResult;
  },
  getRuntimeValue?: (id: string) => unknown,
  setRuntimeValue?: (id: string, expression: string) => void,
  observeRuntimeValue?: (listener: (id: string, value: unknown) => void) => void
): Tooltip | Promise<Tooltip> => {
  const line = view.state.doc.lineAt(pos);
  const token = getSparkReferenceAt(line.number, pos, parseContext?.result);
  if (!token) {
    return null;
  }
  return {
    pos: token?.from,
    end: token?.to,
    above: true,
    create: (): { dom: HTMLDivElement } => {
      const context = {
        ...(parseContext?.result?.sections || {}),
        ...(parseContext?.result?.tags || {}),
        ...(parseContext?.result?.entities || {}),
        ...(parseContext?.result?.assets || {}),
        ...(parseContext?.result?.variables || {}),
      };
      const item = token.id ? context[token.id] : undefined;
      const runtimeValue = getRuntimeValue?.(token.id);
      const dom = document.createElement("div");
      dom.className = "cm-valueInfo";
      dom.style.padding = "4px 8px";
      dom.style.display = "flex";
      dom.style.alignItems = "center";

      if (runtimeValue != null) {
        const input = document.createElement("input");
        const itemValue = (item as { value: unknown })?.value;
        const isString = typeof itemValue === "string";
        input.style.maxWidth = isString ? undefined : "48px";
        input.style.backgroundColor = "transparent";
        input.style.color = "white";
        input.style.padding = "2px 4px";
        input.value = String(runtimeValue);
        input.readOnly =
          item?.type !== "string" &&
          item?.type !== "number" &&
          item?.type !== "boolean" &&
          item?.type !== "list" &&
          item?.type !== "map" &&
          item?.type !== "struct" &&
          item?.type !== "config";
        if (input.readOnly) {
          input.style.opacity = "0.5";
        }
        input.onchange = (e): void => {
          const target = e.target as HTMLInputElement;
          const expression = target.value;
          setRuntimeValue?.(token.id, expression);
        };
        const onRuntimeValueChange = (id: string, value: unknown): void => {
          if (id === token?.id) {
            if (input) {
              input.value = String(value);
            }
          }
        };
        observeRuntimeValue(onRuntimeValueChange);
        const typeText = document.createTextNode(item?.type);
        dom.appendChild(typeText);
        const separator = document.createElement("div");
        separator.style.minWidth = "8px";
        dom.appendChild(separator);
        dom.appendChild(input);
      } else if (item?.type) {
        if (item?.type === "image" || item?.type === "audio") {
          const fileUrl = item?.value;
          const preview = document.createElement(
            item?.type === "audio" ? "audio" : "img"
          );
          const rgx = /%2F([0-9][0-9][0-9])[?]/;
          const match = fileUrl.match(rgx);
          const storageName = match?.[1];
          const previewPrefix = "THUMB_";
          const previewUrl =
            match && item?.type === "image"
              ? fileUrl.replace(rgx, `%2F${previewPrefix}${storageName}?`)
              : undefined;
          preview.src = previewUrl || fileUrl;
          preview.style.width = "100px";
          preview.style.height = "100px";
          preview.style.objectFit = "contain";
          preview.style.backgroundColor = "white";
          dom.appendChild(preview);
        } else {
          const typeText = document.createTextNode(
            item?.type === "function"
              ? `${item?.returnType} ${item?.type}`
              : item?.type
          );
          dom.appendChild(typeText);
        }
      } else {
        return { dom: document.createElement("div") };
      }

      return { dom };
    },
  };
};
