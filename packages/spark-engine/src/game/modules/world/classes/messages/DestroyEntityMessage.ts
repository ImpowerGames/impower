import { MessageProtocolRequestType } from "../../../../core/classes/MessageProtocolRequestType";
import { EntityUpdate } from "../../types/EntityUpdate";

export type DestroyEntityMethod = typeof DestroyEntityMessage.method;

export class DestroyEntityMessage {
  static readonly method = "world/destroyentity";
  static readonly type = new MessageProtocolRequestType<
    DestroyEntityMethod,
    EntityUpdate,
    string
  >(DestroyEntityMessage.method);
}

export interface DestroyEntityMessageMap extends Record<string, [any, any]> {
  [DestroyEntityMessage.method]: [
    ReturnType<typeof DestroyEntityMessage.type.request>,
    ReturnType<typeof DestroyEntityMessage.type.response>
  ];
}
