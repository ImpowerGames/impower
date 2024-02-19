import { MessageProtocolRequestType } from "../../../../core/classes/MessageProtocolRequestType";

export type SetThemeMethod = typeof SetThemeMessage.method;

export interface SetThemeParams {
  breakpoints: Record<string, number>;
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
    ReturnType<typeof SetThemeMessage.type.response>
  ];
}
