import { EditorView, Tooltip } from "@codemirror/view";
import { SparkProgram } from "../../../sparkdown/src/types/SparkProgram";
import { SparkReference } from "../../../sparkdown/src/types/SparkReference";

const getSparkReferenceAt = (
  lineNumber: number,
  pos: number,
  program: SparkProgram
): SparkReference | null => {
  if (!program?.metadata?.lines) {
    return null;
  }
  const line = program?.metadata?.lines[lineNumber];
  if (line?.references) {
    for (let i = 0; i < line?.references.length; i += 1) {
      const found = line?.references[i];
      if (found && pos >= found.from && pos <= found.to) {
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
    program: SparkProgram;
  },
  getRuntimeValue?: (id: string) => unknown,
  setRuntimeValue?: (id: string, expression: string) => void,
  observeRuntimeValue?: (listener: (id: string, value: unknown) => void) => void
): Tooltip | null | Promise<Tooltip | null> => {
  const line = view.state.doc.lineAt(pos);
  const token = getSparkReferenceAt(line.number, pos, parseContext?.program);
  if (!token || token.declaration) {
    return null;
  }
  return {
    pos: token?.from,
    end: token?.to,
    above: true,
    create: (): { dom: HTMLDivElement } => {
      const dom = document.createElement("div");
      const context = {
        ...(parseContext?.program?.sections || {}),
        ...(parseContext?.program?.structs || {}),
        ...(parseContext?.program?.variables || {}),
      };
      const tokenId = token.id;
      const item = tokenId ? context[tokenId] : undefined;
      if (tokenId) {
        const runtimeValue = getRuntimeValue?.(tokenId);
        dom.className = "cm-valueInfo";
        dom.style.padding = "4px 8px";
        dom.style.display = "flex";
        dom.style.alignItems = "center";

        if (runtimeValue != null) {
          const input = document.createElement("input");
          const itemValue = (item as { value: unknown })?.value;
          const isString = typeof itemValue === "string";
          input.style.maxWidth = isString ? "" : "48px";
          input.style.backgroundColor = "transparent";
          input.style.color = "white";
          input.style.padding = "2px 4px";
          input.value = String(runtimeValue);
          input.readOnly =
            item?.type !== "string" &&
            item?.type !== "number" &&
            item?.type !== "boolean";
          if (input.readOnly) {
            input.style.opacity = "0.5";
          }
          input.onchange = (e): void => {
            const target = e.target as HTMLInputElement;
            const expression = target.value;
            setRuntimeValue?.(tokenId, expression);
          };
          const onRuntimeValueChange = (id: string, value: unknown): void => {
            if (id === token?.id) {
              if (input) {
                input.value = String(value);
              }
            }
          };
          observeRuntimeValue?.(onRuntimeValueChange);
          const type = item?.type;
          if (type) {
            const typeText = document.createTextNode(type);
            dom.appendChild(typeText);
            const separator = document.createElement("div");
            separator.style.minWidth = "8px";
            dom.appendChild(separator);
            dom.appendChild(input);
          }
        } else if (item?.type) {
          const type = (item as { type: string })?.type;
          const value = (item as { value: unknown })?.value;
          const returnType = (item as { returnType: unknown })?.returnType;
          if (type === "image" || type === "audio") {
            const fileUrl = value as string;
            const preview = document.createElement(
              type === "audio" ? "audio" : "img"
            );
            const rgx = /%2F([0-9][0-9][0-9])[?]/;
            const match = fileUrl.match(rgx);
            const storageName = match?.[1];
            const previewPrefix = "THUMB_";
            const previewUrl =
              match && type === "image"
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
              type === "function" ? `${returnType} ${type}` : type
            );
            dom.appendChild(typeText);
          }
        } else {
          return { dom: document.createElement("div") };
        }
      }

      return { dom };
    },
  };
};
