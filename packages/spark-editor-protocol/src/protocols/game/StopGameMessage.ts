import { MessageProtocolRequestType } from "../MessageProtocolRequestType";

export type StopGameMethod = typeof StopGameMessage.method;

export namespace StopGameMessage {
  export const method = "game/stop";
  export const type = new MessageProtocolRequestType<StopGameMethod, {}, null>(
    StopGameMessage.method
  );
}
