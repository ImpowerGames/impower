import { onProtocolMessage } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { SetPreviewThemeMessage } from "@impower/spark-editor-protocol/src/protocols/preview/SetPreviewThemeMessage";

export const followPreviewTheme = (
  root: HTMLElement,
  target: EventTarget = window,
): (() => void) =>
  onProtocolMessage(
    SetPreviewThemeMessage.type,
    (message) => {
      root.dataset["theme"] = message.params.theme;
    },
    target,
  );
