import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";

export type SetThemeMethod = typeof SetThemeMessage.method;

export interface SetThemeParams {
  breakpoints: Record<string, number>;
  /** Base size every `rem` resolves against, applied to the host document's
   *  root element. Empty/undefined leaves the host document alone. */
  root_text_size?: string;
}

export class SetThemeMessage {
  static readonly method = "ui/theme";
  static readonly type = new MessageProtocolRequestType<
    SetThemeMethod,
    SetThemeParams,
    string
  >(SetThemeMessage.method);
}

export interface SetThemeMessageMap extends Record<string, [any, any]> {
  [SetThemeMessage.method]: [
    ReturnType<typeof SetThemeMessage.type.request>,
    ReturnType<typeof SetThemeMessage.type.response>,
  ];
}
