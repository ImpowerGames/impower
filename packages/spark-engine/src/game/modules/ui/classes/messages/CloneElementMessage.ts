import { MessageProtocolRequestType } from "../../../../core/classes/MessageProtocolRequestType";

export type CloneElementMethod = typeof CloneElementMessage.method;

export interface CloneElementParams {
  targetId: string;
  newId: string;
}

export class CloneElementMessage {
  static readonly method = "ui/clone";
  static readonly type = new MessageProtocolRequestType<
    CloneElementMethod,
    CloneElementParams,
    string
  >(CloneElementMessage.method);
}

export interface CloneElementMessageMap extends Record<string, [any, any]> {
  [CloneElementMessage.method]: [
    ReturnType<typeof CloneElementMessage.type.request>,
    ReturnType<typeof CloneElementMessage.type.response>
  ];
}
