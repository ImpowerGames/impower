import { MessageProtocolNotificationType } from "@impower/jsonrpc/src/common/classes/MessageProtocolNotificationType";
import type { WriteImageInstruction } from "../../../ui/classes/messages/WriteImageMessage";

export interface DrawAheadPicture {
  target: string;
  distance: number;
  zoom: number;
  scale: number;
  content: NonNullable<WriteImageInstruction["content"]>;
}

export interface DrawAheadParams {
  pictures: DrawAheadPicture[];
}

export type DrawAheadMethod = typeof DrawAheadMessage.method;

export class DrawAheadMessage {
  static readonly method = "assets/draw";
  static readonly type = new MessageProtocolNotificationType<
    DrawAheadMethod,
    DrawAheadParams
  >(DrawAheadMessage.method);
}

export interface DrawAheadMessageMap extends Record<string, [any]> {
  [DrawAheadMessage.method]: [
    ReturnType<typeof DrawAheadMessage.type.notification>,
  ];
}
