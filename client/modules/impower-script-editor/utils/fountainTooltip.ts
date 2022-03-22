import { EditorView } from "@codemirror/basic-setup";
import { Tooltip } from "@codemirror/tooltip";
import {
  FountainParseResult,
  FountainReference,
} from "../../impower-script-parser";

const getFountainReferenceAt = (
  lineNumber: number,
  pos: number,
  result: FountainParseResult
): FountainReference => {
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

export const fountainTooltip = (
  view: EditorView,
  pos: number,
  side: 1 | -1,
  parseContext: {
    result: FountainParseResult;
  },
  getRuntimeValue?: (id: string) => string | number | boolean,
  setRuntimeValue?: (id: string, expression: string) => void
): Tooltip | Promise<Tooltip> => {
  const line = view.state.doc.lineAt(pos);
  const token = getFountainReferenceAt(line.number, pos, parseContext?.result);
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
      const isString = typeof item?.value === "string";
      const runtimeValue = getRuntimeValue?.(token.id);
      const dom = document.createElement("div");
      dom.className = "cm-valueInfo";
      dom.style.padding = "4px 8px";
      dom.style.display = "flex";
      dom.style.alignItems = "center";

      if (runtimeValue != null) {
        const input = document.createElement("input");
        input.style.maxWidth = isString ? undefined : "48px";
        input.style.backgroundColor = "transparent";
        input.style.color = "white";
        input.style.padding = "2px 4px";
        input.value = String(runtimeValue);
        input.readOnly =
          item?.type !== "string" &&
          item?.type !== "number" &&
          item?.type !== "boolean" &&
          item?.type !== "object" &&
          item?.type !== "enum";
        if (input.readOnly) {
          input.style.opacity = "0.5";
        }
        input.onchange = (e): void => {
          const target = e.target as HTMLInputElement;
          const expression = target.value;
          setRuntimeValue?.(token.id, expression);
        };
        const typeText = document.createTextNode(item?.type);
        dom.appendChild(typeText);
        const separator = document.createElement("div");
        separator.style.minWidth = "8px";
        dom.appendChild(separator);
        if (isString) {
          dom.appendChild(document.createTextNode("`"));
        }
        dom.appendChild(input);
        if (isString) {
          dom.appendChild(document.createTextNode("`"));
        }
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
