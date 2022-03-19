import { EditorView } from "@codemirror/basic-setup";
import { Tooltip } from "@codemirror/tooltip";
import {
  FountainParseResult,
  FountainReference,
} from "../../impower-script-parser";

const getFountainReferenceAt = (
  pos: number,
  result: FountainParseResult
): FountainReference => {
  if (!result?.references) {
    return undefined;
  }
  let hovered: FountainReference;
  for (let i = 0; i < result?.references.length; i += 1) {
    const found = result?.references[i];
    if (found.from > pos) {
      if (hovered && hovered.to > pos) {
        return hovered;
      }
      return null;
    }
    hovered = found;
  }
  if (hovered && hovered.to > pos) {
    return hovered;
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
  const result = parseContext?.result;
  const token = getFountainReferenceAt(pos, result);
  if (!token) {
    return null;
  }
  const context = {
    ...result.sections,
    ...result.tags,
    ...result.entities,
    ...result.assets,
    ...result.variables,
  };
  const item = token.id ? context[token.id] : undefined;
  const isString = typeof item?.value === "string";
  const runtimeValue = getRuntimeValue?.(token.id);
  return {
    pos: token?.from,
    end: token?.to,
    above: true,
    create: (): { dom: HTMLDivElement } => {
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
      } else if (item?.valueText) {
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
          const typeText = document.createTextNode(item?.type);
          dom.appendChild(typeText);
          if (item?.valueText) {
            const separator = document.createTextNode(` : `);
            dom.appendChild(separator);
            const valueText = document.createTextNode(item?.valueText);
            dom.appendChild(valueText);
          }
        }
      } else {
        return { dom: document.createElement("div") };
      }

      return { dom };
    },
  };
};
