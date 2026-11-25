import type { IMessage } from "@impower/jsonrpc/src/common/types/IMessage";
import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import type { DocumentLocation } from "../../../../core/types/DocumentLocation";

export type BeatMethod = typeof BeatMessage.method;

export interface BeatParams {
  messages: IMessage[];
  time?: number;
  sweep?: boolean;
  source?: DocumentLocation;
}

export class BeatMessage {
  static readonly method = "ui/beat";
  static readonly type = new MessageProtocolNotificationType<
    BeatMethod,
    BeatParams
  >(BeatMessage.method);
}

export interface BeatMessageMap extends Record<string, [any, any]> {
  [BeatMessage.method]: [
    ReturnType<typeof BeatMessage.type.notification>,
    undefined,
  ];
}
