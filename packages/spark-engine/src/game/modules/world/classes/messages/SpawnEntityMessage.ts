import { MessageProtocolRequestType } from "../../../../core/classes/MessageProtocolRequestType";
import { EntityUpdate } from "../../types/EntityUpdate";

export type SpawnEntityMethod = typeof SpawnEntityMessage.method;

export class SpawnEntityMessage {
  static readonly method = "world/spawnentity";
  static readonly type = new MessageProtocolRequestType<
    SpawnEntityMethod,
    EntityUpdate,
    string
  >(SpawnEntityMessage.method);
}

export interface SpawnEntityMessageMap extends Record<string, [any, any]> {
  [SpawnEntityMessage.method]: [
    ReturnType<typeof SpawnEntityMessage.type.request>,
    ReturnType<typeof SpawnEntityMessage.type.response>
  ];
}
