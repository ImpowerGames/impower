import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { ColorSchemeSetting } from "../../../../core/classes/messages/SetSimulatedColorSchemeMessage";

export type SetThemeMethod = typeof SetThemeMessage.method;

export interface SetThemeParams {
  breakpoints: Record<string, number>;
  root_text_size?: string;
  color_scheme?: ColorSchemeSetting;
  variables: string[];
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
