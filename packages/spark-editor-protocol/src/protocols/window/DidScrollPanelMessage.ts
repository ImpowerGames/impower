import { Range } from "../../types";
import { MessageProtocolNotificationType } from "../MessageProtocolNotificationType";

export type DidScrollPanelMethod = typeof DidScrollPanelMessage.method;

export interface DidScrollPanelParams {
  pane: string;
  panel: string;
  range: Range;
}

export namespace DidScrollPanelMessage {
  export const method = "window/didScrollPanel";
  export const type = new MessageProtocolNotificationType<
    DidScrollPanelMethod,
    DidScrollPanelParams
  >(DidScrollPanelMessage.method);
}
