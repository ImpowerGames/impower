import { MessageProtocolRequestType } from "../../../../core/classes/MessageProtocolRequestType";
import { LogData } from "../../types/LogData";

export type DebugLogMethod = typeof DebugLogMessage.method;

export class DebugLogMessage {
  static readonly method = "debug/log";
  static readonly type = new MessageProtocolRequestType<
    DebugLogMethod,
    LogData,
    string
  >(DebugLogMessage.method);
}

export interface DebugLogMessageMap extends Record<string, [any, any]> {
  [DebugLogMessage.method]: [
    ReturnType<typeof DebugLogMessage.type.request>,
    ReturnType<typeof DebugLogMessage.type.response>
  ];
}
