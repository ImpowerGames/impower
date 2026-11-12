import { MessageProtocolRequestType } from "@impower/jsonrpc/src/common/classes/MessageProtocolRequestType";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import type { ResponseMessage } from "@impower/jsonrpc/src/common/types/ResponseMessage";

export type SetSimulatedColorSchemeMethod =
  typeof SetSimulatedColorSchemeMessage.method;

export const COLOR_SCHEMES = ["light", "dark"] as const;

export type ColorScheme = (typeof COLOR_SCHEMES)[number];

export const COLOR_SCHEME_SETTINGS = ["system", ...COLOR_SCHEMES] as const;

export type ColorSchemeSetting = (typeof COLOR_SCHEME_SETTINGS)[number];

export interface SetSimulatedColorSchemeParams {
  color_scheme: ColorScheme;
}

export interface SetSimulatedColorSchemeResult {}

export class SetSimulatedColorSchemeMessage {
  static readonly method = "game/setSimulatedColorScheme";
  static readonly type = new MessageProtocolRequestType<
    SetSimulatedColorSchemeMethod,
    SetSimulatedColorSchemeParams,
    SetSimulatedColorSchemeResult
  >(SetSimulatedColorSchemeMessage.method);
}

export namespace SetSimulatedColorSchemeMessage {
  export interface Request extends RequestMessage<
    SetSimulatedColorSchemeMethod,
    SetSimulatedColorSchemeParams,
    SetSimulatedColorSchemeResult
  > {}
  export type Response = ResponseMessage<
    SetSimulatedColorSchemeMethod,
    SetSimulatedColorSchemeResult
  >;
}
